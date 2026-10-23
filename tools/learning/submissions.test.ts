// @ts-nocheck
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makePendingSubmission, storePendingSubmission, loadPendingSubmissions, removePendingSubmission } from '../../src/lib/learning/submissions.ts'

class MemoryStorage {
  values = new Map()
  get length() { return this.values.size }
  key(i) { return [...this.values.keys()][i] ?? null }
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, value) }
  removeItem(key) { this.values.delete(key) }
}
const owner = { id: 7, student_id: '24125023001' }
function pending(id = '12345678-1234-1234-1234-123456789001') {
  const record = { id, version_id: '12345678-1234-1234-1234-123456789002', environment: 'cpp', runtime_version: 'fixture', source: 'int main(){}', verdict: 'AC' }
  const result = { ...record, points: [{ verdict: 'AC', stdout: 'private actual output', expected: 'private expected output' }] }
  return makePendingSubmission(owner, 12, record, result)
}

test('a failed submission survives reload with its original ID, source, and aggregate result', () => {
  const storage = new MemoryStorage(), item = pending()
  assert.equal(storePendingSubmission(item, storage), true)
  const reloaded = new MemoryStorage()
  reloaded.values = new Map([...storage.values].map(([k, v]) => [k, String(v)]))
  assert.deepEqual(loadPendingSubmissions(owner, 12, reloaded), [item])
  assert.equal(item.record.expected_user_id, owner.id)
  assert.equal(item.passed, 1)
  assert.equal(item.total, 1)
  const serialized = [...storage.values.values()].join('')
  assert.ok(!serialized.includes('private actual output') && !serialized.includes('private expected output'))
})

test('recovery is scoped to the original account and problem, and retains an older published version', () => {
  const storage = new MemoryStorage(), item = pending()
  storePendingSubmission(item, storage)
  assert.deepEqual(loadPendingSubmissions({ ...owner, id: 8 }, 12, storage), [])
  assert.deepEqual(loadPendingSubmissions({ ...owner, student_id: '24125023002' }, 12, storage), [])
  assert.deepEqual(loadPendingSubmissions(owner, 13, storage), [])
  assert.equal(loadPendingSubmissions(owner, 12, storage)[0].record.version_id, item.record.version_id)
})

test('two tabs retain separate receipts and acknowledging one preserves the other', () => {
  const storage = new MemoryStorage(), first = pending(), second = pending('12345678-1234-1234-1234-123456789003')
  storePendingSubmission(first, storage); storePendingSubmission(second, storage)
  assert.equal(loadPendingSubmissions(owner, 12, storage).length, 2)
  assert.equal(removePendingSubmission(first, storage), true)
  assert.deepEqual(loadPendingSubmissions(owner, 12, storage), [second])
  assert.equal(removePendingSubmission(first, storage), true)
})

test('a changed payload cannot replace or acknowledge an existing request ID', () => {
  const storage = new MemoryStorage(), original = pending(), changed = pending()
  storePendingSubmission(original, storage)
  changed.record.source = 'changed source'
  assert.equal(storePendingSubmission(changed, storage), false)
  assert.equal(removePendingSubmission(changed, storage), false)
  assert.deepEqual(loadPendingSubmissions(owner, 12, storage), [original])
})

test('one corrupt receipt does not hide other valid receipts', () => {
  const storage = new MemoryStorage(), item = pending()
  storePendingSubmission(item, storage)
  const key = [...storage.values.keys()][0]
  storage.setItem(key + '-broken', '{')
  storage.setItem(key + '-wrong-owner', JSON.stringify({ ...item, owner: { ...owner, id: 99 } }))
  assert.deepEqual(loadPendingSubmissions(owner, 12, storage), [item])
})

test('storage denial is reported without discarding the in-memory receipt', () => {
  const item = pending()
  const denied = { setItem() { throw new Error('quota') }, getItem() { throw new Error('denied') }, get length() { throw new Error('denied') } }
  assert.equal(storePendingSubmission(item, denied), false)
  assert.deepEqual(loadPendingSubmissions(owner, 12, denied), [])
  assert.equal(removePendingSubmission(item, denied), false)
  assert.equal(item.record.source, 'int main(){}')
})
