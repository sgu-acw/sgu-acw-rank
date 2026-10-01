#!/bin/bash
# Forced command for the Raspberry Pi heartbeat key.
#
# The Pi authenticates with a key that carries
#   command="/usr/local/bin/workshop-heartbeat-recv",no-pty,no-port-forwarding,...
# in /root/.ssh/authorized_keys, so whatever the Pi asks for, this script runs
# instead. It records the current time and returns no data. The key can do
# nothing else on this host.
#
# Writes the per-device heartbeat and the legacy single-file one, so reverting
# to the older API would still work.
set -euo pipefail

STATE_DIR=${WORKSHOP_STATE_DIR:-/var/lib/workshop}
DEVICE=${WORKSHOP_DEVICE_ID:-pi}
now=$(date +%s)

install -d -o root -g root -m 0755 "$STATE_DIR" "$STATE_DIR/devices"

tmp="$STATE_DIR/devices/.$DEVICE.$$"
printf '%s\n' "$now" > "$tmp"
mv -f "$tmp" "$STATE_DIR/devices/$DEVICE"

tmp="$STATE_DIR/.last_seen.$$"
printf '%s\n' "$now" > "$tmp"
mv -f "$tmp" "$STATE_DIR/last_seen"
