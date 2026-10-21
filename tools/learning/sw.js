// The runner origin has no API, login state or user source-code persistence.
const engineCache = 'learning-engine-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

// clangd 的 lib/ 与 assets/ 文件同时存在于两处：引擎静态目录和语言包对象缓存
// （lsp-clangd-lib/、lsp-clangd-assets/）。SharedWorker 加载走 /engine/clangd/
// 静态路径，先把请求映射到对象缓存——语言包装过就不用再下一次 27 MB wasm。
let clangdMap = null
async function clangdObject(path) {
  const m = path.match(/^\/engine\/clangd\/(lib|assets)\/(.+)$/)
  if (!m) return null
  if (!clangdMap) {
    clangdMap = new Map()
    try {
      const manifest = await (await fetch('/packages/manifest.json')).json()
      for (const a of manifest.services?.clangd?.assets ?? []) {
        const i = a.path.indexOf('lsp-clangd-')
        if (i >= 0) clangdMap.set(a.path.slice(i), a.path)
      }
    } catch { /* manifest 取不到就当没有映射，走原来的网络路径 */ }
  }
  const objectPath = clangdMap.get(`lsp-clangd-${m[1]}/${m[2]}`)
  if (!objectPath) return null
  const hit = await (await caches.open('learning-objects')).match(objectPath)
  if (!hit) return null
  // 对象缓存里存的是 octet-stream（objects 路径没有后缀）。SharedWorker 的
  // instantiateStreaming 严格要求 application/wasm，类型不对编译直接挂，
  // 所以按扩展名重写 Content-Type 再出缓存。
  const type = path.endsWith('.wasm') ? 'application/wasm'
    : /\.m?js$/.test(path) ? 'text/javascript'
    : path.endsWith('.json') ? 'application/json' : null
  return type
    ? new Response(hit.body, { status: hit.status, statusText: hit.statusText,
        headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' } })
    : hit
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/packages/objects/')) {
    event.respondWith((async () => {
      for (const name of await caches.keys()) {
        if (!(name.startsWith('learning-package-') || name === 'learning-objects')) continue
        const hit = await (await caches.open(name)).match(event.request)
        if (hit) return hit
      }
      return fetch(event.request)
    })())
  } else if (url.pathname.startsWith('/engine/')) {
    event.respondWith((async () => {
      const hit = await clangdObject(url.pathname)
      if (hit) return hit
      const cache = await caches.open(engineCache)
      try {
        const response = await fetch(event.request)
        if (response.ok) await cache.put(event.request, response.clone())
        return response
      } catch (error) {
        const cached = await cache.match(event.request)
        if (cached) return cached
        throw error
      }
    })())
  }
})
