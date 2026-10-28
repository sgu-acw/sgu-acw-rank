import type { Execution, JudgeRequest, JudgeResult, LspId, Manifest, PackageState, Progress, Runtime, RuntimeId, Verdict } from '../../src/lib/learning/types'
import { checkPoint } from './checker'
import { policy } from './policy'
import { pyrightInitializationOptions } from './pyright'
import { packageDownloadUrl } from './package-download'

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
  // mark 只证明「装过」，资产清单以当前 manifest 为准。
  const cache = await caches.open(objectsName)
  for (const a of r.assets) if (!await cache.match(a.path)) return false
  return r.available && r.assets.length > 0
}
async function activeRuntime(id: RuntimeId): Promise<Runtime | null> {
  const response = await (await caches.open(controlName)).match(activePath(id))
  return response ? (await response.json()).runtime ?? null : null
}
async function states(): Promise<PackageState[]> {
  // 必须拿当前 manifest 的 runtime 定义去查资产，不能用安装时存下的快照：
  // 快照的 assets 是旧的，新加进包里的文件（比如语言服务）会被漏掉，
  // 于是「已安装」为真但那些文件其实没下载。
  // downloaded 是上次中断留下的断点字节数，让界面能提示「继续下载」。
  const partial = await partials()
  return Promise.all((await manifest()).runtimes.map(async r => {
    const ready = await installed(r)
    const downloaded = r.assets.reduce((n, a) => n + (partial[a.path] ?? 0), 0)
    return { id: r.id, version: ready ? r.version : null, ready, downloaded }
  }))
}
/**
 * 语言服务的资产并进了对应语言包，装语言包时就一起装好。
 * 这里只查资产是否真的在缓存里——不要跟着运行包版本走：重新打包会换版本号，
 * 但资产内容可能一模一样，跟着版本判断会让已装好的补全莫名失效。
 */
async function lspReady(id: LspId): Promise<string | null> {
  const service = (await manifest()).services?.[id]
  if (!service || !service.assets.length) return null
  const cache = await caches.open(objectsName)
  for (const a of service.assets) if (!await cache.match(a.path)) return null
  return `${id}-${service.assets.length}`
}

/**
 * 语言服务只能在运行器 origin 里启动：资源是这里的 blob: URL，
 * 主站页面 new Worker 会被同源策略拦掉。所以页面只发 RPC，服务跑在这。
 */
interface LspSession {
  worker: Worker
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>
  nextId: number
  version: number
  diagnostics: LspDiagnostic[]
  waiters: Array<() => void>
  file: string
}
interface LspDiagnostic { range: { start: { line: number; character: number }; end: { line: number; character: number } }; message: string; severity?: number }
const lspSessions = new Map<string, LspSession>()
const clangdSessions = new Map<string, { port: MessagePort; dispose(): void }>()
const lspUri = (env: string) => env === 'python' ? 'file:///workspace/main.py' : env === 'c' ? 'file:///workspace/main.c' : 'file:///workspace/main.cpp'

async function lspAssetUrl(id: LspId, suffix: string): Promise<string | null> {
  const service = (await manifest()).services?.[id]
  const asset = service?.assets.find(a => a.path.endsWith(suffix))
  if (!asset) return null
  const hit = await (await caches.open(objectsName)).match(asset.path)
  if (!hit) throw new Error('语言服务资源缺失，请重新安装')
  return URL.createObjectURL(await hit.blob())
}

async function lspStart(id: LspId, environment: string, code: string): Promise<void> {
  await lspStop(id)
  const uri = lspUri(environment)
  const session: LspSession = { worker: null as unknown as Worker, pending: new Map(), nextId: 1, version: 1, diagnostics: [], waiters: [], file: uri }
  const receive = (message: Record<string, unknown>) => {
    if (!message) return
    if (message.method && message.id !== undefined) {
      const params = message.params as { items?: { section?: string }[] } | undefined
      const result = message.method === 'workspace/configuration'
        ? (params?.items ?? []).map(item => item.section === 'python.analysis'
          ? { typeshedPaths: ['/typeshed'], typeCheckingMode: 'basic', diagnosticMode: 'openFilesOnly', autoImportCompletions: false }
          : {})
        : null
      session.worker.postMessage({ jsonrpc: '2.0', id: message.id, result })
      return
    }
    if (message.method === 'textDocument/publishDiagnostics') {
      const params = message.params as { uri?: string; diagnostics?: LspDiagnostic[] } | undefined
      if (params?.uri === uri) {
        session.diagnostics = params.diagnostics ?? []
        for (const wake of session.waiters.splice(0)) wake()
      }
      return
    }
    if (typeof message.id === 'number') {
      const entry = session.pending.get(message.id)
      if (!entry) return
      clearTimeout(entry.timer); session.pending.delete(message.id)
      const error = message.error as { message?: string } | undefined
      if (error) entry.reject(new Error(error.message ?? 'LSP 错误'))
      else entry.resolve(message.result)
    }
  }
  const rpc = (method: string, params: unknown, timeout = 30000) => new Promise<unknown>((resolve, reject) => {
    const n = session.nextId++
    const timer = setTimeout(() => { if (session.pending.delete(n)) reject(new Error(`${id} ${method} 超时`)) }, timeout)
    session.pending.set(n, { resolve, reject, timer })
    session.worker.postMessage({ jsonrpc: '2.0', id: n, method, params })
  })
  let initializationOptions: unknown
  if (id === 'pyright') {
    const stdlib = await lspAssetUrl('pyright', 'stdlib.json')
    if (!stdlib) throw new Error('Python 语言包缺少类型声明，请更新 Python 语言包')
    try {
      initializationOptions = pyrightInitializationOptions(await (await fetch(stdlib)).json())
    } finally {
      URL.revokeObjectURL(stdlib)
    }
    const entry = await lspAssetUrl('pyright', 'pyright.worker.js')
    if (!entry) throw new Error('缺少 pyright 运行时')
    session.worker = new Worker(entry, { type: 'classic' })
    session.worker.postMessage({ type: 'browser/boot', mode: 'foreground' })
    session.worker.onmessage = event => receive(event.data as Record<string, unknown>)
  } else {
    // clangd 必须走打包好的入口：它内部用 SharedWorker + new URL(import.meta.url)
    // 定位 wasm，裸 Worker 拿不到资产，会一直停在 initialize。
    const { openSession } = await import(/* @vite-ignore */ new URL('/engine/clangd.js', location.origin).href) as {
      openSession: (o: { uri: string; compilerArguments?: string }) => Promise<{ port: MessagePort; dispose(): void }>
    }
    let opened
    try {
      opened = await openSession({ uri, compilerArguments: environment === 'c' ? '-std=c11' : '-std=c++17' })
    } catch (error) {
      // clangd 依赖 SharedWorker + JSPI，某些环境会静默失败；这里给出可读原因，
      // 让界面显示「不可用」而不是一直转圈。
      throw new Error(`clangd 启动失败：${error instanceof Error ? error.message : String(error)}`)
    }
    clangdSessions.set(id, opened)
    opened.port.onmessage = event => receive(event.data as Record<string, unknown>)
    // 用 port 代替 worker 收发；下面的 rpc 会检查这个分支。
    session.worker = { postMessage: (m: unknown) => opened.port.postMessage(m), terminate: () => opened.dispose() } as unknown as Worker
  }
  lspSessions.set(id, session)

  await rpc('initialize', {
    processId: null, rootUri: 'file:///workspace',
    capabilities: {
      workspace: { configuration: true },
      textDocument: {
        completion: { completionItem: { snippetSupport: false } },
        publishDiagnostics: { versionSupport: true },
      },
    },
    ...(initializationOptions ? { initializationOptions } : {}),
  }, 120000)
  session.worker.postMessage({ jsonrpc: '2.0', method: 'initialized', params: {} })
  session.worker.postMessage({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: {
    textDocument: { uri, languageId: id === 'pyright' ? 'python' : environment === 'c' ? 'c' : 'cpp', version: 1, text: code },
  } })
}

function lspStop(id: LspId): void {
  const session = lspSessions.get(id)
  if (!session) return
  for (const entry of session.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('语言服务已关闭')) }
  session.pending.clear()
  session.worker.terminate()
  clangdSessions.get(id)?.dispose()
  clangdSessions.delete(id)
  lspSessions.delete(id)
}

async function lspComplete(id: LspId, code: string, line: number, character: number) {
  const session = lspSessions.get(id)
  if (!session) throw new Error('语言服务未启动')
  session.version += 1
  session.worker.postMessage({ jsonrpc: '2.0', method: 'textDocument/didChange', params: {
    textDocument: { uri: session.file, version: session.version }, contentChanges: [{ text: code }],
  } })
  const result = await new Promise<unknown>((resolve, reject) => {
    const n = session.nextId++
    const timer = setTimeout(() => { if (session.pending.delete(n)) reject(new Error('补全超时')) }, 15000)
    session.pending.set(n, { resolve, reject, timer })
    session.worker.postMessage({ jsonrpc: '2.0', id: n, method: 'textDocument/completion', params: {
      textDocument: { uri: session.file }, position: { line, character }, context: { triggerKind: 1 },
    } })
  }) as { items?: unknown[] } | unknown[] | null
  if (!result) return []
  return Array.isArray(result) ? result : result.items ?? []
}

async function lspDiagnostics(id: LspId): Promise<LspDiagnostic[]> {
  const session = lspSessions.get(id)
  if (!session) throw new Error('语言服务未启动')
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, 5000)
    session.waiters.push(() => { clearTimeout(timer); resolve() })
  })
  return session.diagnostics
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
/**
 * 断点续传用的缓存。大资产（java21.jar 137 MiB、headers.data 43 MiB）在网络
 * 抖动时很容易断，断一次就整包重来是最糟的体验。这里把已收到的字节按 1 MiB
 * 落一次盘，下次用 Range 从断点继续；服务端已开 accept-ranges。
 */
const partialName = 'learning-partial-v1'
const partialKey = (path: string) => `${location.origin}/__partial/${path.split('/').pop()}`
const bytesToText = (bytes: Uint8Array) => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}
const textToBytes = (text: string) => {
  const raw = atob(text), bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}
async function readPartial(path: string): Promise<Uint8Array | null> {
  const hit = await (await caches.open(partialName)).match(partialKey(path))
  if (!hit) return null
  const data = await hit.json() as { path: string; chunk: string }
  return data.path === path ? textToBytes(data.chunk) : null
}
async function writePartial(path: string, bytes: Uint8Array): Promise<void> {
  const cache = await caches.open(partialName)
  if (!bytes.length) { await cache.delete(partialKey(path)); return }
  await cache.put(partialKey(path), Response.json({ path, chunk: bytesToText(bytes) }))
}
const clearPartial = async (path: string) => (await caches.open(partialName)).delete(partialKey(path))

/** 上次中断留下的断点：资产路径 → 已下载字节数，供界面提示「继续下载」。 */
async function partials(): Promise<Record<string, number>> {
  const cache = await caches.open(partialName), out: Record<string, number> = {}
  for (const request of await cache.keys()) {
    const hit = await cache.match(request)
    if (!hit) continue
    const data = await hit.json() as { path: string; chunk: string }
    if (data.path && data.chunk) out[data.path] = Math.floor(data.chunk.length * 3 / 4)
  }
  return out
}

const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')) }, { once: true })
})

function contentRange(response: Response): { start: number; end: number; total: number } | null {
  const value = response.headers.get('content-range')
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
  if (!match) return null
  const start = Number(match[1]), end = Number(match[2]), total = Number(match[3])
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && Number.isSafeInteger(total)
    ? { start, end, total } : null
}

/**
 * 把一个资产下载到内存，支持 Range 续传与指数退避重试。
 * 校验交给调用方——这里只负责把完整字节拿回来。
 */
async function fetchAsset(asset: { path: string; bytes: number }, signal: AbortSignal, onProgress: (n: number) => void): Promise<Uint8Array> {
  let buffer = await readPartial(asset.path) ?? new Uint8Array(0)
  if (buffer.length > asset.bytes) { buffer = new Uint8Array(0); await clearPartial(asset.path) }
  onProgress(buffer.length)

  for (let attempt = 0; ; attempt += 1) {
    signal.throwIfAborted()
    try {
      const headers: Record<string, string> = {}
      if (buffer.length) headers.Range = `bytes=${buffer.length}-`
      const response = await fetch(packageDownloadUrl(asset.path, location.origin), { credentials: 'omit', signal, cache: 'no-cache', headers })
      // 206 是续传；200 说明服务端忽略了 Range，只能从头收。
      if (response.status === 200 && buffer.length) { buffer = new Uint8Array(0); onProgress(0) }
      if (!response.ok || !response.body) throw new Error(`资源下载失败：${asset.path}`)
      // CDN 可能缓存一个与本次 Range 不对应的 206。不能把它直接接在断点后，
      // 否则会重复拼接一段内容，直到超出清单大小才报错。清掉断点后从头取。
      if (response.status === 206) {
        const range = contentRange(response)
        const expectedStart = buffer.length
        if (!range || range.start !== expectedStart || range.total !== asset.bytes || range.end < range.start) {
          await response.body.cancel()
          buffer = new Uint8Array(0)
          await clearPartial(asset.path)
          onProgress(0)
          throw new Error('资源范围不匹配')
        }
      }
      const reader = response.body.getReader()
      const pieces: Uint8Array[] = buffer.length ? [buffer] : []
      let received = buffer.length, checkpoint = buffer.length
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        pieces.push(value)
        received += value.length
        if (received > asset.bytes) {
          await reader.cancel()
          // 这通常表示服务端返回了错误的 Range；下一轮从头下载，避免重复失败。
          buffer = new Uint8Array(0)
          await clearPartial(asset.path)
          onProgress(0)
          throw new Error('资源大小不匹配')
        }
        onProgress(received)
        // 每 1 MiB 落一次断点，中断最多损失 1 MiB 进度。
        if (received - checkpoint >= 1 << 20) {
          const snapshot = new Uint8Array(received)
          let at = 0
          for (const piece of pieces) { snapshot.set(piece, at); at += piece.length }
          buffer = snapshot
          pieces.length = 1
          pieces[0] = snapshot
          checkpoint = received
          await writePartial(asset.path, snapshot)
        }
      }
      if (received !== asset.bytes) throw new Error('资源下载不完整')
      const complete = new Uint8Array(received)
      let at = 0
      for (const piece of pieces) { complete.set(piece, at); at += piece.length }
      await clearPartial(asset.path)
      return complete
    } catch (error) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError')
      if (buffer.length) await writePartial(asset.path, buffer)
      if (attempt >= 4) throw error
      // 指数退避：0.5s / 1s / 2s / 4s，网络切换后通常能自己恢复。
      await pause(Math.min(8000, 500 * 2 ** attempt), signal)
    }
  }
}

async function install(id: RuntimeId, signal: AbortSignal, progress: (p: Progress) => void) {
  const r = await runtime(id)
  await locked(id, signal, async () => {
    if (await installed(r)) return
    const space = await navigator.storage.estimate()
    const total = r.assets.reduce((n, a) => n + a.bytes, 0)
    if (space.quota && space.quota - (space.usage ?? 0) < total * 1.2) throw new Error('浏览器存储空间不足，请删除不用的运行包')
    const cache = await caches.open(objectsName)
    // 已被其他语言包装好的资产先计入进度，避免进度条从 0 跳。
    let done = 0
    for (const asset of r.assets) if (await cache.match(asset.path)) done += asset.bytes
    progress({ phase: '准备下载', done, total })

    for (const asset of r.assets) {
      signal.throwIfAborted()
      if (await cache.match(asset.path)) continue
      // 服务器存的是 Brotli 包并声明 Content-Encoding: br，浏览器原生解压。
      // 不用 DecompressionStream：Chrome 不支持 brotli 这个格式名。
      const bytes = await fetchAsset(asset, signal, n => progress({ phase: '下载运行包', done: done + n, total }))
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource))]
        .map(n => n.toString(16).padStart(2, '0')).join('')
      if (hash !== asset.sha256) {
        await clearPartial(asset.path)
        throw new Error('运行包校验失败，请重试')
      }
      await cache.put(asset.path, new Response(bytes as unknown as BodyInit, { headers: { 'Content-Type': asset.type } }))
      done += asset.bytes
      progress({ phase: '校验通过', done, total })
    }
    signal.throwIfAborted()
    // This marker is the commit point; an interrupted install never replaces the active version.
    await (await caches.open(controlName)).put(activePath(id), Response.json({ mark: `${r.id}-${r.version}`, version: r.version, runtime: r }))
    void navigator.storage.persist().catch(() => false)
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

function execute(r: Runtime, request: JudgeRequest, test: { input: string; output: string }, assets: Record<string, Uint8Array>, key: string,
  spj: { runtime: Runtime; assets: Record<string, Uint8Array> } | undefined,
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
    worker.postMessage({ environment: request.environment, source: request.source, input: test.input, expected: test.output,
      checker: request.checker, checkerSource: request.checkerSource, runtime: r, assets, spj, artifact: artifacts.get(key) })
  })
}
async function judge(request: JudgeRequest, signal: AbortSignal, progress: (p: Progress) => void): Promise<JudgeResult> {
  if (running) throw new Error('已有评测正在进行')
  if (!['c', 'cpp', 'python', 'java8', 'java21'].includes(request.environment) || typeof request.source !== 'string'
    || new TextEncoder().encode(request.source).length > 256000 || !request.cases?.length || request.cases.length > 100
    || !['exact', 'tokens', 'spj'].includes(request.checker) || !Number.isInteger(request.timeMs) || request.timeMs < 100 || request.timeMs > 30000
    || (request.checker === 'spj' && (typeof request.checkerSource !== 'string' || !request.checkerSource.trim() || request.checkerSource.length > 100000))
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
      // SPJ 走 Python 判定程序：运行包要和主语言包分开装载，装进 worker 消息里。
      let spj: { runtime: Runtime; assets: Record<string, Uint8Array> } | undefined
      if (request.checker === 'spj') {
        const spjRt = await activeRuntime('python')
        if (!spjRt || !spjRt.available || !await installed(spjRt)) throw new Error('Special Judge 需要安装 Python 语言包')
        const spjAssets: Record<string, Uint8Array> = {}
        progress({ phase: '载入判定程序环境' })
        for (const a of spjRt.assets) {
          const response = await cache.match(a.path)
          if (!response) throw new Error('Python 语言包资源缺失，请重新安装')
          if (a.bytes > 4 * 1048576) continue
          spjAssets[a.path] = new Uint8Array(await response.arrayBuffer())
        }
        spj = { runtime: spjRt, assets: spjAssets }
      }
      const key = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${r.version}\n${request.environment}\n${JSON.stringify(policy)}\n${request.source}`)))].map(n => n.toString(16).padStart(2, '0')).join('')
      const points: JudgeResult['points'] = []
      for (const [index, test] of request.cases.entries()) {
        if (signal.aborted) throw new DOMException('已取消', 'AbortError')
        progress({ phase: `测试点 ${index + 1}`, point: index + 1, points: request.cases.length })
        const execution = await execute(r, request, test, assets, key, spj, signal, p => progress({ ...p, point: index + 1, points: request.cases.length }))
        points.push(checkPoint(execution, test, request.checker, request.custom))
        if (execution.verdict !== 'OK') break
      }
      const verdict: Verdict = points.find(p => p.verdict !== 'AC')?.verdict ?? 'AC'
      return { id: crypto.randomUUID(), runtimeVersion: `${r.version}/${policy.id}`, verdict, points }
    }, 'shared')
  } finally { running = false }
}

// ------------------------------------------------------------------ 交互终端
// 同一时刻只允许一个终端会话。worker 在 wasm 挂起等输入时事件循环仍然活着，
// 所以 ttyInput/ttyEof 消息直接 postMessage 进 worker 就能被消费。
let ttyWorker: Worker | null = null
const ttyInput = (data: string) => ttyWorker?.postMessage({ stdin: data })
const ttyEof = () => ttyWorker?.postMessage({ stdinClose: true })

async function ttyOpen(payload: { environment?: string; source?: string }, signal: AbortSignal,
  emit: (event: Record<string, unknown>) => void): Promise<{ ended: true }> {
  if (running) throw new Error('已有评测正在进行')
  if (ttyWorker) throw new Error('已有终端会话')
  const environment = String(payload?.environment ?? '')
  const source = String(payload?.source ?? '')
  // Java 的 stdin 是 B-JVM 的同步 FFI，挂起不了；先只支持 WASI 系语言。
  if (!['c', 'cpp', 'python'].includes(environment)) throw new Error('交互终端暂不支持该语言')
  if (new TextEncoder().encode(source).length > 256000) throw new Error('源码过大')
  const r = await activeRuntime(environment === 'python' ? 'python' : 'c-cpp')
  if (!r || !r.available) throw new Error('请先安装已验证的运行环境')
  running = true
  try {
    return await locked(r.id, signal, async () => {
      if (!await installed(r)) throw new Error('请先下载所选语言的运行包')
      const cache = await caches.open(objectsName)
      const assets: Record<string, Uint8Array> = {}
      emit({ event: 'status', data: '载入已安装的环境' })
      for (const a of r.assets) {
        const response = await cache.match(a.path)
        if (!response) throw new Error('安装资源已被浏览器清理，请重新安装')
        if (a.bytes > 4 * 1048576) continue
        assets[a.path] = new Uint8Array(await response.arrayBuffer())
      }
      return await new Promise<{ ended: true }>(resolve => {
        const worker = new Worker('/engine/worker.js', { type: 'module' })
        ttyWorker = worker
        let done = false
        const finish = () => {
          if (done) return
          done = true; ttyWorker = null
          signal.removeEventListener('abort', onAbort); worker.terminate(); resolve({ ended: true })
        }
        const onAbort = () => { emit({ event: 'exit', verdict: 'CANCELLED' }); finish() }
        signal.addEventListener('abort', onAbort, { once: true })
        // 不设会话时限：程序退出、用户关终端、或离开页面时自然结束。
        worker.onmessage = event => {
          const d = event.data
          if (d?.phase) emit({ event: 'status', data: String(d.phase) })
          if (d?.tty) emit(d.tty)
          if (d?.result) {
            emit({ event: 'exit', verdict: d.result.verdict, error: d.result.error, elapsedMs: d.result.elapsedMs })
            finish()
          }
        }
        worker.onerror = event => {
          emit({ event: 'error', data: event.message })
          emit({ event: 'exit', verdict: 'ENVIRONMENT_ERROR' }); finish()
        }
        worker.postMessage({ tty: true, environment, source, input: '', runtime: r, assets })
      })
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
      case 'lspStatus': return { clangd: await lspReady('clangd'), pyright: await lspReady('pyright') }
      case 'lspStart': return lspStart(payload?.service, payload?.environment, payload?.code)
      case 'lspStop': return lspStop(payload?.service)
      case 'lspComplete': return lspComplete(payload?.service, payload?.code, payload?.line, payload?.character)
      case 'lspDiagnostics': return lspDiagnostics(payload?.service)
      case 'tty': return ttyOpen(payload, controller.signal, e => send({ tty: e }))
      case 'ttyInput': ttyInput(String(payload?.data ?? '')); return true
      case 'ttyEof': ttyEof(); return true
      default: throw new Error('未知运行器操作')
    }
  }
  void process().then(result => send({ result }), error => send({ error: error instanceof Error ? error.message : String(error) }))
    .finally(() => operations.delete(id))
})
