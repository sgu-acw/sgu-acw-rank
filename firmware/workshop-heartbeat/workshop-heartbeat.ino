/*
 * Workshop heartbeat — ESP8266.
 *
 * POSTs /heartbeat on a timer. The device clock is never used to timestamp
 * anything; the server records the time it sees the request.
 *
 * Two ESP8266-specific constraints shaped this:
 *
 *   1. 2.4GHz only. It cannot join a 5GHz SSID such as "OpenWrt_NekoRoom_5G".
 *   2. Its TLS is BearSSL, and the Cloudflare edge serves an ECDSA certificate
 *      for the proxied hostname, which BearSSL cannot validate. So the target
 *      is hb.hsn8086.com — a DNS-only record pointing straight at the origin,
 *      which serves the RSA origin certificate.
 *
 * The default transport is plain HTTP to that origin. Set USE_TLS to 1 for a
 * pinned-key TLS connection. See README.md.
 *
 * Build: see README.md (arduino-cli, esp8266 core).
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>

#include "secrets.h"

#ifndef USE_TLS
#define USE_TLS 0
#endif
#ifndef BEAT_INTERVAL_SECONDS
#define BEAT_INTERVAL_SECONDS 30
#endif
#ifndef DEEP_SLEEP_SECONDS
#define DEEP_SLEEP_SECONDS 0
#endif
#ifndef WIFI_TIMEOUT_MS
#define WIFI_TIMEOUT_MS 20000
#endif
#ifndef HTTP_TIMEOUT_MS
#define HTTP_TIMEOUT_MS 8000
#endif
#ifndef BEAT_ATTEMPTS
#define BEAT_ATTEMPTS 3
#endif
#ifndef BEAT_RETRY_MS
#define BEAT_RETRY_MS 2000
#endif
#ifndef RESTART_AFTER_HOURS
#define RESTART_AFTER_HOURS 24
#endif
#ifndef LED_ACTIVE_LOW
#define LED_ACTIVE_LOW 1
#endif
#ifndef LED_PIN
#define LED_PIN LED_BUILTIN
#endif

#if USE_TLS
// Pinned public key of the origin certificate (RSA-2048, valid to 2041-09-24).
//
// Pinning rather than chain validation, deliberately: the origin serves a bare
// leaf carrying CA:FALSE, so there is no CA for BearSSL to anchor on. Pinning
// also means no NTP is needed, because there is no validity window to check.
// Re-provision with:
//   echo | openssl s_client -connect 154.9.228.109:443 \
//            -servername hb.hsn8086.com 2>/dev/null \
//     | openssl x509 -pubkey -noout
static const char ORIGIN_PUBKEY[] =
    "-----BEGIN PUBLIC KEY-----\n"
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq4BrEBhiZl0D6tCUi3F9\n"
    "FSumyEK9hWrtiL75ykrhu0550buMYu9y5Yx6dOp4yw197yyNztnd7d2n6caQqLBa\n"
    "6Zehlw+ZTfYV6jSErBSis9xmVMP59uX2uFeOAL+bFUR+505yY5CHAp4fIoOXZ779\n"
    "5vxt59p6YxOw/KmJPDd8Em4mlkTLyvzCyiCbONiO4sNWQHj9XieCtoSTJOVHWVde\n"
    "V3zNFvrjVw90kpKJXebLYQbAdx9ttmmgSFL9gKgYtM85pM+AkvjP7Ad8B1uKIVJs\n"
    "zfYnr+QxYEJSSqunQ8GOMUnR2VTFLizFR5cVzwtBNPHUIaFkxgfGiixXER6yIXEV\n"
    "9wIDAQAB\n"
    "-----END PUBLIC KEY-----\n";
#endif

static unsigned long awakeSeconds = 0;

static void led(bool on) {
#if LED_ACTIVE_LOW
  digitalWrite(LED_PIN, on ? LOW : HIGH);
#else
  digitalWrite(LED_PIN, on ? HIGH : LOW);
#endif
}

static void blink(int times, int holdMs) {
  for (int i = 0; i < times; i++) {
    led(true);
    delay(holdMs);
    led(false);
    delay(holdMs);
  }
}

static bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }
  Serial.print(F("[wifi] joining "));
  Serial.println(WIFI_SSID);

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.hostname("workshop-heartbeat");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
    delay(250);
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[wifi] timeout"));
    return false;
  }
  Serial.print(F("[wifi] up, "));
  Serial.println(WiFi.localIP());
  return true;
}

static bool beat() {
#if USE_TLS
  BearSSL::WiFiClientSecure client;
  static BearSSL::PublicKey pinned(ORIGIN_PUBKEY);
  client.setKnownKey(&pinned);
#else
  WiFiClient client;
#endif
  client.setTimeout(HTTP_TIMEOUT_MS);

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setReuse(false);

  if (!http.begin(client, HEARTBEAT_HOST, HEARTBEAT_PORT, HEARTBEAT_PATH)) {
    Serial.println(F("[beat] begin failed"));
    return false;
  }
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.addHeader("Content-Type", "text/plain");
  int status = http.POST(String());
  http.end();

  Serial.print(F("[beat] http "));
  Serial.println(status);
  return status >= 200 && status < 300;
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  led(false);
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println(F("workshop-heartbeat / esp8266"));

  Serial.print(F("[cfg] target "));
  Serial.print(USE_TLS ? F("https://") : F("http://"));
  Serial.print(HEARTBEAT_HOST);
  Serial.print(':');
  Serial.print(HEARTBEAT_PORT);
  Serial.println(HEARTBEAT_PATH);

#if DEEP_SLEEP_SECONDS > 0
  Serial.print(F("[cfg] deep sleep "));
  Serial.print(DEEP_SLEEP_SECONDS);
  Serial.println(F("s between beats"));
#else
  Serial.print(F("[cfg] beat every "));
  Serial.print(BEAT_INTERVAL_SECONDS);
  Serial.println(F("s"));
#endif
}

void loop() {
  bool ok = false;

  if (connectWifi()) {
    for (int attempt = 1; attempt <= BEAT_ATTEMPTS && !ok; attempt++) {
      ok = beat();
      if (!ok && attempt < BEAT_ATTEMPTS) {
        delay(BEAT_RETRY_MS);
      }
    }
  }

  // One blink: still online. Four fast blinks: something is wrong. Watching an
  // LED beats guessing whether the box is even powered.
  blink(ok ? 1 : 4, ok ? 150 : 60);

#if DEEP_SLEEP_SECONDS > 0
  Serial.println(F("[sys] sleeping"));
  Serial.flush();
  ESP.deepSleep((uint64_t)DEEP_SLEEP_SECONDS * 1000000ULL);
#else
  awakeSeconds += BEAT_INTERVAL_SECONDS;
  if (awakeSeconds >= (unsigned long)RESTART_AFTER_HOURS * 3600UL) {
    // Cheap insurance against the WiFi stack wedging in a way the watchdog
    // cannot see. A missed minute is harmless; a device that stays up but
    // stops beating reads as "closed", which is the safe direction anyway.
    Serial.println(F("[sys] scheduled restart"));
    Serial.flush();
    ESP.restart();
  }
  delay((unsigned long)BEAT_INTERVAL_SECONDS * 1000UL);
#endif
}
