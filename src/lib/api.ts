/**
 * 与后端通信的薄封装。
 *
 * 后端在 VPS 上，浏览器始终只跟本站说话：生产由 Pages Function 把 /api/*
 * 转发过去，本地由 vite 代理转给 localhost:8091。两种情况都是同源，所以
 * 这里不需要配置 base URL，也不需要处理 CORS。
 *
 * 会话是 HttpOnly Cookie，前端读不到也不该读，只需带上 credentials。
 */

export interface ApiErrorBody {
  detail?: string
}

/** 后端返回了非 2xx 时抛出，detail 是可以直接显示给用户的中文说明。 */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface User {
  id: number
  student_id: string
  display_name: string
  enroll_year: number
  level: number
  college_code: string
  major_code: string
  role: 'root' | 'admin' | 'member'
  status: 'active' | 'disabled'
  created_at: string
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers:
        init.body === undefined
          ? init.headers
          : { 'Content-Type': 'application/json', ...init.headers },
      ...init,
    })
  } catch {
    // 网络层就失败了：后端没起来，或者断网。这跟 4xx 是两回事，单独说明。
    throw new ApiError(0, '无法连接服务器，请检查网络后重试')
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }

  if (!response.ok) {
    const detail = (body as ApiErrorBody | null)?.detail
    throw new ApiError(response.status, detail || `请求失败（${response.status}）`)
  }

  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data === undefined ? undefined : JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// --------------------------------------------------------------------------- //
// 具体接口
// --------------------------------------------------------------------------- //

export const authApi = {
  /**
   * 当前登录状态。未登录时返回 `{ user: null }` 而不是抛错，所以页面加载时
   * 调用它不会在控制台留下一串 401。
   */
  session: () => api.get<{ user: User | null }>('/auth/session'),

  me: () => api.get<User>('/auth/me'),

  login: (studentId: string, password: string) =>
    api.post<User>('/auth/login', { student_id: studentId, password }),

  register: (payload: {
    invite_code: string
    student_id: string
    display_name: string
    password: string
  }) => api.post<User>('/auth/register', payload),

  logout: () => api.post<void>('/auth/logout'),

  updateMe: (payload: { display_name?: string }) => api.patch<User>('/auth/me', payload),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<void>('/auth/password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
}

export const metaApi = {
  bootstrap: () => api.get<{ has_users: boolean; user_count: number }>('/bootstrap'),
}

// --------------------------------------------------------------------------- //
// 平台账号
// --------------------------------------------------------------------------- //

export interface PlatformAccount {
  id: number
  platform: Platform
  identifier: string
  verified_at: string | null
  /** 未验证时才有，是要填进平台签名的那串码。 */
  verify_token?: string | null
  verify_expires_at?: string | null
  created_at: string
}

export type Platform = 'codeforces' | 'atcoder' | 'luogu' | 'nowcoder'

/**
 * 各平台填签名的位置。成员看到「去填码」时得知道去哪填，所以把入口和
 * 字段名都写在这里。
 */
export const PLATFORM_META: Record<
  Platform,
  { label: string; field: string; settingsUrl: string; idHint: string }
> = {
  codeforces: {
    label: 'Codeforces',
    field: 'Organization',
    settingsUrl: 'https://codeforces.com/settings/social',
    idHint: 'handle，如 tourist',
  },
  atcoder: {
    label: 'AtCoder',
    field: 'Affiliation',
    settingsUrl: 'https://atcoder.jp/settings',
    idHint: '用户名，如 tourist',
  },
  luogu: {
    label: '洛谷',
    field: '个性签名',
    settingsUrl: 'https://www.luogu.com.cn/user/setting',
    idHint: '用户名或数字 uid',
  },
  nowcoder: {
    label: '牛客',
    field: '个人简介',
    settingsUrl: 'https://ac.nowcoder.com/acm/contest/profile',
    idHint: '数字 uid',
  },
}

export const accountsApi = {
  mine: () => api.get<PlatformAccount[]>('/accounts'),

  add: (platform: Platform, identifier: string) =>
    api.post<PlatformAccount>('/accounts', { platform, identifier }),

  verify: (id: number) =>
    api.post<{ ok: boolean; detail: string; account: PlatformAccount | null }>(
      `/accounts/${id}/verify`,
    ),

  renew: (id: number) => api.post<PlatformAccount>(`/accounts/${id}/renew`),

  remove: (id: number) => api.delete<void>(`/accounts/${id}`),

  of: (userId: number) => api.get<PlatformAccount[]>(`/accounts/of/${userId}`),
}

// --------------------------------------------------------------------------- //
// 每日练习量
// --------------------------------------------------------------------------- //

export interface PracticeDay {
  date: string
  count: number
}

export interface PracticeEntry {
  user_id: number
  display_name: string
  student_id: string
  enroll_year: number
  rank: number
  total: number
  days: PracticeDay[]
}

export interface PracticeRank {
  days: number
  platform: Platform | null
  dates: string[]
  entries: PracticeEntry[]
  generated_at: number
}

export interface SyncStatus {
  has_run: boolean
  started_at?: string | null
  finished_at?: string | null
  account_count: number
  ok_count: number
  error_count: number
  errors: string[]
}

export const practiceApi = {
  rank: (params: { days?: number; platform?: Platform | null } = {}) => {
    const query = new URLSearchParams()
    if (params.days) query.set('days', String(params.days))
    if (params.platform) query.set('platform', params.platform)
    const suffix = query.toString()
    return api.get<PracticeRank>(`/practice/rank${suffix ? `?${suffix}` : ''}`)
  },

  status: () => api.get<SyncStatus>('/practice/status'),
}

// --------------------------------------------------------------------------- //
// 管理
// --------------------------------------------------------------------------- //

export interface Invite {
  id: number
  code: string
  grants_role: 'member' | 'admin'
  max_uses: number
  use_count: number
  expires_at: string
  revoked_at: string | null
  note: string
  created_by: number | null
  created_at: string
  is_usable: boolean
}

export interface AdminUser {
  id: number
  student_id: string
  display_name: string
  enroll_year: number
  level: number
  college_code: string
  major_code: string
  role: 'root' | 'admin' | 'member'
  status: 'active' | 'disabled'
  created_at: string
  last_login_at: string | null
  /** 仅管理员可见可改。 */
  admin_note: string
}

export const adminApi = {
  stats: () =>
    api.get<{
      user_count: number
      active_count: number
      admin_count: number
      usable_invite_count: number
    }>('/admin/stats'),

  users: () => api.get<AdminUser[]>('/admin/users'),

  updateUser: (
    id: number,
    payload: { role?: string; status?: string; admin_note?: string },
  ) => api.patch<AdminUser>(`/admin/users/${id}`, payload),

  resetPassword: (id: number) =>
    api.post<{ student_id: string; display_name: string; temporary_password: string }>(
      `/admin/users/${id}/reset-password`,
    ),

  invites: (includeDead = true) =>
    api.get<Invite[]>(`/admin/invites?include_dead=${includeDead}`),

  createInvite: (payload: {
    max_uses: number
    ttl_hours: number
    grants_role: string
    note: string
  }) => api.post<Invite>('/admin/invites', payload),

  revokeInvite: (id: number) => api.delete<void>(`/admin/invites/${id}`),
}

/**
 * 学号在前端也校验一遍，纯粹为了即时反馈。
 *
 * 判定规则与后端 app/student_id.py 保持一致：11 位数字，前两位入学年份、
 * 第 3 位培养层次（1/2/3）、4-5 位学院码、6-7 位专业号、第 8 位班级、
 * 末三位序号；联培为 12 位，末位是大写字母。真正的裁决仍在服务端。
 */
const STUDENT_ID_RE = /^(\d{2})([123])(\d{2})(\d{2})(\d)(\d{3})([A-Z])?$/

export function isStudentIdShaped(value: string): boolean {
  return STUDENT_ID_RE.test(value.trim().toUpperCase())
}

export function normalizeStudentId(value: string): string {
  return value.trim().toUpperCase()
}
