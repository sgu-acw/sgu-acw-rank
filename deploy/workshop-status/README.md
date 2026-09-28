# Workshop status

"What is the state of the workshop right now" is answered by one question: is
the Raspberry Pi in the room online? Nothing else is measured.

```
 Pi (workshop)            origin host 154.9.228.109            browser
 ┌────────────┐  ssh      ┌──────────────────────────────┐    ┌─────────┐
 │ cron       │──────────▶│ forced command writes epoch  │    │ /status │
 │ every 30s  │           │ to /var/lib/workshop/last_seen│   │  page   │
 └────────────┘           │ workshop-api reads it        │◀───│ fetch   │
                          │ GET /status → {open, age,...}│    └─────────┘
                          └──────────────────────────────┘
                              OpenResty + sgu-acw.hsn8086.com
```

`open` is not a stored flag. It is recomputed on every request: the newest
heartbeat is younger than `WORKSHOP_TTL` (90s) or it is not.

## Pieces

| Path | Where it runs |
| --- | --- |
| `server/workshop-api.py` | origin, `/opt/workshop-api/`, systemd unit `workshop-api` |
| `server/workshop-heartbeat-recv.sh` | origin, `/usr/local/bin/`, run as the SSH forced command |
| `server/authorize-pi-key.sh` | origin, appends the Pi's key to `/root/.ssh/authorized_keys` |
| `server/install-origin.sh` | origin, installs all of the above plus the OpenResty site |
| `pi/workshop-heartbeat.sh` | Pi, `~/.local/bin/` |
| `pi/install-pi.sh` | Pi, as the normal user, no sudo |

## Origin host

```bash
tar cz -C deploy/workshop-status server | ssh root@154.9.228.109 \
  'rm -rf /root/workshop-status && mkdir -p /root/workshop-status && tar xz -C /root/workshop-status'
ssh root@154.9.228.109 'cd /root/workshop-status/server && bash install-origin.sh'
```

`install-origin.sh` is idempotent. It skips the OpenResty reload until
`www/sites/sgu-acw.hsn8086.com/ssl/{fullchain,privkey}.pem` exist.

### Certificate

The other sites under `hsn8086.com` use Cloudflare **Origin CA** certificates
(15 years, CF Full/strict). Create one for `sgu-acw.hsn8086.com` in the
Cloudflare dashboard (SSL/TLS → Origin Server → Create Certificate) and drop
the two PEMs into:

```
/opt/1panel/apps/openresty/openresty/www/sites/sgu-acw.hsn8086.com/ssl/
```

Then reload:

```bash
bash reload-openresty.sh            # on the origin host
```

A single wildcard certificate (`*.hsn8086.com`, `hsn8086.com`) is enough and
mirrors what the other sites use.

The site directory and `conf.d` file are written by hand rather than through
the 1panel UI, so 1panel will not list `sgu-acw.hsn8086.com` under Websites.
The vhost still loads normally; only the UI listing is missing. Re-running
`install-origin.sh` restores the files if 1panel ever drops them.

### DNS

An `A` record `sgu-acw` → `154.9.228.109`, proxied (orange cloud).

## Raspberry Pi

```bash
tar cz -C deploy/workshop-status pi | ssh permanent@<pi> \
  'rm -rf /tmp/workshop-pi && mkdir -p /tmp/workshop-pi && tar xz -C /tmp/workshop-pi && cd /tmp/workshop-pi/pi && bash install-pi.sh'
```

The script generates `~/.ssh/workshop_hb`, installs the two cron entries, and
prints the public key. Authorize it on the origin host:

```bash
ssh permanent@<pi> 'cat ~/.ssh/workshop_hb.pub' \
  | ssh root@154.9.228.109 'bash /root/workshop-status/server/authorize-pi-key.sh'
```

The key is pinned to `command="/usr/local/bin/workshop-heartbeat-recv"` with
`no-pty,no-port-forwarding,no-agent-forwarding,no-user-rc,no-X11-forwarding`.
It cannot open a shell, and if it leaks the worst it can do is write the
current time.

### Beats

Cron has no second field, so two entries produce a 30s cadence — one fires at
`:00`, the other sleeps 30s and fires at `:30`. A missed minute still lands
inside the 90s window; two in a row do not, which is the intended failure mode.

```
* * * * * /home/permanent/.local/bin/workshop-heartbeat.sh >/dev/null 2>&1
* * * * * sleep 30; /home/permanent/.local/bin/workshop-heartbeat.sh >/dev/null 2>&1
```

## API

```
GET /status   {"open":bool,"last_seen":int|null,"age":int|null,"ttl":int,"now":int}
GET /healthz  ok
GET /         one-line HTML view
```

`Access-Control-Allow-Origin: *`, no auth — the answer is public and the only
state-changing path is the Pi's SSH key.

## Frontend

`src/lib/workshopStatus.ts` holds the API base and the polling composable.
Override the base with `PUBLIC_WORKSHOP_STATUS_API` at build time if the host
changes. The status appears as a card on `/` and in full on `/status`.
