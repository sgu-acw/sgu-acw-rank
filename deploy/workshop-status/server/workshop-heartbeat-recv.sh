#!/bin/bash
# Forced command for the Raspberry Pi heartbeat key.
#
# The Pi authenticates with a key that carries
#   command="/usr/local/bin/workshop-heartbeat-recv",no-pty,no-port-forwarding,...
# in /root/.ssh/authorized_keys, so whatever the Pi asks for, this script runs
# instead. It records the current time and returns no data. The key can do
# nothing else on this host.
set -euo pipefail

STATE_DIR=${WORKSHOP_STATE_DIR:-/var/lib/workshop}
STATE_FILE="$STATE_DIR/last_seen"

install -d -o root -g root -m 0755 "$STATE_DIR"
tmp="$STATE_DIR/.last_seen.$$"
printf '%s\n' "$(date +%s)" > "$tmp"
mv -f "$tmp" "$STATE_FILE"
