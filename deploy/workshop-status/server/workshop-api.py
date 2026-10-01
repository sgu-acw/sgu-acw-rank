#!/usr/bin/env python3
"""Workshop open/closed status API.

The workshop counts as open while some device in the room keeps beating.
Two ingest paths exist, and both do the same thing: write the current time.

  SSH   the Raspberry Pi's key is pinned to a forced command
        (workshop-heartbeat-recv), which writes the timestamp itself.
  HTTP  a microcontroller POSTs /heartbeat with a per-device token; the
        token identifies the device, so the firmware carries no device id.

A device's clock is never trusted and no `open` flag is ever stored — status
is recomputed from heartbeat age on every request.

Endpoints:
    GET  /status     JSON status
    POST /heartbeat  record a heartbeat (X-Device-Token, or ?token=)
    GET  /healthz    liveness probe
    GET  /           small human-readable page

Environment:
    WORKSHOP_STATE_DIR  where heartbeats live (default /var/lib/workshop)
    WORKSHOP_STATE      legacy single-file heartbeat (default <dir>/last_seen)
    WORKSHOP_DEVICES    id=token lines (default /etc/workshop-api.devices)
    WORKSHOP_TTL        seconds a heartbeat stays valid (default 90)
    WORKSHOP_BIND       listen address (default 127.0.0.1)
    WORKSHOP_PORT       listen port (default 8090)
"""

import hmac
import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

STATE_DIR = os.environ.get("WORKSHOP_STATE_DIR", "/var/lib/workshop")
LEGACY_STATE = os.environ.get("WORKSHOP_STATE", os.path.join(STATE_DIR, "last_seen"))
DEVICES_FILE = os.environ.get("WORKSHOP_DEVICES", "/etc/workshop-api.devices")
DEVICE_DIR = os.path.join(STATE_DIR, "devices")
TTL = int(os.environ.get("WORKSHOP_TTL", "90"))
BIND = os.environ.get("WORKSHOP_BIND", "127.0.0.1")
PORT = int(os.environ.get("WORKSHOP_PORT", "8090"))

# A legacy single-file heartbeat belongs to the Pi — that is who wrote it.
LEGACY_DEVICE = "pi"
SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
# Refuse to rewrite the timestamp more often than this; a runaway device or a
# stranger with a token cannot turn into a disk-write loop.
MIN_WRITE_GAP = 1


def read_epoch(path):
    try:
        with open(path, "r", encoding="ascii") as fh:
            return int(fh.read().strip())
    except (OSError, ValueError):
        return None


def read_devices():
    """id -> token. Read per request so adding a device needs no restart."""
    devices = {}
    try:
        with open(DEVICES_FILE, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                device_id, token = line.split("=", 1)
                device_id, token = device_id.strip(), token.strip()
                if SAFE_ID.match(device_id) and token:
                    devices[device_id] = token
    except OSError:
        pass
    return devices


def load_heartbeats():
    """id -> newest epoch seen, merging the device dir with the legacy file."""
    beats = {}
    try:
        names = sorted(os.listdir(DEVICE_DIR))
    except OSError:
        names = []
    for name in names:
        if name.startswith(".") or not SAFE_ID.match(name):
            continue
        ts = read_epoch(os.path.join(DEVICE_DIR, name))
        if ts is not None:
            beats[name] = ts
    legacy = read_epoch(LEGACY_STATE)
    if legacy is not None:
        beats[LEGACY_DEVICE] = max(beats.get(LEGACY_DEVICE, 0), legacy)
    return beats


def snapshot():
    now = int(time.time())
    devices = []
    for device_id, ts in sorted(load_heartbeats().items()):
        age = max(0, now - ts)
        devices.append({
            "id": device_id,
            "last_seen": ts,
            "age": age,
            "open": age <= TTL,
        })
    newest = max((d["last_seen"] for d in devices), default=None)
    return {
        "open": any(d["open"] for d in devices),
        "last_seen": newest,
        "age": None if newest is None else max(0, now - newest),
        "ttl": TTL,
        "now": now,
        "devices": devices,
    }


def record_heartbeat(device_id):
    """Atomically write this device's timestamp. Returns False if too soon."""
    os.makedirs(DEVICE_DIR, mode=0o755, exist_ok=True)
    path = os.path.join(DEVICE_DIR, device_id)
    now = int(time.time())
    previous = read_epoch(path)
    if previous is not None and 0 <= now - previous < MIN_WRITE_GAP:
        return False
    tmp = os.path.join(DEVICE_DIR, ".%s.%d" % (device_id, os.getpid()))
    with open(tmp, "w", encoding="ascii") as fh:
        fh.write("%d\n" % now)
    os.replace(tmp, path)
    return True


class Handler(BaseHTTPRequestHandler):
    server_version = "workshop-api"
    protocol_version = "HTTP/1.1"

    def handle_one_request(self):
        """Never let one bad request kill the socket — a reverse proxy turns
        an unhandled exception into a 502, which is a confusing thing to debug
        from a microcontroller's serial log."""
        try:
            super().handle_one_request()
        except Exception as exc:  # noqa: BLE001
            self.log_message("unhandled error: %r", exc)
            try:
                self._json(500, {"error": "internal error"})
            except Exception:  # noqa: BLE001
                pass

    # --- plumbing ---------------------------------------------------------

    def _respond(self, code, body, content_type, extra_headers=()):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "X-Device-Token, Content-Type")
        self.send_header("Cache-Control", "no-store")
        for key, value in extra_headers:
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, code, payload, extra_headers=()):
        self._respond(code, json.dumps(payload), "application/json; charset=utf-8", extra_headers)

    def _drain_body(self):
        """Consume the request body so keep-alive does not desynchronise."""
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length > 0:
            self.rfile.read(min(length, 65536))

    def _path(self):
        return urlsplit(self.path).path.rstrip("/") or "/"

    def _query_token(self):
        values = parse_qs(urlsplit(self.path).query, keep_blank_values=False)
        token = values.get("token") or values.get("t")
        return token[0] if token else None

    def _authenticate(self):
        """Resolve the supplied token to a device id, in constant time."""
        devices = read_devices()
        if not devices:
            return None, "no devices configured"
        supplied = self.headers.get("X-Device-Token") or self._query_token()
        if not supplied:
            return None, "missing token"
        matched = None
        for device_id, token in devices.items():
            if hmac.compare_digest(token, supplied):
                matched = device_id
        return matched, None if matched else "bad token"

    # --- routes -----------------------------------------------------------

    def do_GET(self):
        path = self._path()
        if path in ("/status", "/api/status"):
            self._json(200, snapshot())
        elif path == "/healthz":
            self._respond(200, "ok\n", "text/plain; charset=utf-8")
        elif path == "/":
            self._respond(200, self._page(), "text/html; charset=utf-8")
        else:
            self._json(404, {"error": "not found"})

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        if self._path() != "/heartbeat":
            self._drain_body()
            self._json(404, {"error": "not found"})
            return
        self._drain_body()
        device_id, problem = self._authenticate()
        if device_id is None:
            self._json(401, {"error": problem})
            return
        try:
            written = record_heartbeat(device_id)
        except OSError as exc:
            self.log_message("heartbeat write failed: %s", exc)
            self._json(500, {"error": "cannot record heartbeat"})
            return
        payload = {"ok": True, "device": device_id, "recorded": written}
        self._json(200, payload)
    def do_OPTIONS(self):
        self._drain_body()
        self._respond(204, b"", "text/plain; charset=utf-8")

    def _page(self):
        state = snapshot()
        rows = "".join(
            "<li>%s — %s</li>" % (
                d["id"],
                "open" if d["open"] else "stale (%ss)" % d["age"],
            )
            for d in state["devices"]
        ) or "<li>no devices beating</li>"
        return (
            "<!doctype html><meta charset=utf-8><title>workshop status</title>"
            "<body style='font:16px/1.6 system-ui;max-width:32rem;margin:4rem auto'>"
            "<h1>Workshop is %s</h1><ul>%s</ul>"
            "<p>ttl %ss · <a href='/status'>/status</a></p></body>"
            % ("OPEN" if state["open"] else "CLOSED", rows, state["ttl"])
        )

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


def main():
    server = ThreadingHTTPServer((BIND, PORT), Handler)
    print(
        "workshop-api on %s:%d (state=%s devices=%s ttl=%ds)"
        % (BIND, PORT, DEVICE_DIR, DEVICES_FILE, TTL),
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
