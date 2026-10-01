# Workshop status

"What is the state of the workshop right now" is answered by one question: is
some device in the room still beating? Nothing else is measured.

```
 Pi (SSH)      ─┐
                ├─▶ /var/lib/workshop/devices/<id>   (epoch, one file per device)
 ESP8266 (HTTP)─┘              │
                               ▼
                      workshop-api  GET /status → {open, age, ttl, devices[]}
                               ▲
                               │
              OpenResty ── sgu-acw.hsn8086.com (proxied) ── browser
                       └── hb.hsn8086.com (DNS only)     ── microcontroller
```

`open` is not a stored flag. It is recomputed on every request: at least one
device beat within `WORKSHOP_TTL` (90s) or the workshop is closed. A device's
own clock is never trusted — the server records when it saw the request.

## Devices

Two ingest paths, deliberately different because the hardware is:

| | Who | Credential | Why |
| --- | --- | --- | --- |
| SSH | Raspberry Pi | key pinned to a forced command | the Pi is a real machine; the key can do nothing but write a timestamp |
| HTTP | microcontrollers | `POST /heartbeat` + `X-Device-Token` | an ESP8266 has ~40KB of heap and cannot run SSH |

The HTTP token *is* the device identity — the API maps it back to an id, so
firmware never sends an id. Each device gets its own file under
`/var/lib/workshop/devices/`. The old single-file `last_seen` still counts, as
device `pi`, so nothing breaks if you revert the API.

## Layout

| Path | Where it runs |
| --- | --- |
| `server/workshop-api.py` | origin, systemd unit `workshop-api` |
| `server/add-device.sh` | origin, add/rotate/revoke a device token |
| `server/workshop-heartbeat-recv.sh` | origin, the Pi's SSH forced command |
| `server/authorize-pi-key.sh` | origin, pins the Pi's key in `authorized_keys` |
| `server/install-origin.sh` | origin, installs everything including both vhosts |
| `server/openresty/*.conf` | origin, the two vhosts |
| `pi/install-pi.sh` | Pi, as the normal user, no sudo |
| `firmware/workshop-heartbeat/` | ESP8266 sketch + notes |

## Origin host

```bash
tar cz -C deploy/workshop-status server | ssh root@154.9.228.109 \
  'rm -rf /root/workshop-status && mkdir -p /root/workshop-status && tar xz -C /root/workshop-status'
ssh root@154.9.228.109 'cd /root/workshop-status/server && bash install-origin.sh'
ssh root@154.9.228.109 'cd /root/workshop-status/server && bash add-device.sh esp8266'
```

`install-origin.sh` is idempotent and restarts the service. Config lives in
`/etc/workshop-api.env`; device tokens in `/etc/workshop-api.devices` (0600).

The unit is `ProtectSystem=strict` with `ReadWritePaths=/var/lib/workshop`.
Without that second line every heartbeat write fails and the proxy turns the
crash into a 502 — which is exactly what happened the first time.

## Certificates

A Cloudflare **Origin CA** certificate for `*.hsn8086.com` / `hsn8086.com`,
installed once and reused by both vhosts. SSL mode is Full, not Full (strict).

## DNS

| Record | Proxy | Purpose |
| --- | --- | --- |
| `sgu-acw` | proxied | the browser-facing API; Cloudflare terminates TLS |
| `hb` | **DNS only** | the device-facing ingest; clients reach the origin directly |

`hb` is DNS-only on purpose. The proxied hostname is served an **ECDSA**
certificate by the Cloudflare edge, and BearSSL on an ESP8266 cannot validate
ECDSA. Pointing straight at the origin gets the **RSA** origin certificate, so
`USE_TLS` in the firmware can actually work.

It also matters that port 80 on `hb` does **not** redirect to https. The main
vhost does, and nginx evaluates that redirect before location matching, so it
cannot be carved out with a `location` block. A second hostname is the clean
way to get a plain-HTTP ingest path.

## Raspberry Pi

```bash
tar cz -C deploy/workshop-status pi | ssh permanent@<pi> \
  'rm -rf /tmp/workshop-pi && mkdir -p /tmp/workshop-pi && tar xz -C /tmp/workshop-pi && cd /tmp/workshop-pi/pi && bash install-pi.sh'

ssh permanent@<pi> 'cat ~/.ssh/workshop_hb.pub' \
  | ssh root@154.9.228.109 'bash /root/workshop-status/server/authorize-pi-key.sh'
```

The key is pinned to `command="/usr/local/bin/workshop-heartbeat-recv"` with
`no-pty,no-port-forwarding,no-agent-forwarding,no-user-rc,no-X11-forwarding`.

### Beats

Cron has no seconds field, so two entries produce a 30s cadence:

```
* * * * * /home/permanent/.local/bin/workshop-heartbeat.sh >/dev/null 2>&1
* * * * * sleep 30; /home/permanent/.local/bin/workshop-heartbeat.sh >/dev/null 2>&1
```

One missed minute sits inside the 90s window; two in a row do not, which is the
intended failure mode for a power cut or an unplugged Pi.

## ESP8266

See `firmware/workshop-heartbeat/README.md`. Two constraints shape it: no
5GHz radio, and no ECDSA-capable TLS.

## API

```
GET  /status     {"open":bool,"last_seen":int|null,"age":int|null,
                  "ttl":int,"now":int,"devices":[{id,last_seen,age,open}]}
POST /heartbeat  needs X-Device-Token (or ?token=); writes this device's epoch
GET  /healthz    ok
GET  /         one-line HTML view
```

`Access-Control-Allow-Origin: *`. The only state-changing path is
`/heartbeat`, and a token can only ever mark its own device alive. Writes are
rate-limited to one per second per device so a runaway device cannot turn into
a disk-write loop.

## Frontend

`src/lib/workshopStatus.ts` holds the API base and the polling composable.
Override with `PUBLIC_WORKSHOP_STATUS_API` at build time if the host changes.
The status appears as a card on `/` and in full on `/status`, which lists each
reporting device. The copy is deliberately transport-neutral so swapping the
Pi for a microcontroller does not make the page lie.
