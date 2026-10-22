// @ts-nocheck
// Exercise session events without constructing an iframe; the transport is controlled here.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LearningEngine } from '../../src/lib/learning/engine.ts'

function transport() {
  let fire, resolve, reject
  const sent = []
  const engine = {
    call(_method, _payload, signal, _progress, onEvent) {
      fire = onEvent
      return new Promise((ok, fail) => {
        resolve = ok; reject = fail
        signal.addEventListener('abort', () => fail(new DOMException('cancelled', 'AbortError')), { once: true })
      })
    },
    callRaw(method, payload) { sent.push({ method, payload }); return Promise.resolve() },
  }
  const events = []
  const session = LearningEngine.prototype.terminal.call(engine, 'cpp', 'source', event => events.push(event))
  return { session, events, sent, fire: event => fire(event), resolve: () => resolve(), reject: error => reject(error) }
}

test('stopping a terminal notifies the UI once and ignores later output', async () => {
  const t = transport()
  t.fire({ event: 'ready' })
  t.session.close()
  t.session.close()
  await t.session.done
  t.fire({ event: 'out', data: 'late output' })
  t.fire({ event: 'exit', verdict: 'OK' })
  t.session.send('ignored'); t.session.eof()
  assert.deepEqual(t.events, [{ event: 'ready' }, { event: 'exit', verdict: 'CANCELLED' }])
  assert.deepEqual(t.sent, [])
})

test('terminal queues early input and keeps the real process verdict on completion', async () => {
  const t = transport()
  t.session.send('1 2\n')
  assert.equal(t.sent.length, 0)
  t.fire({ event: 'ready' })
  assert.deepEqual(t.sent, [{ method: 'ttyInput', payload: { data: '1 2\n' } }])
  t.fire({ event: 'out', data: '3\n' })
  t.fire({ event: 'exit', verdict: 'RE' })
  t.resolve(); await t.session.done; t.session.close()
  assert.equal(t.events.filter(e => e.event === 'exit').length, 1)
  assert.equal(t.events.at(-1).verdict, 'RE')
})

test('terminal startup failure releases the session with an environment error', async () => {
  const t = transport()
  t.reject(new Error('runner unavailable'))
  await t.session.done
  assert.deepEqual(t.events, [{ event: 'error', data: 'runner unavailable' }, { event: 'exit', verdict: 'ENVIRONMENT_ERROR' }])
})
