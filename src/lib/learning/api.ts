import type { Draft, Environment, Problem, ProblemContent, ProblemSummary } from './types'
import type { SubmissionRecord } from './submissions'

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(20000),
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw Object.assign(new Error('无法连接服务器，请检查网络后重试'), { status: 0 })
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  let data: Record<string, unknown> | null = null
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const detail = data?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : `请求未完成（${response.status}），请稍后重试`
    throw Object.assign(new Error(message), { status: response.status })
  }

  return data as T
}

export interface LearningRunSummary {
  id: string
  version_id: string
  problem_id: number
  environment: Environment
  runtime_version?: string
  verdict: string
  created_at: string
}

export interface LearningRunDetail extends LearningRunSummary {
  code: string
}

export const learningApi = {
  list: () => request<ProblemSummary[]>('/learning/problems'),
  get: (id: number) => request<Problem>(`/learning/problems/${id}`),
  adminList: () => request<Draft[]>('/admin/learning/problems'),
  create: (request_id: string, content: ProblemContent) =>
    request<Draft>('/admin/learning/problems', 'POST', { request_id, content }),
  save: (id: number, revision: number, content: ProblemContent) =>
    request<Draft>(`/admin/learning/problems/${id}`, 'PUT', { revision, content }),
  publish: (id: number, revision: number) =>
    request<Problem>(`/admin/learning/problems/${id}/publish`, 'POST', { revision }),
  unpublish: (id: number) =>
    request<Draft>(`/admin/learning/problems/${id}/unpublish`, 'POST'),
  remove: (id: number) =>
    request<void>(`/admin/learning/problems/${id}`, 'DELETE'),
  record: (body: SubmissionRecord) => request<{ id: string }>('/learning/runs', 'POST', body),
  progress: () => request<{ solved_problem_ids: number[] }>('/learning/progress'),
  runs: (problemId?: number) =>
    request<LearningRunSummary[]>(
      problemId ? `/learning/runs?problem_id=${problemId}` : '/learning/runs',
    ),
  runDetail: (runId: string) =>
    request<LearningRunDetail>(`/learning/runs/${encodeURIComponent(runId)}`),
}
