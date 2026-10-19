# 前端部署（服务器 + Cloudflare CDN）

前端是纯静态站，从 Cloudflare Pages 迁到自有服务器，Cloudflare 只做 CDN 与 TLS 终止。

## 为什么迁

- Pages 单文件上限 25 MiB，题库语言包（Java `modules21` 28.5 MiB）放不下。
- 评测运行器需要独立域名和自有缓存策略，Pages Functions 额度与行为都不合适。

## 结构

| 路径 | 作用 |
| --- | --- |
| `deploy/sgu-acw.zh314.xyz.conf` | OpenResty 站点配置：静态站、`/api` 反代、`/post` 回退、RSS、旧链接 301 |
| `deploy/migrate-to-server.sh` | 发布产物 + 安装配置（`--config` 只装配置，`--dns` 切 DNS） |
| `.github/workflows/deploy.yml` | push main 自动发布 |

服务器上的布局（OpenResty 跑在 1Panel 容器里，`/www` 挂在宿主机
`/opt/1panel/apps/openresty/openresty/www`）：

```
/www/sites/sgu-acw.zh314.xyz/
├── releases/<时间戳>/     每次发布的完整产物
├── dist -> releases/<...> 原子切换点（相对链接，容器内可见）
├── secret/origin.conf     X-Origin-Secret（600）
└── log/
```

## 迁移后 Pages 承担的职责去哪了

| 原 Pages | 现在 |
| --- | --- |
| `functions/api/[[path]].js` | nginx `location ^~ /api/` 反代 8091，带 `X-Origin-Secret` |
| `functions/post/[slug].js` | `location ^~ /post/` 回退到 `/post/index.html` |
| `functions/blog/rss.xml.js` | `location = /blog/rss.xml` 反代后端 RSS |
| `public/_redirects` | nginx `return 301` |
| `public/_routes.json` | 不再需要 |

## 上线

```bash
./deploy/migrate-to-server.sh            # 发布并装配置
./deploy/migrate-to-server.sh --config   # 只更新配置
CLOUDFLARE_API_TOKEN=... ./deploy/migrate-to-server.sh --dns   # 切 DNS
```

`--dns` 需要 token 具备 `Zone.DNS:Edit`、`Zone:Read`。切完建议把
Cloudflare SSL 模式设为 **Full (strict)**，源站证书用 Origin CA（覆盖
`sgu-acw.zh314.xyz`），否则 CDN→源站是明文。

## 回滚

```bash
ssh root@154.9.228.109
cd /opt/1panel/apps/openresty/openresty/www/sites/sgu-acw.zh314.xyz
ln -sfn releases/<上一个时间戳> dist.next && mv -Tf dist.next dist
```

DNS 回滚：把 `sgu-acw.zh314.xyz` 的 CNAME/A 记录改回 Pages 项目即可，
Pages 项目与产物仍保留。
