#!/usr/bin/env bash
# 把前端静态站从 Cloudflare Pages 迁到自有服务器（OpenResty），CDN 仍在 Cloudflare。
#
# 为什么换：Pages 单文件上限 25 MiB，题库语言包（Java modules21 28.5 MiB）放不下；
# 而且题库运行器需要独立域名与自有缓存策略，Pages 的 Functions 额度也不适合。
#
# 这个脚本只做「发布静态产物 + 安装站点配置」，不动 DNS。
# DNS 切换是单独一步：确认源站直连可用后再改解析，避免站点掉线。
#
# 用法：
#   ./deploy/migrate-to-server.sh            # 发布 dist 并安装配置
#   ./deploy/migrate-to-server.sh --config   # 只安装/更新站点配置
set -euo pipefail

HOST="${SGU_ACW_HOST:-root@154.9.228.109}"
SITE="sgu-acw.zh314.xyz"
REMOTE_ROOT="/opt/1panel/apps/openresty/openresty/www/sites/${SITE}"
CONTAINER="1Panel-openresty-G8Zb"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"
KEEP=3

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"

log() { printf '\033[1m== %s\033[0m\n' "$*"; }

if [[ "${1:-}" != "--config" ]]; then
  log "构建静态产物"
  ( cd "$repo" && pnpm build )

  if [[ ! -f "$repo/dist/index.html" ]]; then
    echo "dist/index.html 不存在，构建未成功" >&2
    exit 1
  fi

  log "上传 release $RELEASE_ID"
  # 先传到临时目录再原子切换：rsync 中途断掉不会让线上出现半套文件。
  ssh "$HOST" "mkdir -p '$REMOTE_ROOT/releases/$RELEASE_ID' '$REMOTE_ROOT/log' '$REMOTE_ROOT/secret'"
  # 用 tar 流而不是 rsync：这台机器的 SSH 在长连接大流量时会被中途掐断
  # （rsync 报 "unexpected end of file"），tar 单流重试成本更低。
  tar -C "$repo/dist" -czf - . \
    | ssh "$HOST" "tar -xzf - -C '$REMOTE_ROOT/releases/$RELEASE_ID'"

  log "原子切换 dist -> releases/$RELEASE_ID"
  # 必须用相对链接：OpenResty 跑在容器里，宿主机绝对路径在容器内不存在。
  ssh "$HOST" "set -e
    ln -sfn 'releases/$RELEASE_ID' '$REMOTE_ROOT/dist.next'
    mv -Tf '$REMOTE_ROOT/dist.next' '$REMOTE_ROOT/dist'
    # 保留最近 $KEEP 个 release，其余清掉。
    ls -1dt '$REMOTE_ROOT'/releases/*/ 2>/dev/null | tail -n +\$(( $KEEP + 1 )) | xargs -r rm -rf
  "
fi

log "安装站点配置"
scp -q "$here/sgu-acw.zh314.xyz.conf" "$HOST:/tmp/$SITE.conf"
ssh "$HOST" "set -e
  conf_dir=/opt/1panel/apps/openresty/openresty/conf/conf.d
  # 来源密钥只写进服务器本地 include，权限收紧。
  if ! docker exec $CONTAINER test -f /www/sites/$SITE/secret/origin.conf; then
    secret=\$(grep -E '^SGU_ACW_ORIGIN_SECRET=' /etc/sgu-acw-api.env | cut -d= -f2-)
    if [ -z \"\$secret\" ]; then echo '后端环境缺少 SGU_ACW_ORIGIN_SECRET' >&2; exit 1; fi
    printf 'set \$sgu_acw_origin_secret \"%s\";\n' \"\$secret\" > /opt/1panel/apps/openresty/openresty/www/sites/$SITE/secret/origin.conf
    chmod 600 /opt/1panel/apps/openresty/openresty/www/sites/$SITE/secret/origin.conf
  fi
  cp /tmp/$SITE.conf \$conf_dir/$SITE.conf
  docker exec $CONTAINER nginx -t
  docker exec $CONTAINER nginx -s reload
  rm -f /tmp/$SITE.conf
"

log "完成。源站验证："
ssh "$HOST" "curl -s -o /dev/null -w 'index=%{http_code}\n' -H 'Host: $SITE' http://127.0.0.1/ ;
  curl -s -o /dev/null -w 'api=%{http_code}\n' -H 'Host: $SITE' http://127.0.0.1/api/config ;
  curl -s -o /dev/null -w 'post=%{http_code}\n' -H 'Host: $SITE' http://127.0.0.1/post/anything ;
  curl -s -o /dev/null -w 'rss=%{http_code}\n' -H 'Host: $SITE' http://127.0.0.1/blog/rss.xml ;
  curl -s -o /dev/null -w 'old=%{http_code}\n' -H 'Host: $SITE' http://127.0.0.1/blog/3-奖牌柜"

# ---------------------------------------------------------------------------
# DNS / 证书切换（需要 CLOUDFLARE_API_TOKEN，权限：Zone.DNS:Edit + Zone:Read
# 以及 Account.Origin CA:Edit）。没有 token 时脚本跳过，不影响前面的发布。
#
#   CLOUDFLARE_API_TOKEN=... ./deploy/migrate-to-server.sh --dns
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "--dns" ]]; then
  : "${CLOUDFLARE_API_TOKEN:?需要 CLOUDFLARE_API_TOKEN}"
  ZONE_NAME="zh314.xyz"
  TARGET_IP="${SGU_ACW_ORIGIN_IP:-154.9.228.109}"

  api() {
    curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H 'Content-Type: application/json' "$@"
  }

  log "查询 zone $ZONE_NAME"
  ZONE_ID=$(api "https://api.cloudflare.com/client/v4/zones?name=$ZONE_NAME" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("result") or [{}])[0].get("id",""))')
  [[ -n "$ZONE_ID" ]] || { echo "找不到 zone（token 权限不足？）" >&2; exit 1; }

  log "把 $SITE 指向源站 $TARGET_IP（Cloudflare 代理保持开启）"
  RECORD_ID=$(api "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=$SITE" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("result") or [{}])[0].get("id",""))')
  payload=$(python3 -c "
import json,sys
print(json.dumps({'type':'A','name':'$SITE','content':'$TARGET_IP','proxied':True,'ttl':1}))")
  if [[ -n "$RECORD_ID" ]]; then
    api -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
      --data-binary "$payload" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("updated" if d.get("success") else d.get("errors"))'
  else
    api -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
      --data-binary "$payload" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("created" if d.get("success") else d.get("errors"))'
  fi

  log "等待解析生效并验证"
  for i in $(seq 1 20); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "https://$SITE/" || true)
    echo "  尝试 $i: $code"
    [[ "$code" == "200" ]] && break
    sleep 6
  done
fi
