// Run the actual browser bundle with Worker messaging supplied by Node's test runner.
const { parentPort, workerData, Worker: NodeWorker, MessageChannel } = require('node:worker_threads')
const fs = require('node:fs')
const vm = require('node:vm')

globalThis.self = globalThis
globalThis.name = 'pyright-regression'
globalThis.location = { toString: () => workerData.bundle }
globalThis.MessageChannel = MessageChannel
parentPort.on('message', data => globalThis.onmessage?.({ data }))
const listeners = new Map()
globalThis.addEventListener = (type, listener) => {
  if (type !== 'message') return
  const wrapped = data => listener({ data })
  listeners.set(listener, wrapped)
  parentPort.on('message', wrapped)
}
globalThis.removeEventListener = (type, listener) => {
  if (type !== 'message') return
  const wrapped = listeners.get(listener)
  if (wrapped) parentPort.off('message', wrapped)
  listeners.delete(listener)
}
globalThis.postMessage = (data, ports) => parentPort.postMessage(data, ports)
globalThis.Worker = class extends NodeWorker {
  constructor() { super(require.resolve('./pyright-node-worker.cjs'), { workerData }) }
}
vm.runInThisContext(fs.readFileSync(workerData.bundle, 'utf8'), { filename: workerData.bundle })
