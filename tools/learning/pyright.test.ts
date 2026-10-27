// @ts-nocheck
// Node runs the actual Pyright browser worker without requiring a browser or WASI runtime.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import { packPyright } from './prepare-lsp.cjs'
import { pyrightInitializationOptions } from './pyright.ts'

const require = createRequire(import.meta.url)
const packageDir = name => path.dirname(require.resolve(`${name}/package.json`))
const temporary = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgu-pyright-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('packing replaces an old worker-only pack with complete, licensed standard-library stubs', t => {
  const out = temporary(t)
  fs.writeFileSync(path.join(out, 'pyright.worker.js'), 'old worker')
  fs.writeFileSync(path.join(out, 'stale.json'), '{}')
  packPyright({ out })
  const files = JSON.parse(fs.readFileSync(path.join(out, 'stdlib.json'), 'utf8'))
  assert.ok(Object.keys(files).length > 100)
  assert.ok(files['/typeshed/stdlib/collections/__init__.pyi'])
  assert.ok(files['/typeshed/stdlib/VERSIONS'])
  assert.ok(fs.statSync(path.join(out, 'typeshed.LICENSE')).size > 0)
  assert.equal(fs.existsSync(path.join(out, 'stale.json')), false)
  assert.doesNotThrow(() => pyrightInitializationOptions(files))
})

test('packing fails for missing or mismatched stubs instead of producing a worker-only pack', t => {
  const dir = temporary(t)
  const out = path.join(dir, 'output')
  const resolvePackage = name => name === 'pyright' ? dir : packageDir(name)
  assert.throws(() => packPyright({ out, resolvePackage }), /ENOENT/)
  assert.equal(fs.existsSync(out), false)
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.0.0' }))
  assert.throws(() => packPyright({ out, resolvePackage }), /版本不一致/)
  fs.writeFileSync(path.join(dir, 'package.json'), fs.readFileSync(path.join(packageDir('pyright'), 'package.json')))
  assert.throws(() => packPyright({ out, resolvePackage }), /类型声明缺失/)
  assert.equal(fs.existsSync(out), false)
})

test('initialization rejects missing or corrupted builtin stubs before starting analysis', () => {
  for (const files of [undefined, null, [], {}, { '/typeshed/stdlib/builtins.pyi': '' }]) {
    assert.throws(() => pyrightInitializationOptions(files), /类型声明/)
  }
  const files = Object.fromEntries(['builtins.pyi', 'typing.pyi', 'typing_extensions.pyi', '_typeshed/__init__.pyi']
    .map(name => [`/typeshed/stdlib/${name}`, '# stub']))
  assert.throws(() => pyrightInitializationOptions({ ...files, '/bad.pyi': {} }), /类型声明/)
  const options = pyrightInitializationOptions(files)
  assert.equal(JSON.parse(options.files['/workspace/pyrightconfig.json']).typeshedPath, '/typeshed')
  assert.equal(files['/workspace/pyrightconfig.json'], undefined)
})

test('Pyright recognizes builtins and completes print while still reporting real undefined names', { timeout: 20000 }, async t => {
  const out = packPyright({ out: temporary(t) })
  const files = JSON.parse(fs.readFileSync(path.join(out, 'stdlib.json'), 'utf8'))
  const worker = new Worker(new URL('./fixtures/pyright-node-worker.cjs', import.meta.url), {
    workerData: { bundle: path.join(out, 'pyright.worker.js') }, stdout: true, stderr: true,
  })
  t.after(() => worker.terminate())
  const pending = new Map()
  let nextId = 0
  const notify = (method, params) => worker.postMessage({ jsonrpc: '2.0', method, params })
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    worker.postMessage({ jsonrpc: '2.0', id, method, params })
  })
  let onDiagnostics, onError
  const diagnostics = new Promise((resolve, reject) => { onDiagnostics = resolve; onError = reject })
  worker.on('error', error => {
    onError(error)
    for (const entry of pending.values()) entry.reject(error)
  })
  const uri = 'file:///workspace/main.py'
  worker.on('message', message => {
    if (message.method && message.id !== undefined) {
      const result = message.method === 'workspace/configuration'
        ? message.params.items.map(item => item.section === 'python.analysis'
          ? { typeshedPaths: ['/typeshed'], typeCheckingMode: 'basic', diagnosticMode: 'openFilesOnly', autoImportCompletions: false }
          : {}) : null
      worker.postMessage({ jsonrpc: '2.0', id: message.id, result })
    } else if (message.method === 'textDocument/publishDiagnostics' && message.params.uri === uri) {
      onDiagnostics(message.params.diagnostics)
    } else if (pending.has(message.id)) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    }
  })
  worker.postMessage({ type: 'browser/boot', mode: 'foreground' })
  await rpc('initialize', {
    processId: null, rootUri: 'file:///workspace',
    capabilities: { workspace: { configuration: true }, textDocument: { completion: { completionItem: { snippetSupport: false } } } },
    initializationOptions: pyrightInitializationOptions(files),
  })
  notify('initialized', {})
  notify('textDocument/didOpen', { textDocument: {
    uri, languageId: 'python', version: 1,
    text: 'a = list(map(int, input().split()))\nprint(a, len(a), list(range(3)))\nprint(not_defined_yet)\n',
  } })
  const errors = await diagnostics
  assert.equal(errors.length, 1, JSON.stringify(errors))
  assert.equal(errors[0].code, 'reportUndefinedVariable')
  assert.match(errors[0].message, /not_defined_yet/)
  const completions = await rpc('textDocument/completion', {
    textDocument: { uri }, position: { line: 1, character: 3 }, context: { triggerKind: 1 },
  })
  assert.ok((Array.isArray(completions) ? completions : completions.items).some(item => item.label === 'print'))
})
