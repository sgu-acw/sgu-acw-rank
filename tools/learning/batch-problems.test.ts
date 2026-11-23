// @ts-nocheck
// Node's test runner executes this file; the browser type check has no Node typings.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBatchProblems } from '../../src/lib/batchProblems.ts'

test('parses bare keys, platform prefixes, URLs, and notes', () => {
  const input = [
    '',
    '1900C # 树形 DP',
    'cf 1A 入门题',
    'luogu P1001 # A+B',
    'atcoder abc350_a',
    'nowcoder 1001',
    'learn 42',
    'https://codeforces.com/problemset/problem/2000/b # 构造',
    'https://codeforces.com/contest/1999/problem/e',
    'https://atcoder.jp/contests/abc360/tasks/abc360_c',
    'https://www.luogu.com.cn/problem/P3372',
    'https://ac.nowcoder.com/acm/problem/21303',
    'https://sgu-acw.zh314.xyz/learn/problem?id=17&from=list:1',
  ].join('\n')

  const parsed = parseBatchProblems(input, 'codeforces')
  assert.deepEqual(parsed, [
    { platform: 'codeforces', key: '1900C', note: '树形 DP' },
    { platform: 'codeforces', key: '1A', note: '入门题' },
    { platform: 'luogu', key: 'P1001', note: 'A+B' },
    { platform: 'atcoder', key: 'abc350_a' },
    { platform: 'nowcoder', key: '1001' },
    { platform: 'learn', key: '42' },
    { platform: 'codeforces', key: '2000B', note: '构造' },
    { platform: 'codeforces', key: '1999E' },
    { platform: 'atcoder', key: 'abc360_c' },
    { platform: 'luogu', key: 'P3372' },
    { platform: 'nowcoder', key: '21303' },
    { platform: 'learn', key: '17' },
  ])
})

test('respects custom default platform for bare keys', () => {
  const parsed = parseBatchProblems('P1001\nP1002 # 第二题', 'luogu')
  assert.deepEqual(parsed, [
    { platform: 'luogu', key: 'P1001' },
    { platform: 'luogu', key: 'P1002', note: '第二题' },
  ])
})
