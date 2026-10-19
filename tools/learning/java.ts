// @ts-nocheck
// Java 8 / Java 21：B-JVM + 真实 JDK 类库 + ECJ。
// 大体积资产不走 postMessage，直接从共享对象缓存 'learning-objects' 读。
import type { Environment, Execution, Runtime } from '../../src/lib/learning/types'
import { policy } from './policy'

const scope = globalThis as unknown as { postMessage: (d: unknown) => void }
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const OBJECTS = 'learning-objects'

interface Work { environment: Environment; source: string; input: string; runtime: Runtime; artifact?: Uint8Array }

async function objects() { return caches.open(OBJECTS) }
async function readAsset(work: Work, suffix: string): Promise<Uint8Array> {
  const asset = work.runtime.assets.find(a => a.path.endsWith(suffix))
  if (!asset) throw new Error(`Java 运行包缺资源：${suffix}`)
  const hit = await (await objects()).match(asset.path)
  if (!hit) throw new Error(`Java 运行包资源已被清理：${suffix}，请重新安装`)
  return new Uint8Array(await hit.arrayBuffer())
}

async function writeTree(module, work: Work, indexSuffix: string, srcPrefix: string, destPrefix = '') {
  const index = JSON.parse(decoder.decode(await readAsset(work, indexSuffix)))
  for (const rel of index) {
    const bytes = await readAsset(work, `${srcPrefix}/${rel}`)
    const parts = (destPrefix + rel).split('/')
    let dir = ''
    for (const seg of parts.slice(0, -1)) { dir += '/' + seg; try { module.FS.mkdir(dir) } catch { /* 目录已存在 */ } }
    module.FS.writeFile('/' + destPrefix + rel, bytes)
  }
}

export async function runJava(work: Work): Promise<Execution> {
  const glue = work.runtime.assets.find(a => a.path.endsWith('bjvm_main.js'))?.path
  const wasm = work.runtime.assets.find(a => a.path.endsWith('bjvm_main.wasm'))?.path
  if (!glue || !wasm) throw new Error('Java 运行包缺 B-JVM 主程序')
  const { default: factory } = await import(/* @vite-ignore */ glue) as {
    default: (o: unknown) => Promise<Record<string, unknown>>
  }

  const started = performance.now()
  const log: string[] = []
  let inputAt = 0
  const input = encoder.encode(work.input)
  const module = await factory({
    print: (t: string) => log.push(t),
    printErr: (t: string) => log.push(t),
    stdin: () => null,
    locateFile: (file: string) => file === 'bjvm_main.wasm' ? wasm : file,
  })

  scope.postMessage({ phase: '初始化 Java 运行环境' })
  module.FS.writeFile('/jdk23.jar', await readAsset(work, 'java21.jar'))
  module.FS.mkdir('/out')
  module.FS.mkdir('/jdk23'); module.FS.mkdir('/jdk23/lib')
  module.FS.writeFile('/jdk23/lib/modules', await readAsset(work, 'modules21'))
  module.FS.writeFile('/jdk23/lib/tzdb.dat', await readAsset(work, 'tzdb.dat'))
  module.FS.writeFile('/jdk23/release', await readAsset(work, 'jdk-release'))
  await writeTree(module, work, 'jdk-conf-index.json', 'jdk-conf', 'jdk23/conf/')
  if (work.environment === 'java8') module.FS.writeFile('/java8.jar', await readAsset(work, 'java8.jar'))

  module.FS.writeFile('/ecj.jar', await readAsset(work, 'ecj.jar'))
  await writeTree(module, work, 'bundle-classes-index.json', 'bundle-classes')
  await writeTree(module, work, 'ecj-res-index.json', 'ecj-res')
  module.FS.writeFile('/JudgeProbe.class', await readAsset(work, 'JudgeProbe.class'))
  module.FS.writeFile('/Main.java', encoder.encode(work.source))
  module.FS.writeFile('/judge-target', work.environment === 'java8' ? '1.8' : '21')
  module.FS.writeFile('/judge-jdk', work.environment === 'java8' ? '/java8.jar' : '/jdk23.jar')

  const string = (v: string) => {
    const b = encoder.encode(v + '\0'), p = module._malloc(b.length)
    new Uint8Array(module.wasmMemory.buffer).set(b, p)
    return p
  }
  const outLog: string[] = [], errLog: string[] = []
  const stdout = module.addFunction((ptr: number, len: number) =>
    outLog.push(decoder.decode(new Uint8Array(module.wasmMemory.buffer, ptr, len))), 'viii')
  const stderr = module.addFunction((ptr: number, len: number) =>
    errLog.push(decoder.decode(new Uint8Array(module.wasmMemory.buffer, ptr, len))), 'viii')
  const classpath = '/:/ecj.jar:/out:/jdk23.jar' + (work.environment === 'java8' ? ':/java8.jar' : '')
  const vm = module._ffi_create_vm(string(classpath), policy.memoryPages * 65536, stdout, stderr)
  if (!vm) return { verdict: 'ENVIRONMENT_ERROR', stdout: '', stderr: log.join('\n'), error: 'JVM 初始化失败' }

  const read = module.addFunction((buf: number, len: number) => {
    const n = Math.min(len, input.length - inputAt)
    new Uint8Array(module.wasmMemory.buffer, buf, n).set(input.subarray(inputAt, inputAt + n))
    inputAt += n
    return n
  }, 'iiii')
  const poll = module.addFunction(() => input.length - inputAt, 'ii')
  module._ffi_set_stdin(vm, read, poll, 0)
  const scheduler = module._ffi_create_rr_scheduler(vm)
  const thread = module._ffi_create_thread(vm)
  if (!thread) return { verdict: 'ENVIRONMENT_ERROR', stdout: '', stderr: log.join('\n'), error: 'JVM 主线程初始化失败' }

  const bridge = module._ffi_get_class(thread, string('JudgeProbe'))
  if (!bridge) return { verdict: 'ENVIRONMENT_ERROR', stdout: '', stderr: log.join('\n'), error: '评测桥接类缺失' }
  const metadata = module._ffi_get_class_json(bridge)
  const methods = JSON.parse(module.UTF8ToString(metadata)).methods
  module._free(metadata)

  const invoke = async (name: string): Promise<number> => {
    const method = methods.find((m: { name: string; descriptor: string }) => m.name === name && m.descriptor === '()I')
    if (!method) throw new Error(`桥接方法缺失：${name}`)
    const record = module._ffi_rr_schedule(thread, method.methodPointer, 0)
    if (!record) throw new Error('无法调度方法')
    while (!module._ffi_rr_record_is_ready(record)) {
      module._ffi_rr_scheduler_step(scheduler)
      await new Promise(r => setTimeout(r, 0))
    }
    const value = module.getValue(module._ffi_get_execution_record_result_pointer(record), 'i32')
    module._ffi_free_execution_record(record)
    return value
  }

  let classBytes = work.artifact
  if (classBytes) {
    // 复用上次编译产物：字节码写进本次 VM 的 /out。
    module.FS.writeFile('/out/Main.class', classBytes)
  }
  if (!classBytes) {
    scope.postMessage({ phase: '编译源码' })
    const code = await invoke('compile')
    if (code !== 0) return { verdict: 'CE', stdout: '', stderr: errLog.join('\n'), error: '编译失败' }
    classBytes = module.FS.readFile('/out/Main.class')
    scope.postMessage({ artifact: classBytes })
    log.length = 0; errLog.length = 0
  }

  scope.postMessage({ phase: '执行程序' })
  const runStart = performance.now()
  const code = await invoke('run')
  const elapsedMs = performance.now() - runStart
  const text = outLog.join('\n'), err = errLog.join('\n')
  outLog.length = 0; errLog.length = 0
  if (code !== 0) return { verdict: 'RE', stdout: text, stderr: err, elapsedMs, error: `程序异常退出 (${code})` }
  return { verdict: 'OK', stdout: text, stderr: err, elapsedMs }
}
