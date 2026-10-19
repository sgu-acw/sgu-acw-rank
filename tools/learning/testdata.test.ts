// @ts-nocheck
// Node's test runner executes this file; the browser type check has no Node typings.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pairTests } from '../../src/lib/learning/testdata.ts'

const f = (name, text) => ({ name, text })

test('pairs .in/.out by name and orders numerically', () => {
  const { tests, skipped } = pairTests([
    f('10.in', 'a'), f('10.out', 'b'), f('2.in', 'c'), f('2.out', 'd'),
  ])
  assert.deepEqual(tests.map(t => t.input), ['c', 'a'])
  assert.deepEqual(tests.map(t => t.name), ['测试点 1', '测试点 2'])
  assert.deepEqual(skipped, [])
})

test('accepts .ans/.inp variants and nested directories', () => {
  const { tests } = pairTests([f('data/1.inp', 'x'), f('data/1.ans', 'y'), f('p/3.input', 'z'), f('p/3.answer', 'w')])
  assert.deepEqual(tests.map(t => t.input), ['x', 'z'])
})

test('reports unpaired and unrelated files instead of inventing tests', () => {
  const { tests, skipped } = pairTests([f('1.in', 'x'), f('2.out', 'y'), f('readme.md', 'z')])
  assert.deepEqual(tests, [])
  assert.deepEqual([...skipped].sort(), ['1.in', '2.out', 'readme.md'])
})

test('does not pair an input with itself across extensions', () => {
  const { tests } = pairTests([f('a.in', '1'), f('a.in', '2'), f('a.out', '3')])
  assert.equal(tests.length, 1)
  assert.equal(tests[0].input, '2')
})
