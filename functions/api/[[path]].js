/**
 * 把 /api/* 同源转发到 VPS 上的后端。
 *
 * 为什么要有这一层：前端是静态站，后端在另一台机器上。直接跨域调用的
 * 话，会话 Cookie 必须标 SameSite=None，而 Safari 和 Firefox 默认拦截
 * 第三方 Cookie，Chrome 也在逐步淘汰，结果就是一部分人根本登不上，且
 * 报错很难查。走同源代理后浏览器只看到 sgu-acw.zh314.xyz，Cookie 是
 * 第一方的，CORS 和 SameSite 都不用管。
 *
 * 这一层还顺带做两件事：
 *   - 加上 X-Origin-Secret，后端只认带这个头的请求，于是别人就算知道源站
     地址也绕不过 Cloudflare 直接打后端。
 *   - 用 _routes.json 把自己限定在 /api/*，静态资源不消耗 Functions 额度。
 */

//: 源站。本地开发时用 SGU_ACW_API_ORIGIN 指到本机后端。
const DEFAULT_ORIGIN = 'https://sgu-acw-api.hsn8086.com'

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const origin = env.SGU_ACW_API_ORIGIN || DEFAULT_ORIGIN

  // 只转发路径与查询串，主机名换成源站。
  const target = new URL(url.pathname + url.search, origin)

  const headers = new Headers(request.headers)
  // Host 必须由 fetch 按目标地址重写，否则源站的 OpenResty 会因为
  // server_name 不匹配而落到默认站点。
  headers.delete('host')
  // 让后端能看到真实来源，便于排查。
  headers.set('X-Forwarded-Host', url.host)
  headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''))
  const clientIp = request.headers.get('CF-Connecting-IP')
  if (clientIp) headers.set('X-Real-IP', clientIp)

  if (env.SGU_ACW_ORIGIN_SECRET) {
    headers.set('X-Origin-Secret', env.SGU_ACW_ORIGIN_SECRET)
  }

  let upstream
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ detail: '后端暂时不可用，请稍后重试' }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    )
  }

  // 不能直接把 upstream.headers 塞进 Response：多个 Set-Cookie 会被合并成
  // 一条，登录 Cookie 就丢了。必须逐条 append。
  const responseHeaders = new Headers()
  for (const [key, value] of upstream.headers) {
    if (key.toLowerCase() === 'set-cookie') continue
    responseHeaders.set(key, value)
  }
  for (const cookie of upstream.headers.getSetCookie?.() ?? []) {
    responseHeaders.append('Set-Cookie', cookie)
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}
