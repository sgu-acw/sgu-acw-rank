import { WASI, type WASIFS } from './vendor/wasi.js'
import { limitMemory } from './memory'
import { runJava } from './java'
import { policy } from './policy'
import type { Environment, Execution, Runtime } from '../../src/lib/learning/types'

const scope = globalThis as unknown as { onmessage: (e: MessageEvent<Work>) => void; postMessage: (data: unknown) => void }
interface Work { environment: Environment; source: string; input: string; expected?: string; checker?: string; checkerSource?: string;
  runtime: Runtime; assets: Record<string, Uint8Array>; artifact?: Uint8Array; tty?: boolean
  /** checker=spj 时判定程序的运行环境（Python 包），和主语言包分开传。 */
  spj?: { runtime: Runtime; assets: Record<string, Uint8Array> } }
type Tree = { [name: string]: string | Uint8Array | Tree }
const encoder = new TextEncoder()
const outputLimit = policy.outputBytes
const file = (path: string, content: Uint8Array) => ({ path, content, mode: 'binary' as const,
  timestamps: { access: new Date(0), modification: new Date(0), change: new Date(0) } })

function unpack(bytes: Uint8Array): WASIFS {
  const fs: WASIFS = {}, decoder = new TextDecoder()
  const text = (start: number, count: number) => decoder.decode(bytes.subarray(start, start + count)).split('\0')[0]
  for (let at = 0; at + 512 <= bytes.length;) {
    const name = text(at, 100)
    if (!name) break
    const prefix = text(at + 345, 155), size = parseInt(text(at + 124, 12).trim() || '0', 8), type = text(at + 156, 1)
    const path = '/' + (prefix ? prefix + '/' : '') + name.replace(/^\.\//, '')
    if (!Number.isFinite(size) || size < 0 || at + 512 + size > bytes.length || path.split('/').includes('..')) throw new Error('运行包归档无效')
    if (type === '0' || !type) fs[path] = file(path, bytes.slice(at + 512, at + 512 + size))
    else if (type !== '5') throw new Error(`不支持的归档条目 ${type}`)
    at += 512 + Math.ceil(size / 512) * 512
  }
  return fs
}

// ------------------------------------------------------------------ 交互终端 stdin
// 终端会话里 fd_read 是异步的：输入缓冲空了就 await 下一段，JSPI（WebAssembly.Suspending
// /promising）会把 wasm 挂起，worker 的事件循环仍然活着，host 转发来的 stdin
// 消息照常被消费——这是真交互，不是把输入攒够再跑一遍。
const ttyQueue: Uint8Array[] = []
const ttyWaiters: (() => void)[] = []
let ttyEof = false
let ttyChunk: Uint8Array | null = null
let ttyAt = 0
const ttyWake = () => { for (const wake of ttyWaiters.splice(0)) wake() }
const ttyFeed = (data: Uint8Array) => { if (data.length) { ttyQueue.push(data); ttyWake() } }
const ttyClose = () => { ttyEof = true; ttyWake() }
/** 等待下一段输入或 EOF。 */
async function ttyNext(): Promise<boolean> {
  if (ttyChunk) return true
  while (!ttyQueue.length && !ttyEof) await new Promise<void>(resolve => ttyWaiters.push(resolve))
  const next = ttyQueue.shift() ?? null
  if (!next) return false
  ttyChunk = next; ttyAt = 0
  return true
}
/** 已有缓冲时同步取；缓冲空了不等待。 */
function ttyBuffered(): boolean {
  if (ttyChunk) return true
  const next = ttyQueue.shift() ?? null
  if (!next) return false
  ttyChunk = next; ttyAt = 0
  return true
}

async function execute(binary: Uint8Array, args: string[], fs: WASIFS, input: string, tty = false): Promise<Execution> {
  // 交互终端依赖 JSPI 才能挂起等输入；不支持的浏览器明确报错，不静默降级。
  const jspi = typeof (WebAssembly as { Suspending?: unknown }).Suspending === 'function'
    && typeof (WebAssembly as { promising?: unknown }).promising === 'function'
  if (tty && !jspi) return { verdict: 'ENVIRONMENT_ERROR', stdout: '', stderr: '', error: '此浏览器不支持交互终端（需要支持 JSPI 的新版 Chrome 或 Edge）' }
  const wasi = new WASI({ args, fs, env: { LANG: 'C.UTF-8', PYTHONHASHSEED: '0' }, isTTY: false })
  const imports = wasi.getImportObject(), stdin = encoder.encode(input)
  if (tty) ttyFeed(stdin)
  let offset = 0, count = 0, stdout = '', stderr = ''
  const out = new TextDecoder(), err = new TextDecoder()
  for (const bindings of Object.values(imports)) {
    const originalRead = bindings.fd_read!, originalWrite = bindings.fd_write!
    const readStdin = async (iovs: number, length: number, read: number) => {
      const memory = new DataView(wasi.memory.buffer)
      let total = 0
      for (let i = 0; i < length; i++) {
        const ptr = memory.getUint32(iovs + i * 8, true)
        const size = memory.getUint32(iovs + i * 8 + 4, true)
        // 第一块可以挂起等输入；已经读到数据就不再等，按 POSIX 返回已有的。
        const have = total === 0 ? await ttyNext() : ttyBuffered()
        if (!have) break
        const data = ttyChunk!.subarray(ttyAt, ttyAt + size)
        ttyAt += data.length
        if (ttyAt >= ttyChunk!.length) ttyChunk = null
        new Uint8Array(wasi.memory.buffer, ptr, data.length).set(data)
        total += data.length
        if (data.length < size) break
      }
      memory.setUint32(read, total, true)
      return 0
    }
    // 交互模式把 fd_read 包进 Suspending：返回 Promise 时 wasm 挂起而不是读到 NaN。
    const Suspending = (WebAssembly as { Suspending?: new (f: (fd: number, iovs: number, length: number, read: number) => Promise<number>) => unknown }).Suspending
    bindings.fd_read = tty && Suspending
      ? new Suspending((fd: number, iovs: number, length: number, read: number) =>
          fd === 0 ? readStdin(iovs, length, read) : Promise.resolve(originalRead(fd, iovs, length, read))) as typeof bindings.fd_read
      : (fd, iovs, length, read) => {
        if (fd !== 0) return originalRead(fd!, iovs!, length!, read!)
        const memory = new DataView(wasi.memory.buffer)
        let total = 0
        for (let i = 0; i < length!; i++) {
          const ptr = memory.getUint32(iovs! + i * 8, true)
          const size = Math.min(memory.getUint32(iovs! + i * 8 + 4, true), stdin.length - offset)
          new Uint8Array(wasi.memory.buffer, ptr, size).set(stdin.subarray(offset, offset + size))
          offset += size; total += size
        }
        memory.setUint32(read!, total, true)
        return 0
      }
    bindings.fd_write = (fd, iovs, length, written) => {
      if (fd !== 1 && fd !== 2) return originalWrite(fd!, iovs!, length!, written!)
      const memory = new DataView(wasi.memory.buffer)
      let total = 0
      for (let i = 0; i < length!; i++) {
        const ptr = memory.getUint32(iovs! + i * 8, true), size = memory.getUint32(iovs! + i * 8 + 4, true)
        count += size
        if (count > outputLimit) throw new Error('OUTPUT_LIMIT_EXCEEDED')
        const bytes = new Uint8Array(wasi.memory.buffer, ptr, size)
        const text = (fd === 1 ? out : err).decode(bytes, { stream: true })
        if (fd === 1) stdout += text; else stderr += text
        // 终端会话里输出实时流出去，用户能看着程序边跑边打印。
        if (tty && text) scope.postMessage({ tty: { event: fd === 1 ? 'out' : 'err', data: text } })
        total += size
      }
      memory.setUint32(written!, total, true)
      return 0
    }
  }
  const module = await WebAssembly.compile(new Uint8Array(limitMemory(binary, policy.memoryPages)))
  const instance = await WebAssembly.instantiate(module, imports)
  if (tty) {
    // JSPI：promising 包住 _start，让 Suspending 的 fd_read 能把 wasm 挂起等输入。
    // wasi.start() 不会 await Promise，所以这里手动复现它做的事（proc_exit 抛
    // 出的对象带 code 字段）。
    const fields = wasi as unknown as Record<string, unknown>
    fields.hasBeenInitialized = true; fields.instance = instance; fields.module = module
    fields.memory = instance.exports.memory
    scope.postMessage({ tty: { event: 'ready' } })
    const started = performance.now()
    try {
      const promising = (WebAssembly as unknown as { promising: (f: () => void) => () => Promise<void> }).promising
      await promising(instance.exports._start as () => void)()
      return { verdict: 'OK', stdout: stdout + out.decode(), stderr: stderr + err.decode(), elapsedMs: performance.now() - started }
    } catch (error) {
      const code = (error as { code?: unknown })?.code
      if (typeof code === 'number') return { verdict: code ? 'RE' : 'OK', stdout: stdout + out.decode(), stderr: stderr + err.decode(),
        elapsedMs: performance.now() - started, ...(code ? { error: `退出码 ${code}` } : {}) }
      if (String(error).includes('OUTPUT_LIMIT_EXCEEDED')) return { verdict: 'OLE', stdout: stdout + out.decode(), stderr: stderr + err.decode(),
        elapsedMs: performance.now() - started, error: '输出超限' }
      return { verdict: 'RE', stdout: stdout + out.decode(), stderr: stderr + err.decode(),
        elapsedMs: performance.now() - started, error: error instanceof WebAssembly.RuntimeError ? '运行异常' : String(error) }
    }
  }
  scope.postMessage({ phase: '执行程序' })
  const started = performance.now()
  try {
    const result = wasi.start({ module, instance })
    return { verdict: result.exitCode ? 'RE' : 'OK', stdout: stdout + out.decode(), stderr: stderr + err.decode(),
      elapsedMs: performance.now() - started, ...(result.exitCode ? { error: `退出码 ${result.exitCode}` } : {}) }
  } catch (error) {
    return { verdict: String(error).includes('OUTPUT_LIMIT_EXCEEDED') ? 'OLE' : 'RE', stdout: stdout + out.decode(), stderr: stderr + err.decode(),
      elapsedMs: performance.now() - started, error: /stack|call stack/i.test(String(error)) ? '程序栈溢出' : String(error) }
  }
}

async function run(work: Work): Promise<Execution> {
  // 大资产（>4 MiB）不进消息体，由协调者放进共享对象缓存；这里统一按需取。
  const get = async (suffix: string): Promise<Uint8Array> => {
    const path = work.runtime.assets.find(a => a.path.endsWith(suffix))?.path
    if (!path) throw new Error(`运行包资源缺失：${suffix}，请重新安装`)
    const inMessage = work.assets[path]
    if (inMessage) return inMessage
    const hit = await (await caches.open('learning-objects')).match(path)
    if (!hit) throw new Error(`运行包资源缺失：${suffix}，请重新安装`)
    return new Uint8Array(await hit.arrayBuffer())
  }
  // All byte requests are fulfilled from verified resources supplied by the coordinator
  // or the shared, hash-pinned object cache (large Java assets are never put in messages).
  globalThis.fetch = async input => {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href).pathname
    const value = work.assets[path]
    if (value) return new Response(new Uint8Array(value), { headers: { 'Content-Type': 'application/wasm' } })
    const hit = await (await caches.open('learning-objects')).match(path)
    if (hit) return hit
    throw new Error('评测程序不能访问网络')
  }
  if (work.environment === 'python') {
    const fs = unpack(await get('python.tar'))
    fs['/main.py'] = file('/main.py', encoder.encode(work.source))
    const main = await execute(await get('python.wasm'), ['python', '/main.py'], fs, work.input, work.tty)
    // Python 主程序同样要过 SPJ——之前这里直接 return，判定程序根本没跑。
    return work.checker === 'spj' ? spjJudge(work, main) : main
  }
  // Java 的 stdin 是 B-JVM 同步 FFI，没法挂起等输入，host 会在请求前就拒掉。
  // SPJ 判定与主语言无关：runJava 的 Execution 同样交给 spjJudge 二次判定，
  // CE/RE 会原样透传，不会被误判成环境错误。
  if (work.environment === 'java8' || work.environment === 'java21') {
    const main = await runJava(work)
    return work.checker === 'spj' ? spjJudge(work, main) : main
  }
  let binary = work.artifact
  if (!binary) {
    scope.postMessage({ phase: '编译源码' })
    const bundle = work.runtime.assets.find(a => a.path.endsWith('bundle.js'))!
    const { runClang } = await import(/* @vite-ignore */ new URL(bundle.path, location.href).href) as {
      runClang: (args: string[], files: Tree, options: { stdout: (bytes: Uint8Array | null) => void; stderr: (bytes: Uint8Array | null) => void }) => Promise<Tree>
    }
    const diagnostics = new TextDecoder()
    let stdout = '', stderr = '', count = 0
    const push = (target: 'stdout' | 'stderr') => (bytes: Uint8Array | null) => {
      if (!bytes) return
      count += bytes.length
      if (count > outputLimit) throw new Error('编译诊断超过 1 MiB')
      const text = diagnostics.decode(bytes)
      if (target === 'stdout') stdout += text; else stderr += text
      // 终端里编译失败必须能看见诊断，不然只有一个「编译失败」状态。
      if (work.tty && text) scope.postMessage({ tty: { event: 'err', data: text } })
    }
    const filename = work.environment === 'c' ? 'main.c' : 'main.cpp'
    const headers = 'algorithm array bitset cassert cctype cerrno cfloat climits cmath complex cstdio cstdlib cstring deque exception functional iomanip ios iostream iterator limits list map memory numeric queue random regex set sstream stack stdexcept string tuple type_traits unordered_map unordered_set utility vector'.split(' ')
    try {
      const files = await runClang([work.environment === 'c' ? 'clang' : 'clang++', ...policy.clangArguments,
        `-std=${work.environment === 'c' ? policy.cStandard : policy.cppStandard}`, filename, '-o', 'program.wasm'],
      { [filename]: work.source, bits: { 'stdc++.h': headers.map(h => `#include <${h}>`).join('\n') } },
      { stdout: push('stdout'), stderr: push('stderr') })
      const produced = files['program.wasm']
      if (!(produced instanceof Uint8Array)) return { verdict: 'CE', stdout, stderr, error: '编译器未生成程序' }
      binary = produced
      // 终端会话不缓存编译产物：源码每次都可能改。
      if (!work.tty) scope.postMessage({ artifact: binary })
    } catch (error) { return { verdict: stderr ? 'CE' : 'ENVIRONMENT_ERROR', stdout, stderr, error: stderr ? '编译失败' : String(error) } }
  }
  const main = await execute(binary, ['program'], {}, work.input, work.tty)
  return work.checker === 'spj' ? spjJudge(work, main) : main
}

/** Special Judge：判定程序是 Python，读 /input /expected /actual，退出码 0 判过。 */
async function spjJudge(work: Work, main: Execution): Promise<Execution> {
  if (main.verdict !== 'OK' || !work.spj || !work.checkerSource) return main
  const spjGet = async (suffix: string): Promise<Uint8Array> => {
    const path = work.spj!.runtime.assets.find(a => a.path.endsWith(suffix))?.path
    if (!path) throw new Error(`判定程序运行包资源缺失：${suffix}，请安装 Python 语言包`)
    const cached = await (await caches.open('learning-objects')).match(path)
    if (!cached) throw new Error(`判定程序运行包资源缺失：${suffix}，请安装 Python 语言包`)
    return new Uint8Array(await cached.arrayBuffer())
  }
  const fs = unpack(await spjGet('python.tar'))
  fs['/main.py'] = file('/main.py', encoder.encode(work.checkerSource))
  fs['/input'] = file('/input', encoder.encode(work.input))
  fs['/expected'] = file('/expected', encoder.encode(work.expected ?? ''))
  fs['/actual'] = file('/actual', encoder.encode(main.stdout))
  const verdict = await execute(await spjGet('python.wasm'), ['python', '/main.py'], fs, '')
  return { ...main, spj: { verdict: verdict.verdict === 'OK' ? 'OK' : 'WA', stderr: verdict.stderr, error: verdict.error } }
}

scope.onmessage = event => {
  const data = event.data as Work & { stdin?: string; stdinClose?: boolean }
  // 终端会话的输入消息不设 id，直接进队列；正在挂起的 fd_read 会被唤醒。
  if (typeof data?.stdin === 'string') { ttyFeed(encoder.encode(data.stdin)); return }
  if (data?.stdinClose) { ttyClose(); return }
  void run(data).then(result => scope.postMessage({ result })).catch(error => scope.postMessage({ result: {
    verdict: 'ENVIRONMENT_ERROR', stdout: '', stderr: '', error: String(error),
  } }))
}
