#!/bin/bash
# Install the workshop-status backend on the origin host (154.9.228.109).
# Run as root from the directory that holds these files:
#   bash install-origin.sh
# Idempotent: safe to re-run after a code change.
set -euo pipefail

DOMAIN=sgu-acw.hsn8086.com
HB_DOMAIN=hb.hsn8086.com
BACKEND_DIR=/opt/workshop-api
ENV_FILE=/etc/workshop-api.env
DEVICES_FILE=/etc/workshop-api.devices
ORT=/opt/1panel/apps/openresty/openresty
SRC=$(cd "$(dirname "$0")" && pwd)

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

echo "==> backend"
install -d -m 0755 "$BACKEND_DIR"
install -m 0644 "$SRC/workshop-api.py" "$BACKEND_DIR/workshop-api.py"
install -m 0644 "$SRC/workshop-api.service" /etc/systemd/system/workshop-api.service

if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<'EOF'
WORKSHOP_STATE_DIR=/var/lib/workshop
WORKSHOP_DEVICES=/etc/workshop-api.devices
WORKSHOP_TTL=90
WORKSHOP_BIND=127.0.0.1
WORKSHOP_PORT=8090
EOF
    chmod 0644 "$ENV_FILE"
fi

if [ ! -f "$DEVICES_FILE" ]; then
    install -m 0600 /dev/null "$DEVICES_FILE"
fi
chmod 0600 "$DEVICES_FILE"

systemctl daemon-reload
systemctl enable workshop-api.service
systemctl restart workshop-api.service
systemctl is-active --quiet workshop-api.service && echo "    workshop-api is running"

echo "==> heartbeat forced command"
install -d -m 0755 /var/lib/workshop/devices
install -m 0755 "$SRC/workshop-heartbeat-recv.sh" /usr/local/bin/workshop-heartbeat-recv

echo "==> openresty sites"
install -d -m 0755 "$ORT/www/sites/$DOMAIN/proxy" "$ORT/www/sites/$DOMAIN/ssl" "$ORT/www/sites/$DOMAIN/log"
install -m 0644 "$SRC/openresty/$DOMAIN.conf" "$ORT/conf/conf.d/$DOMAIN.conf"
install -m 0644 "$SRC/openresty/root.proxy.conf" "$ORT/www/sites/$DOMAIN/proxy/root.conf"

install -d -m 0755 "$ORT/www/sites/$HB_DOMAIN/ssl" "$ORT/www/sites/$HB_DOMAIN/log"
install -m 0644 "$SRC/openresty/$HB_DOMAIN.conf" "$ORT/conf/conf.d/$HB_DOMAIN.conf"

# The wildcard origin certificate already covers hb.; reuse it rather than
# minting a second one.
if [ ! -s "$ORT/www/sites/$HB_DOMAIN/ssl/fullchain.pem" ]; then
    if [ -s "$ORT/www/sites/$DOMAIN/ssl/fullchain.pem" ]; then
        cp -f "$ORT/www/sites/$DOMAIN/ssl/fullchain.pem" "$ORT/www/sites/$HB_DOMAIN/ssl/fullchain.pem"
        cp -f "$ORT/www/sites/$DOMAIN/ssl/privkey.pem"   "$ORT/www/sites/$HB_DOMAIN/ssl/privkey.pem"
        chmod 0644 "$ORT/www/sites/$HB_DOMAIN/ssl/"*.pem
        echo "    copied certificate from $DOMAIN"
    else
        echo "    !! no certificate for either host; install one then re-run"
    fi
fi

if [ -s "$ORT/www/sites/$DOMAIN/ssl/fullchain.pem" ] && [ -s "$ORT/www/sites/$HB_DOMAIN/ssl/fullchain.pem" ]; then
    echo "==> reloading openresty"
    bash "$SRC/reload-openresty.sh"
else
    echo "!! skipping reload: certificates missing"
fi

echo
echo "devices:  bash $SRC/add-device.sh esp8266"
