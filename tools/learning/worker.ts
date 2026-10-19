import { WASI, type WASIFS } from './vendor/wasi.js'
import { limitMemory } from './memory'
import { runJava } from './java'
import { policy } from './policy'
import type { Environment, Execution, Runtime } from '../../src/lib/learning/types'

const scope = globalThis as unknown as { onmessage: (e: MessageEvent<Work>) => void; postMessage: (data: unknown) => void }
interface Work { environment: Environment; source: string; input: string; runtime: Runtime; assets: Record<string, Uint8Array>; artifact?: Uint8Array }
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

async function execute(binary: Uint8Array, args: string[], fs: WASIFS, input: string): Promise<Execution> {
  const wasi = new WASI({ args, fs, env: { LANG: 'C.UTF-8', PYTHONHASHSEED: '0' }, isTTY: false })
  const imports = wasi.getImportObject(), stdin = encoder.encode(input)
  let offset = 0, count = 0, stdout = '', stderr = ''
  const out = new TextDecoder(), err = new TextDecoder()
  for (const bindings of Object.values(imports)) {
    const originalRead = bindings.fd_read!, originalWrite = bindings.fd_write!
    bindings.fd_read = (fd, iovs, length, read) => {
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
        if (fd === 1) stdout += out.decode(bytes, { stream: true }); else stderr += err.decode(bytes, { stream: true })
        total += size
      }
      memory.setUint32(written!, total, true)
      return 0
    }
  }
  const module = await WebAssembly.compile(new Uint8Array(limitMemory(binary, policy.memoryPages)))
  const instance = await WebAssembly.instantiate(module, imports)
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
  const get = (suffix: string) => {
    const path = work.runtime.assets.find(a => a.path.endsWith(suffix))?.path
    const value = path && work.assets[path]
    if (!value) throw new Error(`运行包资源缺失：${suffix}，请重新安装`)
    return value
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
    const fs = unpack(get('python.tar'))
    fs['/main.py'] = file('/main.py', encoder.encode(work.source))
    return execute(get('python.wasm'), ['python', '/main.py'], fs, work.input)
  }
  if (work.environment === 'java8' || work.environment === 'java21') return runJava(work)
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
      if (target === 'stdout') stdout += diagnostics.decode(bytes); else stderr += diagnostics.decode(bytes)
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
      scope.postMessage({ artifact: binary })
    } catch (error) { return { verdict: stderr ? 'CE' : 'ENVIRONMENT_ERROR', stdout, stderr, error: stderr ? '编译失败' : String(error) } }
  }
  return execute(binary, ['program'], {}, work.input)
}

scope.onmessage = event => {
  void run(event.data).then(result => scope.postMessage({ result })).catch(error => scope.postMessage({ result: {
    verdict: 'ENVIRONMENT_ERROR', stdout: '', stderr: '', error: String(error),
  } }))
}
