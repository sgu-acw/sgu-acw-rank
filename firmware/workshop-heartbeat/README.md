# ESP8266 heartbeat

An ESP8266 replaces the Pi's SSH heartbeat with an HTTP POST. Everything on
the server side is shared with the Pi path — same API, same 90s TTL rule, same
`/status` shape. The token identifies the device, so the firmware never sends
an id.

**Not compiled or flashed here.** There is no ESP8266 toolchain on the machine
this was written on, so treat the first compile as the real review.

## Wiring the server side first

```bash
# on the origin host, after install-origin.sh
bash add-device.sh esp8266
```

That prints the token. Put it in `secrets.h`. Rotating is the same command;
revoking is `bash add-device.sh --remove esp8266`.

The device posts to `hb.hsn8086.com`, which is a **DNS-only** record pointing
at the origin. Two consequences worth understanding:

- A device reaching the origin directly gets the **RSA** origin certificate.
  The proxied hostname is served an ECDSA certificate by the Cloudflare edge,
  and BearSSL cannot validate ECDSA.
- Port 80 on that host does **not** redirect to https, so plain HTTP works.

## Build

```bash
arduino-cli config init
arduino-cli config add board_manager.additional_urls \
  https://arduino.esp8266.com/stable/package_esp8266com_index.json
arduino-cli core update-index
arduino-cli core install esp8266:esp8266

cp secrets.example.h secrets.h      # then fill it in

arduino-cli compile --fqbn esp8266:esp8266:d1_mini .
arduino-cli upload  --fqbn esp8266:esp8266:d1_mini -p /dev/ttyUSB0 .
```

Swap `d1_mini` for `nodemcuv2` or whatever matches the board.

A heartbeat over plain HTTP against the server, without flashing anything:

```bash
curl -X POST http://hb.hsn8086.com/heartbeat -H "X-Device-Token: <token>"
# {"ok": true, "device": "esp8266", "recorded": true}
```

## Two things that will bite

**2.4GHz only.** The ESP8266 has no 5GHz radio, so an SSID like
`OpenWrt_NekoRoom_5G` will never associate. There has to be a 2.4GHz SSID in
the workshop. A captive portal will also strand it.

**Deep sleep needs a wire.** `DEEP_SLEEP_SECONDS > 0` requires GPIO16 wired to
RST on most boards, otherwise the chip sleeps forever. Mains-powered is
simpler: leave `DEEP_SLEEP_SECONDS` at 0 and let it loop.

## Transport

Default is plain HTTP. The token travels in the clear, so anyone on the path
can read it and forge a heartbeat. The stakes are a status page saying 开门中,
which is why this is the default and not treated as a problem.

`USE_TLS 1` pins the origin's public key instead. It is not chain validation —
the origin serves a bare leaf with `CA:FALSE`, so there is no CA to anchor on —
and it covers the token and authenticates the server. The trade-off is that
reissuing the origin certificate means reflashing; re-provision the key with
the `openssl` line in the sketch.

## Reading the LED

One slow blink per successful beat. Four fast blinks when a beat fails after
retries. `LED_ACTIVE_LOW 1` suits the usual active-low LED on ESP-12 modules.
