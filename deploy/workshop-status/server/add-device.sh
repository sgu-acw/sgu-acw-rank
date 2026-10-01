#!/bin/bash
# Add or rotate a heartbeat device token.
#
#   bash add-device.sh esp8266              # generate a token
#   bash add-device.sh esp8266 <token>      # set a specific token
#   bash add-device.sh --remove esp8266
#
# The token is the device's whole identity: the API maps it back to the id, so
# firmware never has to send an id. The file is root-only, which is why the
# tokens are stored in the clear rather than hashed — you need to read them
# back when provisioning a device.
set -euo pipefail

FILE=${WORKSHOP_DEVICES:-/etc/workshop-api.devices}

if [ "${1:-}" = "--remove" ]; then
    id=${2:?usage: add-device.sh --remove <id>}
    [ -f "$FILE" ] || { echo "no $FILE" >&2; exit 1; }
    grep -v "^$id=" "$FILE" > "$FILE.tmp"
    mv -f "$FILE.tmp" "$FILE"
    chmod 0600 "$FILE"
    echo "removed device '$id'"
    exit 0
fi

id=${1:?usage: add-device.sh <id> [token]}
if ! printf '%s' "$id" | grep -qE '^[A-Za-z0-9._-]{1,64}$'; then
    echo "id must match [A-Za-z0-9._-]{1,64}" >&2
    exit 1
fi
token=${2:-$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | cut -c1-32)}

install -d -m 0755 "$(dirname "$FILE")"
touch "$FILE"
chmod 0600 "$FILE"
grep -v "^$id=" "$FILE" > "$FILE.tmp" || true
printf '%s=%s\n' "$id" "$token" >> "$FILE.tmp"
mv -f "$FILE.tmp" "$FILE"
chmod 0600 "$FILE"

echo "device '$id'"
echo "token  $token"
