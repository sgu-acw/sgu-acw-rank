#!/bin/bash
# Validate and reload the 1panel OpenResty container.
set -euo pipefail

NAME=$(docker ps --filter name=1Panel-openresty --format '{{.Names}}' | head -1)
[ -n "$NAME" ] || { echo "openresty container not found" >&2; exit 1; }

docker exec "$NAME" openresty -t
docker exec "$NAME" openresty -s reload
echo "reloaded $NAME"
