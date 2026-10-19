import type { Execution, JudgeRequest, JudgeResult, Manifest, PackageState, Progress, Runtime, RuntimeId, Verdict } from '../../src/lib/learning/types'
import { checkPoint } from './checker'
import { policy } from './policy'

// 父域白名单在构建期写死，不从 URL 读——查询参数任何人都能改，
// 读它等于让任意站点嵌进运行器。
const allowedParent = (import.meta.env.VITE_LEARN_PARENT || document.body.dataset.parent || '').replace(/\/$/, '')
if (!allowedParent) throw new Error('运行器缺少父域白名单配置')
let token: string | null = null
const operations = new Map<string, AbortController>()
const controlName = 'learning-control-v1'
// 对象缓存跨环境共享：Java 8 / Java 21 引用同一套 ~300MB 运行时，
// 资产按内容哈希 URL 寻址，只存一份、只下载一次。
const objectsName = 'learning-objects'
const activePath = (id: string) => `${location.origin}/__installed/${id}`
const artifacts = new Map<string, Uint8Array>()
let running = false

async function manifest(): Promise<Manifest> {
  const cache = await caches.open(controlName), key = `${location.origin}/__manifest`
  try {
    const response = await fetch('/packages/manifest.json', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(12000) })
    if (!response.ok) throw new Error('运行包清单不可用，请先运行 learning:prepare')
    await cache.put(key, response.clone())
    return response.json()
  } catch (error) {
    const cached = await cache.match(key)
    if (cached) return cached.json()
    throw error
  }
}
async function pointer(id: RuntimeId): Promise<string | null> {
  const response = await (await caches.open(controlName)).match(activePath(id))
  return response ? (await response.json()).mark : null
}
async function installed(r: Runtime): Promise<boolean> {
  const mark = await pointer(r.id)
  if (mark !== `${r.id}-${r.version}`) return false
  const cache = await caches.open(objectsName)
  for (const a of r.assets) if (!await cache.match(a.path)) return false
  return r.available && r.assets.length > 0
}
async function activeRuntime(id: RuntimeId): Promise<Runtime | null> {
  const response = await (await caches.open(controlName)).match(activePath(id))
  return response ? (await response.json()).runtime ?? null : null
}
async function states(): Promise<PackageState[]> {
  return Promise.all((await manifest()).runtimes.map(async r => {
    const active = await activeRuntime(r.id), ready = !!active && await installed(active)
    return { id: r.id, version: ready ? active!.version : null, ready }
  }))
}
async function locked<T>(id: RuntimeId, signal: AbortSignal, action: () => Promise<T>, mode: 'shared' | 'exclusive' = 'exclusive'): Promise<T> {
  if (!navigator.locks) throw new Error('当前浏览器不支持安全的运行包安装锁，请使用较新的浏览器')
  return navigator.locks.request(`learning-${id}`, { mode, signal }, action)
}
async function runtime(id: RuntimeId): Promise<Runtime> {
  const r = (await manifest()).runtimes.find(r => r.id === id)
  if (!r) throw new Error('未知运行环境')
  if (!r.available) throw new Error(r.reason || '该环境尚未完成验证')
  return r
}
async function install(id: RuntimeId, signal: AbortSignal, progress: (p: Progress) => void) {
  const r = await runtime(id)
  await locked(id, signal, async () => {
    if (await installed(r)) return
    const space = await navigator.storage.estimate()
    const total = r.assets.reduce((n, a) => n + a.bytes, 0)
    if (space.quota && space.quota - (space.usage ?? 0) < total * 1.2) throw new Error('浏览器存储空间不足，请删除不用的运行包')
    const cache = await caches.open(objectsName)
    let done = 0
    {
      for (const asset of r.assets) {
        signal.throwIfAborted()
        if (await cache.match(asset.path)) { done += asset.bytes; continue }  // 已被其他环境装好
        const response = await fetch(asset.path, { credentials: 'omit', signal, cache: 'no-cache' })
        if (!response.ok || !response.body) throw new Error(`资源下载失败：${asset.path}`)
        // 服务器存的是 Brotli 包并声明 Content-Encoding: br，浏览器原生解压。
        // 不用 DecompressionStream：Chrome 不支持 brotli 这个格式名。
        const reader = response.body.getReader(), chunks: Uint8Array[] = []
        let count = 0
        while (true) {
          const { value, done: ended } = await reader.read()
          if (ended) break
          count += value.length
          if (count > asset.bytes) { await reader.cancel(); throw new Error('资源大小不匹配') }
          chunks.push(value)
          progress({ phase: '下载并安装资源', done: done + count, total })
        }
        if (count !== asset.bytes) throw new Error('资源下载不完整')
        const bytes = new Uint8Array(count)
        let at = 0
        for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length }
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('')
        if (hash !== asset.sha256) throw new Error('运行包校验失败，请重试')
        await cache.put(asset.path, new Response(bytes, { headers: { 'Content-Type': asset.type } }))
        done += count
        progress({ phase: '校验通过', done, total })
      }
      signal.throwIfAborted()
      // This marker is the commit point; an interrupted install never replaces the active version.
      await (await caches.open(controlName)).put(activePath(id), Response.json({ mark: `${r.id}-${r.version}`, version: r.version, runtime: r }))
      void navigator.storage.persist().catch(() => false)
    }
  })
}
async function remove(id: RuntimeId, signal: AbortSignal) {
  await locked(id, signal, async () => {
    await (await caches.open(controlName)).delete(activePath(id))
    // 清掉只被这个环境引用的对象；其他已装环境仍在用的资产保留。
    const active = (await caches.open(controlName))
    const remaining = new Set<string>()
    for (const req of await active.keys()) {
      if (!req.url.includes('/__installed/')) continue
      const mark = await active.match(req)
      const rt = mark && (await mark.json()).runtime
      if (rt) for (const a of rt.assets) remaining.add(a.path)
    }
    const objects = await caches.open(objectsName)
    for (const req of await objects.keys()) {
      if (!remaining.has(new URL(req.url).pathname)) await objects.delete(req)
    }
  })
}

function execute(r: Runtime, request: JudgeRequest, input: string, assets: Record<string, Uint8Array>, key: string,
  signal: AbortSignal, progress: (p: Progress) => void): Promise<Execution> {
  return new Promise(resolve => {
    const worker = new Worker('/engine/worker.js', { type: 'module' })
    let finished = false, started = false
    const abort = () => finish({ verdict: 'CANCELLED', stdout: '', stderr: '' })
    let timer = setTimeout(() => finish({ verdict: 'ENVIRONMENT_ERROR', stdout: '', stderr: '', error: '环境初始化或编译超时' }), policy.compileTimeoutMs)
    const finish = (result: Execution) => {
      if (finished) return
      finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort); worker.terminate(); resolve(result)
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { abort(); return }
    worker.onmessage = event => {
      if (event.data.phase) {
        progress({ phase: event.data.phase })
        if (event.data.phase === '执行程序' && !started) {
          started = true
          clearTimeout(timer)
          timer = setTimeout(() => finish({ verdict: 'TLE', stdout: '', stderr: '', error: `单测试点时限 ${request.timeMs} ms` }), request.timeMs)
        }
      }
      const artifact = event.data.artifact
      if (artifact instanceof Uint8Array && artifact.byteLength <= 8 * 1048576) {
        artifacts.delete(key); artifacts.set(key, artifact)
        while (artifacts.size > 4 || [...artifacts.values()].reduce((n, a) => n + a.length, 0) > 16 * 1048576) artifacts.delete(artifacts.keys().next().value!)
      }
      if (event.data.result) finish(event.data.result)
    }
    worker.onerror = event => finish({ verdict: 'ENVIRONMENT_ERROR', stdout: '', stderr: '', error: event.message })
    worker.postMessage({ environment: request.environment, source: request.source, input, runtime: r, assets, artifact: artifacts.get(key) })
  })
}
async function judge(request: JudgeRequest, signal: AbortSignal, progress: (p: Progress) => void): Promise<JudgeResult> {
  if (running) throw new Error('已有评测正在进行')
  if (!['c', 'cpp', 'python', 'java8', 'java21'].includes(request.environment) || typeof request.source !== 'string'
    || new TextEncoder().encode(request.source).length > 256000 || !request.cases?.length || request.cases.length > 100
    || !['exact', 'tokens'].includes(request.checker) || !Number.isInteger(request.timeMs) || request.timeMs < 100 || request.timeMs > 30000
    || request.cases.some(t => typeof t.input !== 'string' || typeof t.output !== 'string' || t.input.length > 1000000 || t.output.length > 1000000)) throw new Error('评测参数无效')
  running = true
  try {
    const r = await activeRuntime(request.environment === 'c' || request.environment === 'cpp' ? 'c-cpp' : request.environment)
    if (!r || !r.available) throw new Error('请先安装已验证的运行环境')
    return await locked(r.id, signal, async () => {
      if (!await installed(r)) throw new Error('请先下载所选语言的运行包')
      const cache = await caches.open(objectsName), assets: Record<string, Uint8Array> = {}
      progress({ phase: '载入已安装的环境' })
      for (const a of r.assets) {
        const response = await cache.match(a.path)
        if (!response) throw new Error('安装资源已被浏览器清理，请重新安装')
        // 大体积资产（Java 运行时/jimage/jar）不进消息体；worker 直接从共享对象缓存读。
        if (a.bytes > 4 * 1048576) continue
        assets[a.path] = new Uint8Array(await response.arrayBuffer())
      }
      const key = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${r.version}\n${request.environment}\n${JSON.stringify(policy)}\n${request.source}`)))].map(n => n.toString(16).padStart(2, '0')).join('')
      const points: JudgeResult['points'] = []
      for (const [index, test] of request.cases.entries()) {
        if (signal.aborted) throw new DOMException('已取消', 'AbortError')
        progress({ phase: `测试点 ${index + 1}`, point: index + 1, points: request.cases.length })
        const execution = await execute(r, request, test.input, assets, key, signal, p => progress({ ...p, point: index + 1, points: request.cases.length }))
        points.push(checkPoint(execution, test, request.checker, request.custom))
        if (execution.verdict !== 'OK') break
      }
      const verdict: Verdict = points.find(p => p.verdict !== 'AC')?.verdict ?? 'AC'
      return { id: crypto.randomUUID(), runtimeVersion: `${r.version}/${policy.id}`, verdict, points }
    }, 'shared')
  } finally { running = false }
}

if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/engine/sw.js', { scope: '/' }).catch(() => undefined)
}
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== allowedParent || !event.data || typeof event.data.id !== 'string') return
  const { id, method, payload } = event.data
  if (method === 'connect' && !token && typeof event.data.token === 'string') token = event.data.token
  if (!token || event.data.token !== token) return
  const send = (data: unknown) => window.parent.postMessage({ id, token, ...data as object }, allowedParent)
  if (method === 'cancel') { operations.get(id)?.abort(); return }
  const controller = new AbortController()
  operations.set(id, controller)
  const progress = (p: Progress) => send({ progress: p })
  const process = async () => {
    switch (method) {
      case 'connect': return { ready: true }
      case 'manifest': return manifest()
      case 'status': return states()
      case 'install': return install(payload?.runtime, controller.signal, progress)
      case 'remove': return remove(payload?.runtime, controller.signal)
      case 'run': return judge(payload, controller.signal, progress)
      default: throw new Error('未知运行器操作')
    }
  }
  void process().then(result => send({ result }), error => send({ error: error instanceof Error ? error.message : String(error) }))
    .finally(() => operations.delete(id))
})
