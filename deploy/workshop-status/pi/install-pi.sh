#!/bin/bash
# Install the workshop heartbeat on the Raspberry Pi. Runs as the normal user:
# no sudo, no system units. Cron runs the beats; user crontabs survive logout
# and start again at boot.
set -euo pipefail

SRC=$(cd "$(dirname "$0")" && pwd)
BIN="$HOME/.local/bin"
KEY="$HOME/.ssh/workshop_hb"

echo "==> installing heartbeat script"
install -d -m 0755 "$BIN"
install -m 0755 "$SRC/workshop-heartbeat.sh" "$BIN/workshop-heartbeat.sh"

echo "==> ensuring key"
install -d -m 0700 "$HOME/.ssh"
if [ ! -f "$KEY" ]; then
    ssh-keygen -q -t ed25519 -N '' -C "pi-workshop-heartbeat@$(hostname)" -f "$KEY"
fi
chmod 0600 "$KEY"
chmod 0644 "$KEY.pub"

echo "==> installing cron beats"
TMP=$(mktemp)
crontab -l 2>/dev/null | sed '/# >>> workshop-heartbeat/,/# <<< workshop-heartbeat/d' > "$TMP" || true
cat >> "$TMP" <<EOF
# >>> workshop-heartbeat
* * * * * $BIN/workshop-heartbeat.sh >/dev/null 2>&1
* * * * * sleep 30; $BIN/workshop-heartbeat.sh >/dev/null 2>&1
# <<< workshop-heartbeat
EOF
crontab "$TMP"
rm -f "$TMP"

echo
echo "public key (add it to the origin host with authorize-pi-key.sh):"
cat "$KEY.pub"
echo
echo "==> first beat"
"$BIN/workshop-heartbeat.sh" && echo "    ok" || echo "    failed; check that the key is authorized on the origin host"
