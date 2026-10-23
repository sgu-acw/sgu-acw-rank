import type { Environment, JudgeResult } from './types'

export interface SubmissionRecord {
  id: string; version_id: string; environment: Environment; runtime_version: string
  source: string; verdict: string; expected_user_id?: number
}
export interface SubmissionOwner { id: number; student_id: string }
export interface PendingSubmission {
  schema: 1; owner: SubmissionOwner; problemId: number; createdAt: number
  record: SubmissionRecord; passed: number; total: number
}
const prefix = (owner: SubmissionOwner, problemId: number) => `learning-pending:v1:${owner.id}:${encodeURIComponent(owner.student_id)}:${problemId}:`
const keyOf = (pending: PendingSubmission) => prefix(pending.owner, pending.problemId) + pending.record.id
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const verdicts = new Set(['AC', 'WA', 'CE', 'RE', 'TLE', 'OLE'])

export function makePendingSubmission(owner: SubmissionOwner, problemId: number, record: SubmissionRecord, result: JudgeResult): PendingSubmission {
  return { schema: 1, owner: { id: owner.id, student_id: owner.student_id }, problemId, createdAt: Date.now(),
    record: { ...record, expected_user_id: owner.id }, passed: result.points.filter(p => p.verdict === 'AC').length, total: result.points.length }
}
function valid(p: PendingSubmission, owner: SubmissionOwner, problemId: number): boolean {
  const r = p?.record
  return p?.schema === 1 && p.owner?.id === owner.id && p.owner?.student_id === owner.student_id && p.problemId === problemId
    && Number.isFinite(p.createdAt) && Number.isInteger(p.total) && p.total >= 0 && p.total <= 100
    && Number.isInteger(p.passed) && p.passed >= 0 && p.passed <= p.total
    && !!r && uuid.test(r.id) && uuid.test(r.version_id) && r.expected_user_id === owner.id
    && ['c', 'cpp', 'python', 'java8', 'java21'].includes(r.environment) && verdicts.has(r.verdict)
    && typeof r.runtime_version === 'string' && r.runtime_version.length > 0 && r.runtime_version.length <= 160
    && typeof r.source === 'string' && new Blob([r.source]).size <= 256000
}
export function storePendingSubmission(pending: PendingSubmission, storage?: Storage): boolean {
  try {
    const store = storage ?? localStorage
    const key = keyOf(pending), previous = store.getItem(key)
    if (previous && JSON.stringify(JSON.parse(previous).record) !== JSON.stringify(pending.record)) return false
    store.setItem(key, JSON.stringify(pending)); return true
  } catch { return false }
}
export function loadPendingSubmissions(owner: SubmissionOwner, problemId: number, storage?: Storage): PendingSubmission[] {
  try {
    const store = storage ?? localStorage, start = prefix(owner, problemId), found: PendingSubmission[] = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (!key?.startsWith(start)) continue
      try {
        const p: PendingSubmission = JSON.parse(store.getItem(key) || 'null')
        if (valid(p, owner, problemId) && keyOf(p) === key) found.push(p)
      } catch { /* 一条损坏记录不能遮蔽其他待同步记录。 */ }
    }
    return found.sort((a, b) => a.createdAt - b.createdAt || a.record.id.localeCompare(b.record.id))
  } catch { return [] }
}
export function removePendingSubmission(pending: PendingSubmission, storage?: Storage): boolean {
  try {
    const store = storage ?? localStorage, key = keyOf(pending), current = store.getItem(key)
    if (current && JSON.stringify(JSON.parse(current).record) !== JSON.stringify(pending.record)) return false
    store.removeItem(key); return true
  } catch { return false }
}
