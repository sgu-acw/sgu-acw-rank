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
  /**
   * 429 时后端给的 `Retry-After`，单位秒。
   *
   * 有它就不用去解析中文提示来算倒计时——那个字符串随时可能改。
   */
  readonly retryAfter: number | null

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfter = retryAfter
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
  class_no: number
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
    const retryAfterRaw = response.headers.get('Retry-After')
    const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : null
    throw new ApiError(
      response.status,
      detail || `请求失败（${response.status}）`,
      Number.isFinite(retryAfter) ? retryAfter : null,
    )
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
 *
 * settingsUrl 是函数而不是固定字符串：洛谷改签名在个人主页
 * （``/user/{uid}``），uid 因人而异，写死一个地址会把所有人带到设置页，
 * 而那一页根本没有签名输入框。
 */
export const PLATFORM_META: Record<
  Platform,
  {
    label: string
    field: string
    hint?: string
    settingsUrl: (identifier: string) => string
    idHint: string
  }
> = {
  codeforces: {
    label: 'Codeforces',
    // 不能填 Organization：那是个选择器，会要求从已有组织里选或者新建一个，
    // 填不进任意文本。名字、姓氏、城市都是自由文本。
    field: '姓氏',
    hint: '「组织」是个选择器，填不了任意文本。请填在「姓氏（英文）」里；已经写过姓氏的话，填在「城市」里也一样。',
    settingsUrl: () => 'https://codeforces.com/settings/social',
    idHint: 'handle，如 tourist',
  },
  atcoder: {
    label: 'AtCoder',
    field: 'Affiliation',
    settingsUrl: () => 'https://atcoder.jp/settings',
    idHint: '用户名，如 tourist',
  },
  luogu: {
    label: '洛谷',
    field: '个性签名',
    // 洛谷的签名在个人主页上改，不在设置页。identifier 存的就是数字 uid。
    settingsUrl: (identifier: string) => `https://www.luogu.com.cn/user/${identifier}`,
    idHint: '用户名或数字 uid',
  },
  nowcoder: {
    label: '牛客',
    field: '个人简介',
    settingsUrl: () => 'https://ac.nowcoder.com/acm/contest/profile',
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

/**
 * 各平台的题号写法。用于题单管理里填题号时的提示。
 *
 * 与 idHint 分开：那是绑定账号时填 handle 的提示（「handle，如 tourist」），
 * 拿来提示题号会把人引到错误的地方。
 */
export const PROBLEM_KEY_HINT: Record<Platform, string> = {
  codeforces: '题号，如 1004A',
  atcoder: '题号，如 abc300_a',
  luogu: '题号，如 P1001',
  nowcoder: '题号，如 nowcoder:A+B Problem',
}

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
  /** 学院名可能被管理员改过，所以不一定跟 college_code 对得上。 */
  college_code: string
  major_code: string
  college_name: string | null
  major_name: string | null
  /** 专业加班级序号，如「软件工程 3 班」。 */
  class_label: string | null
  total: number
  days: PracticeDay[]
}

export interface PracticeRank {
  days: number
  platform: Platform | null
  dates: string[]
  entries: PracticeEntry[]
  generated_at: number
  /** 可从全部有数据的人里统计，所以选完一个学院其他学院还在。 */
  filters: { colleges: string[]; enroll_years: number[] }
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

export interface DashboardAccount {
  platform: Platform
  label: string
  identifier: string
  platform_name: string | null
  verified: boolean
  rating: number | null
  max_rating: number | null
}

export interface Dashboard {
  practice_day: string
  today: number
  week: number
  total: number
  days: PracticeDay[]
  practice_rank: number | null
  practice_total: number
  accounts: DashboardAccount[]
  refresh_remaining: number
  refresh_limit: number
}

export interface RefreshResult {
  synced: number
  added: number
  failures: string[]
  remaining: number
}

export interface RatingEntry {
  user_id: number
  display_name: string
  student_id: string
  enroll_year: number
  rank: number
  /** 与练习量榜保持一致，两个维度显示的信息不该有差别。 */
  college_code: string
  major_code: string
  college_name: string | null
  major_name: string | null
  class_label: string | null
  platform: Platform
  identifier: string
  platform_name: string | null
  rating: number | null
  max_rating: number | null
  fetched_at: string | null
}

export interface RatingBoard {
  platform: Platform
  label: string
  entries: RatingEntry[]
  generated_at: number
}

export const practiceApi = {
  rank: (
    params: {
      days?: number
      platform?: Platform | null
      college?: string | null
      enroll_year?: number | null
      q?: string | null
    } = {},
  ) => {
    const query = new URLSearchParams()
    if (params.days) query.set('days', String(params.days))
    if (params.platform) query.set('platform', params.platform)
    if (params.college) query.set('college', params.college)
    if (params.enroll_year) query.set('enroll_year', String(params.enroll_year))
    if (params.q) query.set('q', params.q)
    const suffix = query.toString()
    return api.get<PracticeRank>(`/practice/rank${suffix ? `?${suffix}` : ''}`)
  },

  status: () => api.get<SyncStatus>('/practice/status'),

  /** 首页面板：一次拿齐所有数字。 */
  dashboard: () => api.get<Dashboard>('/practice/dashboard'),

  /** 某个平台的 rating 榜。 */
  rating: (platform: Platform) =>
    api.get<RatingBoard>(`/practice/rating?platform=${platform}`),

  quota: () =>
    api.get<{ week_start: string; limit: number; used: number; remaining: number }>(
      '/practice/quota',
    ),

  /** 手动刷新自己的账号。每周三次。 */
  refresh: () => api.post<RefreshResult>('/practice/refresh'),
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
  /** 创建者姓名与学号。码出了问题得知道找谁问。 */
  created_by_name: string | null
  created_by_student_id: string | null
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
  class_no: number
  role: 'root' | 'admin' | 'member'
  status: 'active' | 'disabled'
  created_at: string
  last_login_at: string | null
  /** 仅管理员可见可改。 */
  admin_note: string
  /** 学院名与专业名。可能被管理员改过，所以不一定跟码对得上。 */
  college_name: string | null
  major_name: string | null
}

export interface AdminUserPage {
  items: AdminUser[]
  total: number
  page: number
  page_size: number
  enroll_years: number[]
  college_codes: string[]
}

export interface AdminUserQuery {
  q?: string
  role?: string
  status?: string
  enroll_year?: number | null
  college_code?: string
  has_account?: boolean | null
  page?: number
  page_size?: number
  sort?: string
}

export const adminApi = {
  stats: () =>
    api.get<{
      user_count: number
      active_count: number
      admin_count: number
      usable_invite_count: number
    }>('/admin/stats'),

  users: (query: AdminUserQuery = {}) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      // 空值不发，避免后端把空串当成筛选条件。
      if (value === undefined || value === null || value === '') continue
      params.set(key, String(value))
    }
    const suffix = params.toString()
    return api.get<AdminUserPage>(`/admin/users${suffix ? `?${suffix}` : ''}`)
  },

  createUser: (payload: {
    student_id: string
    display_name: string
    password: string
    role?: string
    admin_note?: string
  }) => api.post<AdminUser>('/admin/users', payload),

  updateUser: (
    id: number,
    payload: {
      role?: string
      status?: string
      admin_note?: string
      display_name?: string
      /** 空串表示恢复成按学号查表。 */
      college_override?: string
      major_override?: string
    },
  ) => api.patch<AdminUser>(`/admin/users/${id}`, payload),

  deleteUser: (id: number) => api.delete<void>(`/admin/users/${id}`),

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

// --------------------------------------------------------------------------- //
// 题单
// --------------------------------------------------------------------------- //

/** 题单的两种形态。合集装题单，题单装题目。 */
export type ProblemListKind = 'collection' | 'list'

export interface ProblemEntry {
  id: number
  platform: Platform
  key: string
  position: number
  note: string
  /** 以下来自题目缓存。抓不到时 name 为空，missing_reason 说明原因。 */
  name: string
  rating: number | null
  tags: string[]
  url: string
  missing_reason: string
  /** 当前查看的人过了没有。未登录时是 null——进度是个人数据。 */
  done: boolean | null
}

export interface ProblemListSummary {
  id: number
  kind: ProblemListKind
  title: string
  description: string
  collection_id: number | null
  position: number
  created_at: string
  updated_at: string
  /** 题目数（题单）或子题单数（合集）。 */
  item_count: number
  done_count: number
  /** 合集是它下面所有题单的题数合计。 */
  total_problems: number
}

export interface ProblemListDetail extends ProblemListSummary {
  problems: ProblemEntry[]
  children: ProblemListSummary[]
}

export interface ProblemLookup {
  platform: Platform
  key: string
  name: string
  rating: number | null
  tags: string[]
  url: string
  missing_reason: string
  cached: boolean
}

export const problemListApi = {
  /**
   * 默认返回顶层：所有合集，加上不属于任何合集的题单。
   *
   * `include_nested` 会连合集内部的题单一起返回，管理页需要——否则管理员
   * 看不到已经放进合集的题单，也就没法给它们加题。
   */
  list: (
    params: {
      collection_id?: number | null
      kind?: ProblemListKind | null
      include_nested?: boolean
    } = {},
  ) => {
    const search = new URLSearchParams()
    if (params.collection_id != null) search.set('collection_id', String(params.collection_id))
    if (params.kind) search.set('kind', params.kind)
    if (params.include_nested) search.set('include_nested', 'true')
    const qs = search.toString()
    return api.get<ProblemListSummary[]>(`/problem-lists${qs ? `?${qs}` : ''}`)
  },

  get: (id: number) => api.get<ProblemListDetail>(`/problem-lists/${id}`),

  create: (payload: {
    kind: ProblemListKind
    title: string
    description?: string
    collection_id?: number | null
    admin_note?: string
  }) => api.post<ProblemListSummary>('/problem-lists', payload),

  update: (
    id: number,
    payload: {
      title?: string
      description?: string
      admin_note?: string
      collection_id?: number | null
      set_collection?: boolean
    },
  ) => api.patch<ProblemListSummary>(`/problem-lists/${id}`, payload),

  remove: (id: number) => api.delete<void>(`/problem-lists/${id}`),

  reorder: (ids: number[]) =>
    api.post<ProblemListSummary[]>('/problem-lists/reorder', { ids }),

  /** 按题号查题目信息，用于输入时预览。 */
  lookup: (platform: Platform, key: string) =>
    api.get<ProblemLookup>(
      `/problem-lists/lookup/problem?platform=${platform}&key=${encodeURIComponent(key)}`,
    ),

  /** 整批刷新 CF 题库。一次拿回一万多题。 */
  refreshCodeforces: () =>
    api.post<{ total: number; added: number; updated: number }>(
      '/problem-lists/refresh-codeforces',
      {},
    ),

  addProblem: (listId: number, payload: { platform: Platform; key: string; note?: string }) =>
    api.post<ProblemEntry>(`/problem-lists/${listId}/problems`, payload),

  updateProblem: (listId: number, itemId: number, payload: { note?: string }) =>
    api.patch<ProblemEntry>(`/problem-lists/${listId}/problems/${itemId}`, payload),

  removeProblem: (listId: number, itemId: number) =>
    api.delete<void>(`/problem-lists/${listId}/problems/${itemId}`),

  reorderProblems: (listId: number, ids: number[]) =>
    api.post<ProblemEntry[]>(`/problem-lists/${listId}/problems/reorder`, { ids }),
}
