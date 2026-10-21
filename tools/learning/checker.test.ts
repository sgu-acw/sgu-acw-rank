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

test('spj 退出码为 0 判 AC，非 0 判 WA，缺 spj 结果判环境错误', () => {
  const test = { name: 't', input: '', output: '1', sample: false }
  const ac = checkPoint({ verdict: 'OK', stdout: '1', stderr: '', spj: { verdict: 'OK', stderr: '' } }, test, 'spj')
  if (ac.verdict !== 'AC') throw new Error(`spj exit 0 should be AC, got ${ac.verdict}`)
  const wa = checkPoint({ verdict: 'OK', stdout: '2', stderr: '', spj: { verdict: 'WA', stderr: 'diff at 1' } }, test, 'spj')
  if (wa.verdict !== 'WA') throw new Error(`spj nonzero should be WA, got ${wa.verdict}`)
  // Java 语言此前漏接 spjJudge，execution.spj 为 undefined 时误落 ENVIRONMENT_ERROR；
  // 修好后所有语言都该带 spj 字段，这里锁定无字段时的行为。
  const missing = checkPoint({ verdict: 'OK', stdout: '1', stderr: '' }, test, 'spj')
  if (missing.verdict !== 'ENVIRONMENT_ERROR') throw new Error(`missing spj should be ENVIRONMENT_ERROR, got ${missing.verdict}`)
  const re = checkPoint({ verdict: 'RE', stdout: '', stderr: 'crash', spj: { verdict: 'OK', stderr: '' } }, test, 'spj')
  if (re.verdict !== 'RE') throw new Error(`RE should pass through, got ${re.verdict}`)
})
