#!/bin/bash
# One heartbeat to the status server.
#
# The server locks this key to a forced command that records the current time,
# so nothing is executed remotely and no payload is sent. A successful exit
# means the server saw us; the server decides what "open" means.
set -uo pipefail

KEY="$HOME/.ssh/workshop_hb"
KNOWN_HOSTS="$HOME/.ssh/workshop_known_hosts"
HOST=${WORKSHOP_HOST:-154.9.228.109}

# Pass an explicit no-op command: it is ignored once the forced command is in
# place, but keeps ssh honest if the key ever lands somewhere without one.
exec ssh -i "$KEY" \
    -o IdentitiesOnly=yes \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=2 \
    -o StrictHostKeyChecking=accept-new \
    -o UserKnownHostsFile="$KNOWN_HOSTS" \
    -o LogLevel=ERROR \
    "root@$HOST" true
