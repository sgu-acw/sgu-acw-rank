/**
 * 行级 LCS diff + 输出差异定位，移植自 OJ++（MIT）。
 * codeDiff 给代码快照对比用；outputPosition/visibleWhitespace 给 WA 样例的
 * 第一处不同定位用。
 */
export interface DiffLine { kind: 'same' | 'add' | 'remove'; text: string; left?: number; right?: number }

/** 中段有界 LCS；大改写退回整段删/加，避免 O(n*m) 爆内存。 */
export function codeDiff(before: string, after: string): { lines: DiffLine[]; truncated: boolean; coarse: boolean } {
  if (before === after) return { lines: [], truncated: false, coarse: false }
  const a = before.split('\n'), b = after.split('\n')
  let start = 0, end = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  const n = a.length - start - end, m = b.length - start - end
  const lines: DiffLine[] = []
  let truncated = false
  const push = (line: DiffLine) => { if (lines.length < 500) lines.push(line); else truncated = true }
  for (let i = Math.max(0, start - 3); i < start; i++) push({ kind: 'same', text: a[i]!, left: i + 1, right: i + 1 })
  const coarse = (n + 1) * (m + 1) > 2_000_000
  if (coarse) {
    const removed = Math.min(n, Math.floor((500 - lines.length) / 2))
    const added = Math.min(m, 500 - lines.length - removed)
    for (let i = 0; i < removed; i++) push({ kind: 'remove', text: a[start + i]!, left: start + i + 1 })
    for (let j = 0; j < added; j++) push({ kind: 'add', text: b[start + j]!, right: start + j + 1 })
    truncated = removed < n || added < m
  } else {
    const width = m + 1, dp = new Uint32Array((n + 1) * width)
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * width + j] = a[start + i] === b[start + j]
      ? dp[(i + 1) * width + j + 1]! + 1 : Math.max(dp[(i + 1) * width + j]!, dp[i * width + j + 1]!)
    let i = 0, j = 0
    while ((i < n || j < m) && !truncated) {
      if (i < n && j < m && a[start + i] === b[start + j]) { push({ kind: 'same', text: a[start + i]!, left: start + i + 1, right: start + j + 1 }); i++; j++ }
      else if (i < n && (j === m || dp[(i + 1) * width + j]! >= dp[i * width + j + 1]!)) { push({ kind: 'remove', text: a[start + i]!, left: start + i + 1 }); i++ }
      else { push({ kind: 'add', text: b[start + j]!, right: start + j + 1 }); j++ }
    }
  }
  for (let k = 0; k < Math.min(3, end) && !truncated; k++) push({ kind: 'same', text: a[a.length - end + k]!, left: a.length - end + k + 1, right: b.length - end + k + 1 })
  return { lines, truncated, coarse }
}

/** 输出第一处不同的位置（行、列），对空白字符可见化。 */
export function outputPosition(text: string, offset: number) {
  const prefix = text.slice(0, offset), line = prefix.split('\n').length
  return { line, column: [...prefix.slice(prefix.lastIndexOf('\n') + 1)].length + 1 }
}

export function firstDiffOffset(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  // 不切开代理对。
  if (i > 0 && /[\uD800-\uDBFF]/.test(a[i - 1] ?? '')) i--
  return i
}

export const visibleWhitespace = (text: string) =>
  text.replace(/ /g, '·').replace(/\t/g, '→\t').replace(/\r/g, '␍').replace(/\n/g, '↵\n')
