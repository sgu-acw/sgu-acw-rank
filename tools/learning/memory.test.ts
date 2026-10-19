// @ts-nocheck
// Executed by Node; browser type checks do not supply Node test types.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { limitMemory } from './memory.ts'
const header = [0, 97, 115, 109, 1, 0, 0, 0]
const exportedMemory = [7, 10, 1, 6, 109, 101, 109, 111, 114, 121, 2, 0]

test('an unlimited memory cannot grow past the execution budget', async () => {
  const bytes = new Uint8Array([...header, 5, 3, 1, 0, 1, ...exportedMemory])
  const { instance } = await WebAssembly.instantiate(limitMemory(bytes, 4))
  assert.equal(instance.exports.memory.grow(2), 1)
  assert.throws(() => instance.exports.memory.grow(2), RangeError)
})
test('an existing lower memory maximum stays lower', async () => {
  const bytes = new Uint8Array([...header, 5, 4, 1, 1, 1, 2, ...exportedMemory])
  const { instance } = await WebAssembly.instantiate(limitMemory(bytes, 4))
  assert.throws(() => instance.exports.memory.grow(2), RangeError)
})
test('truncated binaries and impossible initial memory are rejected', () => {
  assert.throws(() => limitMemory(new Uint8Array([0, 97])))
  assert.throws(() => limitMemory(new Uint8Array([...header, 5, 3, 1, 0, 5]), 4))
})
