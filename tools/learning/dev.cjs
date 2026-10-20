// @ts-nocheck
// This server binds only loopback and serves no site API or cookies.
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { buildEngine, work, root } = require('./prepare.cjs')

async function main() {
  const uiPort = 4324, apiPort = 8094, runnerPort = 4334
  if (!fs.existsSync(path.join(work, 'packages/manifest.json'))) throw new Error('Run pnpm learning:prepare first')
  await buildEngine()
  const parents = new Set([`http://127.0.0.1:${uiPort}`])
  const server = http.createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    if (request.headers.host !== `localhost:${runnerPort}`) { response.writeHead(403).end(); return }
    const url = new URL(request.url, `http://localhost:${runnerPort}`)
    const worker = url.pathname === '/engine/worker.js'
    // 语言服务用 blob: 加载 worker 和 wasm，connect-src 要放行 blob。
    response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; connect-src ${worker ? "'none'" : "'self' blob:"}; frame-ancestors ${[...parents].join(' ')}; base-uri 'none'; form-action 'none'`)
    if (url.pathname === '/engine/' || url.pathname === '/engine/index.html') {
      const parent = url.searchParams.get('parent')
      if (!parents.has(parent)) { response.writeHead(403).end(); return }
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      response.end(`<!doctype html><html><head><meta charset="utf-8"><title>Local learning engine</title></head><body data-parent="${parent}"><script type="module" src="/engine/host.js"></script></body></html>`)
      return
    }
    let relative
    try { relative = decodeURIComponent(url.pathname) } catch { response.writeHead(400).end(); return }
    if (!relative.startsWith('/packages/') && !relative.startsWith('/engine/')) { response.writeHead(404).end(); return }
    const file = path.resolve(work, '.' + relative)
    if (!file.startsWith(work + path.sep)) { response.writeHead(403).end(); return }
    const packed = file + '.br'
    const useBrotli = String(request.headers['accept-encoding']).split(',').some(v => /^\s*br(?:\s*;|\s*$)/.test(v)) && fs.existsSync(packed)
    const actual = useBrotli ? packed : file
    if (!fs.existsSync(actual) || !fs.statSync(actual).isFile()) { response.writeHead(404).end(); return }
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.json') ? 'application/json' : file.endsWith('.tar') ? 'application/x-tar' : 'text/plain'
    response.setHeader('Content-Type', type)
    response.setHeader('Vary', 'Accept-Encoding')
    response.setHeader('Content-Length', fs.statSync(actual).size)
    response.setHeader('Cache-Control', relative.startsWith('/packages/objects/') ? 'public, max-age=31536000, immutable' : 'no-store')
    if (useBrotli) response.setHeader('Content-Encoding', 'br')
    if (relative.endsWith('/sw.js')) response.setHeader('Service-Worker-Allowed', '/')
    fs.createReadStream(actual).pipe(response)
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(runnerPort, '127.0.0.1', resolve) })
  const backend = path.resolve(root, '../sgu-acw-rank-backend')
  const data = path.join(work, 'data')
  fs.mkdirSync(data, { recursive: true })
  const env = { ...process.env,
    SGU_LEARN_LOCAL: '1', SGU_LEARN_SEED_DEMO: '1', SGU_LEARN_DATA_DIR: data, SGU_ACW_DATABASE_URL: `sqlite:///${data}/learning.db`,
    SGU_ACW_COOKIE_SECURE: 'false', SGU_ACW_COOKIE_DOMAIN: '', SGU_ACW_COOKIE_NAME: 'sgu_learning_local',
    SGU_ACW_ORIGIN_SECRET: '', SGU_ACW_EDITORIAL_SECRET: '', SGU_ACW_VAPID_PRIVATE_KEY: '', SGU_ACW_VAPID_PUBLIC_KEY: '',
    SGU_ACW_TICKET_SECRET: crypto.randomBytes(32).toString('hex'), SGU_ACW_BOOTSTRAP_ROOT_STUDENT_ID: '00000000000',
    SGU_ACW_BOOTSTRAP_ROOT_PASSWORD: 'LocalLearning123!', SGU_ACW_RP_ID: '127.0.0.1', SGU_ACW_RP_ORIGIN: `http://127.0.0.1:${uiPort}`,
    PUBLIC_LEARN_LOCAL: 'true', PUBLIC_LEARN_RUNNER_ORIGIN: `http://localhost:${runnerPort}`,
  }
  const api = spawn(path.join(backend, '.venv/bin/python'), ['-m', 'uvicorn', 'app.learning_dev:app', '--host', '127.0.0.1', '--port', String(apiPort)], { cwd: backend, env, stdio: 'inherit' })
  const web = spawn(process.execPath, [path.join(root, 'node_modules/astro/astro.js'), 'dev', '--config', 'tools/learning/astro.config.mjs', '--host', '127.0.0.1', '--port', String(uiPort)], { cwd: root, env, stdio: 'inherit' })
  const children = [api, web]
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    children.forEach(child => child.kill('SIGTERM')); server.close()
  }
  children.forEach(child => { child.once('error', error => { console.error(error); process.exitCode = 1; stop() }); child.once('exit', code => { if (!stopping) { process.exitCode = code || 1; stop() } }) })
  process.once('SIGTERM', stop); process.once('SIGINT', stop)
  console.log(`Local learning: http://127.0.0.1:${uiPort}/learn`)
  console.log('Isolated test administrator: 00000000000 / LocalLearning123!')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
