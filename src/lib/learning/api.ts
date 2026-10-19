import type { Draft, Environment, Problem, ProblemContent, ProblemSummary } from './types'

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', signal: AbortSignal.timeout(20000),
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '请求未完成，请检查输入后重试')
  return data as T
}
export const learningApi = {
  list: () => request<ProblemSummary[]>('/learning/problems'),
  get: (id: number) => request<Problem>(`/learning/problems/${id}`),
  adminList: () => request<Draft[]>('/admin/learning/problems'),
  create: (request_id: string, content: ProblemContent) => request<Draft>('/admin/learning/problems', 'POST', { request_id, content }),
  save: (id: number, revision: number, content: ProblemContent) => request<Draft>(`/admin/learning/problems/${id}`, 'PUT', { revision, content }),
  publish: (id: number, revision: number) => request<Problem>(`/admin/learning/problems/${id}/publish`, 'POST', { revision }),
  record: (body: { id: string; version_id: string; environment: Environment; runtime_version: string; source: string; verdict: string }) => request<{ id: string }>('/learning/runs', 'POST', body),
  runs: () => request<{ id: string; version_id: string; problem_id: number; environment: Environment; verdict: string; created_at: string }[]>('/learning/runs'),
}
