/**
 * /blog/rss.xml → 后端的 /api/posts/rss.xml。
 *
 * 文章在数据库里，RSS 得实时生成，没法做静态文件。借 Functions 转发一层，
 * 订阅者拿到的是站点域名下的地址，不用知道 API 在哪台机器。
 */

const DEFAULT_ORIGIN = 'https://sgu-acw-api.hsn8086.com'

export async function onRequest(context) {
  const { env } = context
  const origin = env.SGU_ACW_API_ORIGIN || DEFAULT_ORIGIN

  const headers = new Headers()
  if (env.SGU_ACW_ORIGIN_SECRET) {
    headers.set('X-Origin-Secret', env.SGU_ACW_ORIGIN_SECRET)
  }

  try {
    const upstream = await fetch(`${origin}/api/posts/rss.xml`, { headers })
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    })
  } catch {
    return new Response('RSS 暂时不可用', { status: 502 })
  }
}
