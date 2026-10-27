/**
 * 打包随对应语言包分发的编辑器语言服务（clangd / Pyright）。
 *
 * 产物落到 .local/learning/lsp/<kind>/，由 prepare.cjs 收进 manifest。
 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const work = path.join(root, '.local/learning')
/** 有些包不在 exports 里暴露 package.json，直接按 node_modules 布局定位。 */
function packageDir(...segments) {
  const dir = path.join(root, 'node_modules', ...segments)
  if (fs.existsSync(dir)) return dir
  throw new Error(`找不到依赖：${segments.join('/')}`)
}

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

/**
 * 把 clangd 的 SharedWorker 打成自包含文件。
 * 包内源码用裸模块名 import，浏览器无法解析；esbuild 会把依赖内联进来。
 */
function bundleWorker(source, target) {
  const esbuild = path.join(work, '../../node_modules/.bin/esbuild')
  const bin = fs.existsSync(esbuild) ? esbuild : 'esbuild'
  const result = require('node:child_process').spawnSync(bin, [
    source, '--bundle', '--format=esm', '--minify', `--outfile=${target}`,
  ], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error('clangd worker 打包失败')
}

/** clangd：把 @algoproclub/clangd-wasm 的运行时摊平成一个目录。 */
function packClangd() {
  const pkgRoot = packageDir('@algoproclub/clangd-wasm')
  const out = path.join(work, 'lsp/clangd')
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  const walk = (dir, prefix = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel)
      // 跳过文档、sourcemap 和 .gitkeep：它们会被算进 manifest 的资产列表，
      // 白白让「语言服务是否就绪」的检查失败。
      else if (!/\.(md|map)$/i.test(entry.name) && entry.name !== '.gitkeep') copy(path.join(dir, entry.name), path.join(out, rel))
    }
  }
  // 必须保留 assets/ 这一层：worker 用 ../assets/clangd.wasm 相对定位，
  // 摊平到根目录会让它 404。
  // 保持包内的 lib/ + assets/ 两级：worker 在 lib/ 下用 ../assets/ 相对定位，
  // 摊平会让它去 /engine/assets/ 找文件而 404。
  walk(path.join(pkgRoot, 'lib'), 'lib')
  walk(path.join(pkgRoot, 'assets'), 'assets')
  // 上游用固定名字 "algopro-clangd" 的 SharedWorker 单例，而后端启动是 worker 级
  // 共享 Promise——一次挂起，这个单例终生不可用，之后所有会话都等同一个死
  // Promise，重试也没用。改成每会话随机名字：不再共享后端 Promise，出问题的
  // 旧 worker 随引用消失自然回收，重试总是拿到全新实例。一个页面只开一个
  // clangd 会话，单例本来也没共享收益。
  const browserJs = path.join(out, 'lib/browser.js')
  if (fs.existsSync(browserJs)) {
    const code = fs.readFileSync(browserJs, 'utf8')
    // 原文写法：{ name: "algopro-clangd", type: "module" }（键名不带引号）。
    const patched = code.replace(
      '{ name: "algopro-clangd", type: "module" }',
      '{ name: `algopro-clangd-${crypto.randomUUID()}`, type: "module" }')
    if (patched !== code) fs.writeFileSync(browserJs, patched)
  }
  // 包里的 lib/clangd.shared-worker.js 是未打包的源码，直接 import 了
  // "vscode-jsonrpc/..." 这种裸模块说明符，浏览器解析不了（worker 会静默
  // 启动失败）。用 esbuild 打成自包含文件再覆盖。
  bundleWorker(path.join(pkgRoot, 'lib/clangd.shared-worker.js'), path.join(out, 'lib/clangd.shared-worker.js'))
  for (const name of ['LICENSES', 'package.json']) {
    const from = path.join(pkgRoot, name)
    if (!fs.existsSync(from)) continue
    if (fs.statSync(from).isDirectory()) walk(from, name)
    else copy(from, path.join(out, name))
  }
  return out
}

/** Pyright worker 与同版本的 typeshed 必须一起打包。 */
function packPyright({ out = path.join(work, 'lsp/pyright'), resolvePackage = packageDir } = {}) {
  const pyright = resolvePackage('@typefox/pyright-browser')
  const stubs = resolvePackage('pyright')
  const browserVersion = JSON.parse(fs.readFileSync(path.join(pyright, 'package.json'), 'utf8')).version
  const stubsVersion = JSON.parse(fs.readFileSync(path.join(stubs, 'package.json'), 'utf8')).version
  if (browserVersion !== stubsVersion) throw new Error(`Pyright worker 与 typeshed 版本不一致：${browserVersion} / ${stubsVersion}`)
  const typeshedRoot = path.join(stubs, 'dist/typeshed-fallback')
  for (const name of ['LICENSE', 'stdlib/VERSIONS', 'stdlib/builtins.pyi', 'stdlib/typing.pyi', 'stdlib/typing_extensions.pyi', 'stdlib/_typeshed/__init__.pyi']) {
    if (!fs.existsSync(path.join(typeshedRoot, name))) throw new Error(`Pyright 类型声明缺失：${name}`)
  }
  const files = {}
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel)
      else if (entry.name.endsWith('.pyi') || entry.name === 'VERSIONS') {
        files[rel] = fs.readFileSync(path.join(dir, entry.name), 'utf8')
      }
    }
  }
  walk(path.join(typeshedRoot, 'stdlib'), '/typeshed/stdlib')

  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  copy(path.join(pyright, 'dist/pyright.worker.js'), path.join(out, 'pyright.worker.js'))
  copy(path.join(pyright, 'LICENSE.txt'), path.join(out, 'LICENSE.txt'))
  const workerLicense = path.join(pyright, 'dist/pyright.worker.js.LICENSE.txt')
  if (fs.existsSync(workerLicense)) copy(workerLicense, path.join(out, 'worker.LICENSE.txt'))

  copy(path.join(typeshedRoot, 'LICENSE'), path.join(out, 'typeshed.LICENSE'))
  fs.writeFileSync(path.join(out, 'stdlib.json'), JSON.stringify(files))
  return out
}

if (require.main === module) {
  const clangd = packClangd()
  const pyright = packPyright()
  const size = dir => {
    const walk = d => fs.readdirSync(d, { withFileTypes: true })
      .reduce((n, e) => n + (e.isDirectory() ? walk(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0)
    return (walk(dir) / 1048576).toFixed(1)
  }
  console.log(`clangd: ${size(clangd)} MiB → ${clangd}`)
  console.log(`pyright: ${size(pyright)} MiB → ${pyright}`)
}

module.exports = { packClangd, packPyright }
