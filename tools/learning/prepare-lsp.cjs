/**
 * 打包编辑器语言服务（clangd / pyright）为可选资源。
 *
 * 为什么单独拆：clangd 约 51 MiB、pyright + typeshed 约 4 MiB，只有开了
 * 智能提示才需要。绑进主评测包会让所有人多下几十兆，所以做成独立的
 * "lsp" 附件，在工作台按需下载。
 *
 * 产物落到 .local/learning/lsp/<kind>/，由 prepare.cjs 收进 manifest。
 */
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '../..')
const work = path.join(root, '.local/learning')
const require_ = createRequire(path.join(root, 'package.json'))
/** 有些包不在 exports 里暴露 package.json，直接按 node_modules 布局定位。 */
function packageDir(...segments) {
  const candidates = [path.join(root, 'node_modules', ...segments), path.join(root, '..', 'OJ-Plus-Plus', 'node_modules', ...segments)]
  for (const dir of candidates) if (fs.existsSync(dir)) return dir
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

/** pyright：worker + typeshed 标准库 + ruff（格式化/静态检查）。 */
function packPyright() {
  const pyright = packageDir('@typefox/pyright-browser')
  const out = path.join(work, 'lsp/pyright')
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  copy(path.join(pyright, 'dist/pyright.worker.js'), path.join(out, 'pyright.worker.js'))
  copy(path.join(pyright, 'LICENSE.txt'), path.join(out, 'LICENSE.txt'))
  const workerLicense = path.join(pyright, 'dist/pyright.worker.js.LICENSE.txt')
  if (fs.existsSync(workerLicense)) copy(workerLicense, path.join(out, 'worker.LICENSE.txt'))

  let typeshedRoot
  try {
    typeshedRoot = path.join(packageDir('pyright'), 'dist/typeshed-fallback')
  } catch { /* 没有独立 pyright 包时只带 worker */ }
  if (typeshedRoot && fs.existsSync(typeshedRoot)) {
    const license = path.join(typeshedRoot, 'LICENSE')
    if (fs.existsSync(license)) copy(license, path.join(out, 'typeshed.LICENSE'))
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
    fs.writeFileSync(path.join(out, 'stdlib.json'), JSON.stringify(files))
  }
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
