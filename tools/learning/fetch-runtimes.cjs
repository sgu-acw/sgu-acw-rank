// 从公开来源取评测运行时，替代对 OJ++ 本地构建产物的依赖。
//
// 这些二进制不是 OJ++ 的产物：Python 来自 Runno 的固定 commit，Clang 来自
// npm 上的 @yowasp/clang。OJ++ 只是把它们打包并 zstd 压缩了一下，我们自己
// 在 prepare.cjs 里已经有等价的路径改写逻辑，所以直接拉原始件更省事，
// 也让 CI 不必 checkout 另一个仓库、装两套依赖、再跑一次 vite build。
//
// 下载后按 runtime-assets.json 里记录的 sha256 校验；已存在且校验通过就跳过。
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

const work = path.resolve(__dirname, '../../.local/learning')
const cache = path.join(work, 'source-cache')
const stage = path.join(work, 'source')

// 与 OJ++ 的 tools/runtime-assets.json 同一组固定版本，哈希一致。
const ASSETS = [
  {
    file: 'python-3.11.3.wasm',
    url: 'https://raw.githubusercontent.com/taybenlor/runno/3c32435e7a07a59aac3f5497040c8c6317d1cff3/langs/python-3.11.3.wasm',
    sha256: '658cb6add2bbf8dfe84d67fb85430956d5a8b2b1d694d33432d654cdf048f813',
  },
  {
    file: 'python-3.11.3.tar.gz',
    url: 'https://raw.githubusercontent.com/taybenlor/runno/3c32435e7a07a59aac3f5497040c8c6317d1cff3/langs/python-3.11.3.tar.gz',
    sha256: '8c42694e45f2f1162114c70507c3da4c7cf983663e2b95660af521a9685d2a0c',
  },
  {
    file: 'yowasp-clang-22.0.0-git20542-10.tgz',
    url: 'https://registry.npmjs.org/@yowasp/clang/-/clang-22.0.0-git20542-10.tgz',
    sha256: '6230ea1afa9691fa065935cf68c01642ff9b31c183fe8ac64cdfda025df06009',
  },
]

const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

/** 下载并校验单个资产；已缓存且哈希正确时直接复用。 */
function fetchAsset(asset) {
  const target = path.join(cache, asset.file)
  if (fs.existsSync(target) && digest(target) === asset.sha256) return target
  console.log(`下载运行时 ${asset.file}`)
  fs.mkdirSync(cache, { recursive: true })
  const partial = target + '.part'
  execFileSync('curl', ['--fail', '--location', '--retry', '3', '--max-time', '900',
    '--silent', '--show-error', asset.url, '-o', partial], { stdio: 'inherit' })
  const got = digest(partial)
  if (got !== asset.sha256) {
    fs.rmSync(partial, { force: true })
    throw new Error(`${asset.file} 校验失败：期望 ${asset.sha256}，实际 ${got}`)
  }
  fs.renameSync(partial, target)
  return target
}

/**
 * 把运行时摊平到 source/：
 *   source/python-3.11.3.wasm, source/python-3.11.3.tar.gz
 *   source/yowasp/{bundle.js, llvm.*.wasm, llvm-resources.tar}
 * 已存在的解压结果不重复展开。
 */
function prepareSource() {
  fs.mkdirSync(stage, { recursive: true })
  const [pyWasm, pyTar, clangTgz] = ASSETS.map(fetchAsset)
  fs.copyFileSync(pyWasm, path.join(stage, 'python-3.11.3.wasm'))
  fs.copyFileSync(pyTar, path.join(stage, 'python-3.11.3.tar.gz'))

  const yowasp = path.join(stage, 'yowasp')
  const expected = ['bundle.js', 'llvm.core.wasm', 'llvm.core2.wasm', 'llvm.core3.wasm', 'llvm.core4.wasm', 'llvm-resources.tar']
  if (expected.every(f => fs.existsSync(path.join(yowasp, f)))) return stage

  // npm 包里是 package/gen/{bundle.js,*.wasm,*.tar}，解到临时目录再挑出来。
  fs.rmSync(yowasp, { recursive: true, force: true })
  const unpacked = path.join(cache, 'yowasp-unpacked')
  fs.rmSync(unpacked, { recursive: true, force: true })
  fs.mkdirSync(unpacked, { recursive: true })
  execFileSync('tar', ['-xzf', clangTgz, '-C', unpacked], { stdio: 'inherit' })
  const generated = fs.readdirSync(unpacked).map(d => path.join(unpacked, d, 'gen'))
    .find(d => fs.existsSync(d))
  if (!generated) throw new Error('@yowasp/clang 包里没有 gen/ 目录')
  fs.mkdirSync(yowasp, { recursive: true })
  for (const name of expected) fs.copyFileSync(path.join(generated, name), path.join(yowasp, name))
  fs.rmSync(unpacked, { recursive: true, force: true })
  return stage
}

module.exports = { prepareSource, cache }

if (require.main === module) {
  try {
    const out = prepareSource()
    console.log(`运行时已就绪：${out}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
