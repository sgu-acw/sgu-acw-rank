// @ts-nocheck
// Experimental bootstrap probe. It is excluded from the installable runtime manifest.
self.onmessage = async event => {
  const version = event.data.version, log = []
  let module, inputAt = 0
  const input = new TextEncoder().encode(event.data.input || '')
  try {
    const stamp = new URL(import.meta.url).search
    const { default: factory } = await import(new URL(`bjvm_main.js${stamp}`, import.meta.url).href)
    module = await factory({ print: text => log.push(text), printErr: text => log.push(text), stdin: () => inputAt < input.length ? input[inputAt++] : null,
      locateFile: file => `${file}${stamp}` })
    // 运行期 JDK 永远是 java21 的类库；java8 只是编译期 API 面。
    const boot = version === 'java8' ? 'java21' : version
    const data = new Uint8Array(await (await fetch(new URL(`${boot}.jar`, import.meta.url))).arrayBuffer())
    module.FS.writeFile('/jdk23.jar', data)
    module.FS.mkdir('/out')
    if (version === 'java8') {
      module.FS.writeFile('/java8.jar', new Uint8Array(await (await fetch(new URL(`java8.jar${stamp}`, import.meta.url))).arrayBuffer()))
    }
    if (event.data.source) {
      module.FS.writeFile('/ecj.jar', new Uint8Array(await (await fetch(new URL(`ecj.jar${stamp}`, import.meta.url))).arrayBuffer()))
      // 类形式的 ResourceBundle：编译好的 *.class 代替 .properties。
      const clsIndex = await (await fetch(new URL(`bundle-classes-index.json${stamp}`, import.meta.url))).json()
      for (const rel of clsIndex) {
        const parts = rel.split('/'); let dir = ''
        for (const seg of parts.slice(0, -1)) { dir += '/' + seg; try { module.FS.mkdir(dir) } catch { /* exists */ } }
        module.FS.writeFile(`/${rel}`, new Uint8Array(await (await fetch(new URL(`bundle-classes/${rel}${stamp}`, import.meta.url))).arrayBuffer()))
      }
      // 打过补丁的 JDK 类（SimpleConsoleLogger 等）放 / 下，类路径顺序让补丁覆盖 jar。
      for (const rel of await (await fetch(new URL(`patch-classes-index.json${stamp}`, import.meta.url))).json()) {
        const parts = rel.split('/'); let dir = ''
        for (const seg of parts.slice(0, -1)) { dir += '/' + seg; try { module.FS.mkdir(dir) } catch { /* exists */ } }
        module.FS.writeFile(`/${rel}`, new Uint8Array(await (await fetch(new URL(`patch-classes/${rel}${stamp}`, import.meta.url))).arrayBuffer()))
      }
      // ResourceBundle 在 B-JVM 里只走目录类路径；把 ECJ 的资源解到 / 下。
      const resIndex = await (await fetch(new URL(`ecj-res-index.json${stamp}`, import.meta.url))).json()
      for (const rel of resIndex) {
        const parts = rel.split('/'); let dir = ''
        for (const seg of parts.slice(0, -1)) { dir += '/' + seg; try { module.FS.mkdir(dir) } catch { /* exists */ } }
        module.FS.writeFile(`/${rel}`, new Uint8Array(await (await fetch(new URL(`ecj-res/${rel}${stamp}`, import.meta.url))).arrayBuffer()))
      }
    }
    module.FS.mkdir('/jdk23'); module.FS.mkdir('/jdk23/lib')
    module.FS.writeFile('/jdk23/lib/modules', new Uint8Array(await (await fetch(new URL(`modules21${stamp}`, import.meta.url))).arrayBuffer()))
    module.FS.writeFile('/jdk23/lib/tzdb.dat', new Uint8Array(await (await fetch(new URL(`tzdb.dat${stamp}`, import.meta.url))).arrayBuffer()))
    module.FS.writeFile('/jdk23/release', new Uint8Array(await (await fetch(new URL(`jdk-release${stamp}`, import.meta.url))).arrayBuffer()))
    // java.home/conf：Security 初始化等路径会按 /jdk23/conf/... 读这些文件
    for (const rel of await (await fetch(new URL(`jdk-conf-index.json${stamp}`, import.meta.url))).json()) {
      const parts = rel.split('/'); let dir = '/jdk23/conf'
      try { module.FS.mkdir(dir) } catch { /* exists */ }
      for (const seg of parts.slice(0, -1)) { dir += '/' + seg; try { module.FS.mkdir(dir) } catch { /* exists */ } }
      module.FS.writeFile(`${dir}/${parts.at(-1)}`, new Uint8Array(await (await fetch(new URL(`jdk-conf/${rel}${stamp}`, import.meta.url))).arrayBuffer()))
    }
    const string = value => {
      const bytes = new TextEncoder().encode(value + '\0'), ptr = module._malloc(bytes.length)
      new Uint8Array(module.wasmMemory.buffer).set(bytes, ptr)
      return ptr
    }
    const output = module.addFunction((ptr, length) => log.push(new TextDecoder().decode(new Uint8Array(module.wasmMemory.buffer, ptr, length))), 'viii')
    const vm = module._ffi_create_vm(string('/:/ecj.jar:/out:/jdk23.jar'), 512 * 1048576, output, output)
    if (!vm) throw new Error('VM creation returned null')
    const stdinRead = module.addFunction((buf, len) => {
      const n = Math.min(len, input.length - inputAt)
      new Uint8Array(module.wasmMemory.buffer, buf, n).set(input.subarray(inputAt, inputAt + n))
      inputAt += n
      return n
    }, 'iiii')
    const stdinPoll = module.addFunction(() => input.length - inputAt, 'ii')
    module._ffi_set_stdin(vm, stdinRead, stdinPoll, 0)
    self.postMessage({ phase: 'VM created', version })
    const scheduler = module._ffi_create_rr_scheduler(vm)
    const thread = module._ffi_create_thread(vm)
    if (!thread) throw new Error('Main thread creation returned null')
    if (event.data.source) {
      module.FS.writeFile('/JudgeProbe.class', new Uint8Array(await (await fetch(new URL('JudgeProbe.class', import.meta.url))).arrayBuffer()))
      module.FS.writeFile('/Main.java', event.data.source)
      module.FS.writeFile('/judge-target', version === 'java8' ? '1.8' : '21')
      module.FS.writeFile('/judge-jdk', version === 'java8' ? '/java8.jar' : '/jdk23.jar')
      const bridge = module._ffi_get_class(thread, string('JudgeProbe'))
      if (!bridge) throw new Error('Bridge class could not be loaded')
      const metadata = module._ffi_get_class_json(bridge)
      const methods = JSON.parse(module.UTF8ToString(metadata)).methods
      module._free(metadata)
      const invoke = async name => {
        const method = methods.find(m => m.name === name && m.descriptor === '()I')
        if (!method) throw new Error(`Missing bridge method ${name}: ${methods.map(m => m.name + m.descriptor).join(', ')}`)
        const record = module._ffi_rr_schedule(thread, method.methodPointer, 0)
        if (!record) throw new Error('Could not schedule bridge method')
        while (!module._ffi_rr_record_is_ready(record)) {
          module._ffi_rr_scheduler_step(scheduler)
          await new Promise(resolve => setTimeout(resolve, 0))
        }
        const pointer = module._ffi_get_execution_record_result_pointer(record)
        const value = module.getValue(pointer, 'i32')
        module._ffi_free_execution_record(record)
        if (module._ffi_get_current_exception(thread)) throw new Error('Uncaught VM exception')
        return value
      }
      self.postMessage({ phase: `Providers mask=${await invoke('providerCheck')}`, version })
      self.postMessage({ phase: `Resource probe score=${await invoke('resourceTest')}`, version })
      self.postMessage({ phase: 'Compiling with ECJ', version })
      const compileCode = await invoke('compile')
      if (compileCode) throw new Error(`Target javac returned ${compileCode}`)
      self.postMessage({ phase: 'Running compiled Main', version })
      const runCode = await invoke('run')
      if (runCode) throw new Error(`Main returned ${runCode}`)
    }
    self.postMessage({ result: { version, bootstrap: true, log: log.join('\n').slice(-10000) } })
  } catch (error) {
    self.postMessage({ result: { version, bootstrap: false, error: String(error), stack: String(error.stack), log: log.join('\n').slice(-10000) } })
  }
}
