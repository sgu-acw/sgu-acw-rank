import type { Execution, PointResult, TestCase } from '../../src/lib/learning/types'

export function compare(actual: string, expected: string, mode: 'exact' | 'tokens'): boolean {
  if (mode === 'exact') return actual === expected
  const tokens = (text: string) => text.match(/\S+/gu) ?? []
  const a = tokens(actual), b = tokens(expected)
  return a.length === b.length && a.every((value, index) => value === b[index])
}
export function checkPoint(execution: Execution, test: TestCase, checker: 'exact' | 'tokens', custom = false): PointResult {
  return { ...execution, name: test.name,
    // 自定义输入也可以填期望输出；填了就跟正式测试点一样判定，没填只算运行完成。
    verdict: execution.verdict === 'OK'
      ? (custom && !test.output ? 'AC' : (compare(execution.stdout, test.output, checker) ? 'AC' : 'WA'))
      : execution.verdict,
    ...(execution.verdict === 'OK' && test.output ? { expected: test.output } : {}) }
}
