// @ts-nocheck
// Node's test runner executes this file; the browser type check has no Node typings.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compare, checkPoint } from './checker.ts'

test('token comparison preserves values and handles empty output and whitespace', () => {
  assert.equal(compare('42\r\n', ' 42 ', 'tokens'), true)
  assert.equal(compare('  \n', '', 'tokens'), true)
  assert.equal(compare('1 23', '12 3', 'tokens'), false)
  assert.equal(compare('42 0', '42', 'tokens'), false)
  assert.equal(compare('0042', '42', 'tokens'), false)
  assert.equal(compare('42\n', '42', 'exact'), false)
})
test('runtime failures remain failures even if partial stdout matches', () => {
  const point = checkPoint({ verdict: 'RE', stdout: '42', stderr: 'crash' }, { name: 'boundary', input: '', output: '42', sample: false }, 'tokens')
  assert.equal(point.verdict, 'RE')
  assert.equal(point.stderr, 'crash')
})
test('custom input runs without claiming a comparison against an expected answer', () => {
  const point = checkPoint({ verdict: 'OK', stdout: 'user output', stderr: '' }, { name: 'custom', input: '', output: '', sample: true }, 'exact', true)
  assert.equal(point.verdict, 'AC')
  assert.equal(point.expected, undefined)
})

test('custom run compares when an expected output is given', () => {
  const execution = { verdict: 'OK', stdout: '42\n', stderr: '' } as const
  const withoutExpected = checkPoint(execution, { name: 'c', input: '', output: '', sample: false }, 'tokens', true)
  assert.equal(withoutExpected.verdict, 'AC')
  assert.equal(withoutExpected.expected, undefined)
  const match = checkPoint(execution, { name: 'c', input: '', output: '42', sample: false }, 'tokens', true)
  assert.equal(match.verdict, 'AC')
  assert.equal(match.expected, '42')
  const mismatch = checkPoint(execution, { name: 'c', input: '', output: '43', sample: false }, 'tokens', true)
  assert.equal(mismatch.verdict, 'WA')
})
