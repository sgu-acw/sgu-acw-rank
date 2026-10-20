// @ts-nocheck
// Node-only local build; uses the Vite version already supplied by Astro.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { createRequire } = require('node:module')
const { spawnSync } = require('node:child_process')
const zlib = require('node:zlib')
const root = path.resolve(__dirname, '../..')
const work = path.join(root, '.local/learning')
// 运行时二进制来自公开来源（Runno 的 Python、npm 上的 YoWASP Clang），
// 由 fetch-runtimes.cjs 下载校验后摊平到 .local/learning/source/。
// 以前依赖 OJ++ 的 dist-extension，但那份产物只是把这些件重新压了一遍。
const { prepareSource } = require('./fetch-runtimes.cjs')
const packages = path.join(work, 'packages')

function command(args) {
  const result = spawnSync(args[0], args.slice(1), { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw result.error || new Error(`${args[0]} failed`)
}
async function buildEngine() {
  const fromAstro = createRequire(fs.realpathSync(path.join(root, 'node_modules/astro/package.json')))
  const { build } = await import(fromAstro.resolve('vite'))
  // 父域白名单构建期写死：运行器只接受这个站点嵌它。
  const parent = process.env.LEARN_PARENT_ORIGIN || 'http://127.0.0.1:4324'
  await build({ configFile: false, root, publicDir: false, logLevel: 'warn',
    define: { 'import.meta.env.VITE_LEARN_PARENT': JSON.stringify(parent) }, build: {
    outDir: path.join(work, 'engine'), emptyOutDir: true, minify: false, sourcemap: true,
    rollupOptions: {
      // clangd 入口必须过打包器：包内用 new URL(..., import.meta.url) 定位
      // SharedWorker 与 wasm，手写 new Worker 拿不到资产。
      input: { host: path.join(__dirname, 'host.ts'), worker: path.join(__dirname, 'worker.ts'), clangd: path.join(__dirname, 'clangd.ts') },
      // preserveEntrySignatures 必须开：clangd 入口的导出要在运行时动态
      // import，默认的 'exports-only' 会把它摇成空 chunk（实测空壳）。
      preserveEntrySignatures: 'strict',
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  } })
  fs.copyFileSync(path.join(__dirname, 'sw.js'), path.join(work, 'engine/sw.js'))
  // 沙箱 iframe 入口页：data-parent 只是给本地调试看的，真正的白名单在 host.js 里。
  fs.writeFileSync(path.join(work, 'engine/index.html'),
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>评测运行器</title></head><body><script type="module" src="/engine/host.js"></script></body></html>\n`)
}
async function asset(name, bytes, type) {
  const hash = crypto.createHash('sha256').update(bytes).digest('hex')
  const dir = path.join(packages, 'objects', hash)
  fs.mkdirSync(dir, { recursive: true })
  const raw = path.join(dir, name), packed = raw + '.br'
  fs.mkdirSync(path.dirname(raw), { recursive: true })
  if (!fs.existsSync(raw)) fs.writeFileSync(raw, bytes)
  else if (fs.statSync(raw).size !== bytes.length) fs.writeFileSync(raw, bytes)
  if (!fs.existsSync(packed)) {
    console.log(`Brotli 11: ${name} (${(bytes.length / 1048576).toFixed(1)} MiB decoded)`)
    // 先写临时文件再改名；上次被中断的半成品 .br 会解压不全，必须重建。
    const tmp = packed + '.tmp'
    command(['brotli', '-q', '11', '-f', raw, '-o', tmp])
    fs.renameSync(tmp, packed)
  }
  // path 不带 .br：浏览器按 Content-Encoding 原生解压（Chrome 的
  // DecompressionStream 并不支持 brotli）。CDN 的二次压缩由 no-transform 阻止。
  return { path: `/packages/objects/${hash}/${name}`, bytes: bytes.length,
    transferBytes: fs.statSync(packed).size, sha256: hash, type }
}
async function main() {
  fs.mkdirSync(packages, { recursive: true })
  await buildEngine()
  const stage = prepareSource()
  const yowasp = path.join(stage, 'yowasp')
  const clangAssets = []
  for (const name of ['bundle.js', 'llvm.core.wasm', 'llvm.core2.wasm', 'llvm.core3.wasm', 'llvm.core4.wasm', 'llvm-resources.tar']) {
    clangAssets.push(await asset(name, fs.readFileSync(path.join(yowasp, name)),
      name.endsWith('.js') ? 'text/javascript' : name.endsWith('.wasm') ? 'application/wasm' : 'application/x-tar'))
  }
  // The loader resolves its sibling resources relative to bundle.js. Rewrite these paths
  // to immutable object URLs rather than introducing a decompression fetch shim.
  let glue = fs.readFileSync(path.join(yowasp, 'bundle.js'), 'utf8')
  for (const a of clangAssets.filter(a => !a.path.endsWith('bundle.js'))) {
    glue = glue.replaceAll(path.basename(a.path), a.path)
  }
  glue = glue.replaceAll('".//packages/', '"/packages/')
  clangAssets[0] = await asset('bundle.js', Buffer.from(glue), 'text/javascript')
  const pythonAssets = [
    await asset('python.wasm', fs.readFileSync(path.join(stage, 'python-3.11.3.wasm')), 'application/wasm'),
    await asset('python.tar', zlib.gunzipSync(fs.readFileSync(path.join(stage, 'python-3.11.3.tar.gz'))), 'application/x-tar'),
  ]
  const version = assets => crypto.createHash('sha256').update(assets.map(a => a.sha256).join('\n')).digest('hex').slice(0, 16)

  // Java 运行时（prepare-java-probe.py 产物）：B-JVM WASM + 打平 JDK 类库 +
  // jimage + ECJ + 补丁类。两个环境共享全部资产，java8 只多一个 rt.jar。
  const javaRoot = path.join(packages, 'java-probe')
  const javaShared = []
  const javaFiles = ['bjvm_main.js', 'bjvm_main.wasm', 'java21.jar', 'modules21', 'ecj.jar',
    'JudgeProbe.class', 'tzdb.dat', 'jdk-release', 'bundle-classes-index.json',
    'jdk-conf-index.json', 'ecj-res-index.json']
  const javaReady = javaFiles.every(f => fs.existsSync(path.join(javaRoot, f)))
    && fs.existsSync(path.join(javaRoot, 'bundle-classes'))
    && fs.existsSync(path.join(javaRoot, 'jdk-conf'))
    && fs.existsSync(path.join(javaRoot, 'ecj-res'))
  if (javaReady) {
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
    const all = [
      ...javaFiles.map(f => [f, path.join(javaRoot, f)]),
      ...walk(path.join(javaRoot, 'bundle-classes')).map(f => [path.join('bundle-classes', path.relative(path.join(javaRoot, 'bundle-classes'), f)), f]),
      ...walk(path.join(javaRoot, 'jdk-conf')).map(f => [path.join('jdk-conf', path.relative(path.join(javaRoot, 'jdk-conf'), f)), f]),
      ...walk(path.join(javaRoot, 'ecj-res')).map(f => [path.join('ecj-res', path.relative(path.join(javaRoot, 'ecj-res'), f)), f]),
      ['patch-classes-index.json', path.join(javaRoot, 'patch-classes-index.json')],
      ...(fs.existsSync(path.join(javaRoot, 'patch-classes'))
        ? walk(path.join(javaRoot, 'patch-classes')).map(f => [path.join('patch-classes', path.relative(path.join(javaRoot, 'patch-classes'), f)), f]) : []),
    ]
    for (const [name, file] of all) {
      const stat = fs.statSync(file)
      javaShared.push(await asset(name, fs.readFileSync(file),
        name.endsWith('.js') ? 'text/javascript' : name.endsWith('.wasm') ? 'application/wasm'
        : name.endsWith('.json') ? 'application/json' : 'application/octet-stream'))
    }
  }
  const java8Assets = javaReady && fs.existsSync(path.join(javaRoot, 'java8.jar'))
    ? [...javaShared, await asset('java8.jar', fs.readFileSync(path.join(javaRoot, 'java8.jar')), 'application/octet-stream')]
    : null

  // 语言服务（可选附件）：只有打开智能提示才下载，单独成项。
  const { packClangd, packPyright } = require('./prepare-lsp.cjs')
  const lspRoots = { clangd: path.join(work, 'lsp/clangd'), pyright: path.join(work, 'lsp/pyright') }
  for (const [kind, dir] of Object.entries(lspRoots)) {
    if (!fs.existsSync(dir)) {
      const build = kind === 'clangd' ? packClangd : packPyright
      try { build() } catch (error) { console.warn(`跳过 ${kind} 语言服务：${error.message}`) }
    }
  }
  const lspAssets = {}
  for (const [kind, dir] of Object.entries(lspRoots)) {
    if (!fs.existsSync(dir)) continue
    const walk = d => fs.readdirSync(d, { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
    const files = []
    for (const file of walk(dir)) {
      const rel = path.relative(dir, file)
      const type = file.endsWith('.wasm') ? 'application/wasm'
        : file.endsWith('.js') ? 'text/javascript'
        : file.endsWith('.json') ? 'application/json' : 'application/octet-stream'
      // 名字保留原始相对路径：按后缀找入口文件（clangd.shared-worker.js 等）
      // 才不会因为前缀被改写而失配。
      files.push(await asset(`lsp-${kind}-${rel}`, fs.readFileSync(file), type))
    }
    lspAssets[kind] = files
  }

  // 补全与诊断跟语言包一起装：资产直接并进对应运行包，不另开安装项。
  const withLsp = (assets, kind) => lspAssets[kind] ? [...assets, ...lspAssets[kind]] : assets
  const runtimes = [
    { id: 'c-cpp', label: 'C / C++ · Clang 22', version: `clang22-${version(withLsp(clangAssets, 'clangd'))}`, available: true,
      assets: withLsp(clangAssets, 'clangd'), provenance: 'YoWASP Clang 22.0.0-git20542-10; local OJ++ build' },
    { id: 'python', label: 'Python 3.11.3', version: `cpython311-${version(withLsp(pythonAssets, 'pyright'))}`, available: true,
      assets: withLsp(pythonAssets, 'pyright'), provenance: 'CPython 3.11.3 WASI from Runno, local OJ++ build' },
    { id: 'java21', label: 'Java 21', version: javaReady ? `bjvm-jdk21-${version(javaShared)}` : 'pending-validation',
      available: javaReady, assets: javaShared,
      reason: javaReady ? undefined : '运行 pnpm learning:java 构建 B-JVM 与 JDK 21 类库后可用。',
      provenance: 'B-JVM + real JDK 21 classlib + ECJ, browser-compiled' },
    { id: 'java8', label: 'Java 8', version: java8Assets ? `bjvm-jdk8api-${version(java8Assets)}` : 'pending-validation',
      available: !!java8Assets, assets: java8Assets || [],
      reason: java8Assets ? '编译期为真实 JDK 8 rt.jar，运行期复用 JDK 21 运行时。' : '运行 pnpm learning:java 构建后可用。',
      provenance: 'ECJ -1.8 vs real JDK 8 rt.jar, executed on the validated JDK 21 runtime' },
  ]
  // 语言服务随语言包安装，这里只记录归属与入口，供运行器启动时查找。
  const services = {
    clangd: lspAssets.clangd ? { runtime: 'c-cpp', assets: lspAssets.clangd } : null,
    pyright: lspAssets.pyright ? { runtime: 'python', assets: lspAssets.pyright } : null,
  }
  const temporary = path.join(packages, 'manifest.next.json')
  fs.writeFileSync(temporary, JSON.stringify({ schema: 1, runtimes, services }, null, 2) + '\n')
  fs.renameSync(temporary, path.join(packages, 'manifest.json'))
  const notices = path.join(root, 'THIRD_PARTY_NOTICES.md')
  if (fs.existsSync(notices)) fs.copyFileSync(notices, path.join(packages, 'THIRD_PARTY_NOTICES.md'))
  console.log('Local packages prepared. No production files or services were accessed.')
}
module.exports = { buildEngine, work, root }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
