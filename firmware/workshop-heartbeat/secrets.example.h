// Copy to secrets.h (which is gitignored) and fill in.
#pragma once

// 2.4GHz only on ESP8266. A "_5G" SSID will never associate.
#define WIFI_SSID "workshop-2g"
#define WIFI_PASSWORD "changeme"

// Ingest endpoint. hb.hsn8086.com is a DNS-only record pointing straight at the
// origin, so this reaches the RSA origin certificate rather than the ECDSA one
// Cloudflare serves on the proxied hostname.
#define HEARTBEAT_HOST "hb.hsn8086.com"
#define HEARTBEAT_PORT 80
#define HEARTBEAT_PATH "/heartbeat"

// From `bash add-device.sh esp8266` on the origin host.
#define DEVICE_TOKEN "paste-token-here"

// ---- optional overrides ----

// 1 = pinned-key TLS instead of plain HTTP. The key is embedded in the sketch.
#define USE_TLS 0

// Seconds between beats. Must stay comfortably under the server TTL (90s).
#define BEAT_INTERVAL_SECONDS 30

// >0 = deep sleep between beats (needs GPIO16 wired to RST on most boards).
#define DEEP_SLEEP_SECONDS 0

// 1 for the usual active-low LED on ESP-12 modules, 0 otherwise.
#define LED_ACTIVE_LOW 1
