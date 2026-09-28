#!/usr/bin/env python3
"""Workshop open/closed status API.

The workshop counts as open while the Raspberry Pi in the room keeps beating.
The Pi opens a short SSH session to this host on a schedule; the forced command
attached to its key writes an epoch timestamp to STATE_FILE. This service is
read-only: it never accepts writes over HTTP.

Endpoints:
    GET /status    JSON status
    GET /healthz   liveness probe
    GET /          small human-readable page

Environment:
    WORKSHOP_STATE  timestamp file written by the heartbeat (default /var/lib/workshop/last_seen)
    WORKSHOP_TTL    seconds a heartbeat stays valid (default 90)
    WORKSHOP_BIND   listen address (default 127.0.0.1)
    WORKSHOP_PORT   listen port (default 8090)
"""

import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE_FILE = os.environ.get("WORKSHOP_STATE", "/var/lib/workshop/last_seen")
TTL = int(os.environ.get("WORKSHOP_TTL", "90"))
BIND = os.environ.get("WORKSHOP_BIND", "127.0.0.1")
PORT = int(os.environ.get("WORKSHOP_PORT", "8090"))


def read_last_seen():
    """Epoch seconds of the newest heartbeat, or None if there never was one."""
    try:
        with open(STATE_FILE, "r", encoding="ascii") as fh:
            return int(fh.read().strip())
    except (OSError, ValueError):
        return None


def build_status():
    now = int(time.time())
    last_seen = read_last_seen()
    age = None if last_seen is None else max(0, now - last_seen)
    return {
        "open": age is not None and age <= TTL,
        "last_seen": last_seen,
        "age": age,
        "ttl": TTL,
        "now": now,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "workshop-api"
    protocol_version = "HTTP/1.1"

    def _send(self, code, body, content_type):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _status(self):
        return self._send(200, json.dumps(build_status()), "application/json; charset=utf-8")

    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path in ("/status", "/api/status"):
            self._status()
        elif path == "/healthz":
            self._send(200, "ok\n", "text/plain; charset=utf-8")
        elif path == "/":
            self._send(200, self._page(), "text/html; charset=utf-8")
        else:
            self._send(404, json.dumps({"error": "not found"}), "application/json; charset=utf-8")

    def do_HEAD(self):
        self.do_GET()

    def do_OPTIONS(self):
        self._send(204, b"", "text/plain; charset=utf-8")

    def _page(self):
        s = build_status()
        state = "OPEN" if s["open"] else "CLOSED"
        age = "never" if s["age"] is None else "%ds ago" % s["age"]
        return (
            "<!doctype html><meta charset=utf-8><title>workshop status</title>"
            "<body style='font:16px/1.6 system-ui;max-width:32rem;margin:4rem auto'>"
            "<h1>Workshop is %s</h1><p>last heartbeat: %s (ttl %ds)</p>"
            "<p><a href='/status'>/status</a></p></body>" % (state, age, s["ttl"])
        )

    def log_message(self, fmt, *args):
        # Keep the journal readable; one line per request is enough.
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


def main():
    server = ThreadingHTTPServer((BIND, PORT), Handler)
    print("workshop-api listening on %s:%d (state=%s ttl=%ds)" % (BIND, PORT, STATE_FILE, TTL), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
