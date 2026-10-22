/**
 * 代码快照：每次测试/提交时存一份当时编辑器里的代码。
 * 本机 localStorage，每桶（题+语言）最多 25 份，相同代码去重。
 */
import type { Environment, Verdict } from './types'

export interface Snapshot {
  ts: number
  code: string
  /** 触发来源：test / run / submit。 */
  source: 'test' | 'run' | 'submit'
  verdict?: Verdict
}

const MAX = 25
const keyOf = (bucket: string, env: Environment) => `learning-snap:${bucket}:${env}`

export function listSnapshots(bucket: string, env: Environment): Snapshot[] {
  try {
    const raw = localStorage.getItem(keyOf(bucket, env))
    const arr = raw ? JSON.parse(raw) as Snapshot[] : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

export function recordSnapshot(bucket: string, env: Environment, code: string, source: Snapshot['source'], verdict?: Verdict) {
  if (!code.trim()) return
  try {
    const list = listSnapshots(bucket, env)
    if (list[0]?.code === code) {
      // 相同代码只更新最新时间和结果，不堆重复条目。
      list[0].ts = Date.now(); if (verdict) list[0].verdict = verdict
      localStorage.setItem(keyOf(bucket, env), JSON.stringify(list))
      return
    }
    list.unshift({ ts: Date.now(), code, source, verdict })
    localStorage.setItem(keyOf(bucket, env), JSON.stringify(list.slice(0, MAX)))
  } catch { /* 隐私模式就丢 */ }
}

export function removeSnapshot(bucket: string, env: Environment, ts: number) {
  try {
    localStorage.setItem(keyOf(bucket, env),
      JSON.stringify(listSnapshots(bucket, env).filter(s => s.ts !== ts)))
  } catch { /* 忽略 */ }
}

export const fmtSnapTime = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
