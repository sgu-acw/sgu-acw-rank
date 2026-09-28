#!/bin/bash
# Install the workshop-status backend on the origin host (154.9.228.109).
# Run as root from the directory that holds these files:
#   bash install-origin.sh
set -euo pipefail

DOMAIN=sgu-acw.hsn8086.com
BACKEND_DIR=/opt/workshop-api
ENV_FILE=/etc/workshop-api.env
ORT=/opt/1panel/apps/openresty/openresty
SRC=$(cd "$(dirname "$0")" && pwd)

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

echo "==> backend"
install -d -m 0755 "$BACKEND_DIR"
install -m 0644 "$SRC/workshop-api.py" "$BACKEND_DIR/workshop-api.py"
install -m 0644 "$SRC/workshop-api.service" /etc/systemd/system/workshop-api.service
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<'EOF'
WORKSHOP_STATE=/var/lib/workshop/last_seen
WORKSHOP_TTL=90
WORKSHOP_BIND=127.0.0.1
WORKSHOP_PORT=8090
EOF
    chmod 0644 "$ENV_FILE"
fi
systemctl daemon-reload
systemctl enable --now workshop-api.service
systemctl is-active --quiet workshop-api.service && echo "    workshop-api is running"

echo "==> heartbeat forced command"
install -d -m 0755 /var/lib/workshop
install -m 0755 "$SRC/workshop-heartbeat-recv.sh" /usr/local/bin/workshop-heartbeat-recv

echo "==> openresty site"
install -d -m 0755 "$ORT/www/sites/$DOMAIN/proxy" "$ORT/www/sites/$DOMAIN/ssl" "$ORT/www/sites/$DOMAIN/log"
install -m 0644 "$SRC/openresty/$DOMAIN.conf" "$ORT/conf/conf.d/$DOMAIN.conf"
install -m 0644 "$SRC/openresty/root.proxy.conf" "$ORT/www/sites/$DOMAIN/proxy/root.conf"

if [ -s "$ORT/www/sites/$DOMAIN/ssl/fullchain.pem" ] && [ -s "$ORT/www/sites/$DOMAIN/ssl/privkey.pem" ]; then
    echo "==> reloading openresty"
    bash "$SRC/reload-openresty.sh"
else
    echo "!! no certificate at $ORT/www/sites/$DOMAIN/ssl, install one then run:"
    echo "   bash install-origin.sh   # again, or:"
    echo "   docker exec \$(docker ps --filter name=1Panel-openresty --format '{{.Names}}' | head -1) openresty -s reload"
fi
