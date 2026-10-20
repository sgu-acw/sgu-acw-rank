#!/usr/bin/env bash
# 发布题库评测运行器到 judge.zh314.xyz。
#
# 运行器和主站必须分域名：它执行用户提交的代码，同域就能读到主站 Cookie。
# 这个脚本只同步 /engine 与 /packages 两棵静态树，不碰主站产物。
#
# 语言包体积大（C/C++ 16 MiB、Python 11 MiB、Java 21 57 MiB、Java 8 79 MiB
# 的 Brotli 传输量），所以走独立的 release 目录 + 软链，和主站一样可回滚。
set -euo pipefail

HOST="${SGU_ACW_HOST:-root@154.9.228.109}"
SITE="judge.zh314.xyz"
REMOTE_ROOT="/opt/1panel/apps/openresty/openresty/www/sites/${SITE}"
CONTAINER="1Panel-openresty-G8Zb"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
work="$repo/.local/learning"
public="$REMOTE_ROOT/public"

log() { printf '\033[1m== %s\033[0m\n' "$*"; }

if [[ ! -f "$work/packages/manifest.json" || ! -f "$work/engine/host.js" ]]; then
  echo "缺少运行器产物，先跑 pnpm learning:prepare" >&2
  exit 1
fi

log "上传 engine 与 packages（release $RELEASE_ID）"
ssh "$HOST" "mkdir -p '$REMOTE_ROOT/releases/$RELEASE_ID' '$REMOTE_ROOT/log' '$REMOTE_ROOT/secret/tls.d'"
# 传未压缩原件（约 750 MB）而不是 .br：压缩交给 Cloudflare。
# 预压缩在 CDN 后面会被二次压缩且头错配，实测客户端解压失败。
# 文件清单由 find 生成——macOS 自带的 bsdtar 不认 --wildcards/--no-anchored。
file_list="$(mktemp)"
(
  cd "$work"
  find engine -type f ! -name '*.map'
  find packages -maxdepth 1 -type f \( -name 'manifest.json' -o -name 'THIRD_PARTY_NOTICES.md' \)
  # 只传 manifest 引用的对象：objects/ 里可能残留旧版本的大文件。
  node -e '
    const m = require("./packages/manifest.json")
    const seen = new Set()
    for (const r of m.runtimes) for (const a of r.assets) {
      const p = a.path.replace(/^\//, "")
      if (!seen.has(p)) { seen.add(p); console.log(p) }
    }
  '
) > "$file_list"
# 大流量下 SSH 会被中途掐断，加保活；再按批切分，单次连接失败不影响整体。
SSH_OPTS="-o ServerAliveInterval=15 -o ServerAliveCountMax=8 -o TCPKeepAlive=yes"
total=$(wc -l < "$file_list")
batch=40
start=1
while [ "$start" -le "$total" ]; do
  end=$(( start + batch - 1 ))
  slice="$(mktemp)"
  sed -n "${start},${end}p" "$file_list" > "$slice"
  echo "  上传 $start-$end / $total"
  tar -C "$work" -czf - -T "$slice" \
    | ssh $SSH_OPTS "$HOST" "tar -xzf - -C '$REMOTE_ROOT/releases/$RELEASE_ID'" || {
      echo "批次 $start-$end 失败，重试一次" >&2
      sleep 3
      tar -C "$work" -czf - -T "$slice" \
        | ssh $SSH_OPTS "$HOST" "tar -xzf - -C '$REMOTE_ROOT/releases/$RELEASE_ID'"
    }
  rm -f "$slice"
  start=$(( end + 1 ))
done
rm -f "$file_list"

log "原子切换 public -> releases/$RELEASE_ID"
ssh "$HOST" "set -e
  ln -sfn 'releases/$RELEASE_ID' '$REMOTE_ROOT/public.next'
  mv -Tf '$REMOTE_ROOT/public.next' '$REMOTE_ROOT/public'
  ls -1dt '$REMOTE_ROOT'/releases/*/ | tail -n +3 | xargs -r rm -rf
"

log "安装站点配置与证书"
scp -q "$here/judge.zh314.xyz.conf" "$HOST:/tmp/$SITE.conf"
ssh "$HOST" "set -e
  conf_dir=/opt/1panel/apps/openresty/openresty/conf/conf.d
  # 复用主站那张 *.zh314.xyz 的 Origin CA 证书。
  if [ ! -f '$REMOTE_ROOT/secret/tls.d/tls.conf' ]; then
    cp /opt/1panel/apps/openresty/openresty/www/sites/sgu-acw.zh314.xyz/secret/origin/fullchain.pem '$REMOTE_ROOT/secret/origin-cert.pem'
    cp /opt/1panel/apps/openresty/openresty/www/sites/sgu-acw.zh314.xyz/secret/origin/privkey.pem '$REMOTE_ROOT/secret/origin-key.pem'
    chmod 600 '$REMOTE_ROOT/secret/origin-key.pem'
    # nginx 不展开变量，证书路径必须写死。
    printf '%s\n' \
      'listen 443 ssl http2 ;' \
      'ssl_certificate /www/sites/judge.zh314.xyz/secret/origin-cert.pem ;' \
      'ssl_certificate_key /www/sites/judge.zh314.xyz/secret/origin-key.pem ;' \
      'ssl_protocols TLSv1.3 TLSv1.2 ;' \
      'ssl_prefer_server_ciphers on ;' \
      'ssl_session_cache shared:SSL:10m ;' > '$REMOTE_ROOT/secret/tls.d/tls.conf'
  fi
  cp /tmp/$SITE.conf \$conf_dir/$SITE.conf
  rm -f /tmp/$SITE.conf
  docker exec $CONTAINER nginx -t
  docker exec $CONTAINER nginx -s reload
"

log "验证源站"
ssh "$HOST" "for p in /engine/ /engine/host.js /engine/worker.js /engine/sw.js /packages/manifest.json /nope; do
  printf '%s ' \"\$p\"
  curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: $SITE' http://127.0.0.1\$p
done"
