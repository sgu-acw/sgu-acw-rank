#!/bin/bash
# Install the Pi's heartbeat public key on the origin host as a restricted key.
#
#   ssh root@<origin> bash -s < ~/.ssh/workshop_hb.pub
# or, when the scripts are already on the host:
#   bash authorize-pi-key.sh < ~/.ssh/workshop_hb.pub
#
# The key is pinned to the forced command and cannot open a shell, a port
# forward, an agent forward, or an X11 channel.
set -euo pipefail

AUTH=/root/.ssh/authorized_keys
CMD=/usr/local/bin/workshop-heartbeat-recv
KEY=$(tr -d '\r' < /dev/stdin | grep -v '^$' | head -1)

[ -n "$KEY" ] || { echo "no public key on stdin" >&2; exit 1; }
case "$KEY" in
    ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*\ *) ;;
    *) echo "unexpected key format" >&2; exit 1 ;;
esac

install -d -m 0700 /root/.ssh
touch "$AUTH"
chmod 0600 "$AUTH"

# Drop any earlier copy of this key (same base64 blob), then append the pinned one.
BLOB=$(printf '%s\n' "$KEY" | awk '{print $2}')
grep -vF "$BLOB" "$AUTH" > "$AUTH.tmp" || true
printf 'command="%s",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding %s\n' \
    "$CMD" "$KEY" >> "$AUTH.tmp"
mv -f "$AUTH.tmp" "$AUTH"
chmod 0600 "$AUTH"
echo "authorized heartbeat key (${KEY%% *})"
