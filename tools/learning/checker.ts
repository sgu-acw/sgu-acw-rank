import type { Execution, PointResult, TestCase, Verdict } from '../../src/lib/learning/types'

export function compare(actual: string, expected: string, mode: 'exact' | 'tokens'): boolean {
  if (mode === 'exact') return actual === expected
  const tokens = (text: string) => text.match(/\S+/gu) ?? []
  const a = tokens(actual), b = tokens(expected)
  return a.length === b.length && a.every((value, index) => value === b[index])
}
export function checkPoint(execution: Execution, test: TestCase, checker: 'exact' | 'tokens' | 'spj', custom = false): PointResult {
  // 'OK' 是执行成功的中间态，落到测试点上必须收敛成正式判定。
  let verdict: Verdict = execution.verdict === 'OK' ? 'AC' : execution.verdict
  if (execution.verdict === 'OK') {
    if (checker === 'spj') {
      // SPJ 已经在 worker 里跑完：退出码 0 判过，否则答案错误。
      // spj 没回来说明 worker 侧执行异常，按环境错误算。
      verdict = execution.spj?.verdict === 'OK' ? 'AC' : execution.spj ? 'WA' : 'ENVIRONMENT_ERROR'
    } else {
      verdict = custom && !test.output ? 'AC' : (compare(execution.stdout, test.output, checker) ? 'AC' : 'WA')
    }
  }
  return { ...execution, name: test.name, verdict,
    // SPJ 的 stderr 是判定说明（比如差在哪），附进 error 字段回显。
    ...(execution.spj?.stderr || execution.spj?.error ? { error: [execution.spj?.stderr, execution.spj?.error].filter(Boolean).join('\n') || execution.error } : {}),
    ...(execution.verdict === 'OK' && checker !== 'spj' && test.output ? { expected: test.output } : {}) }
}
