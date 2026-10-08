/**
 * /post/{slug} 的详情页路由。
 *
 * 文章在数据库里，详情页是同一个静态壳（/post/index.html），组件自己
 * 从 location.pathname 里取 slug 再拉数据。
 *
 * 为什么用 Functions 而不是 _redirects 的 200 rewrite：实测 Pages 的
 * rewrite 对 /post/* 不生效（返回 404）。Functions 拿到资产绑定后
 * 行为完全可控——返回 post/index.html 的内容，地址栏不变。
 */
export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  return env.ASSETS.fetch(new URL('/post/index.html', url.origin))
}
