/**
 * 与后端通信的薄封装。
 *
 * 后端在 VPS 上，浏览器始终只跟本站说话：生产由源站 OpenResty 把 /api/*
 * 转发过去，本地由 vite 代理转给 localhost:8091。两种情况都是同源，所以
 * 这里不需要配置 base URL，也不需要处理 CORS。
 *
 * 会话是 HttpOnly Cookie，前端读不到也不该读，只需带上 credentials。
 */

export interface ApiErrorBody {
  detail?: string | { msg?: string; loc?: (string | number)[] }[]
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

export interface PublicUser {
  id: number
  display_name: string
  student_id: string
  enroll_year: number
  college_code: string
  major_code: string
  college_name: string | null
  major_name: string | null
  class_label: string | null
  role: string
}

export interface AcademicOptions {
  colleges: string[]
  majors: Record<string, string[]>
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
  /** 两步验证是否已开启。 */
  totp_enabled?: boolean
  created_at: string
}

async function request<T>(path: string, init: RequestInit = {}, format: 'json' | 'blob' = 'json'): Promise<T> {
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

  if (response.ok && format === 'blob') return await response.blob() as T

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
      typeof detail === 'string' ? detail : Array.isArray(detail)
        ? detail.map(item => item.msg || '输入格式不正确').join('；')
        : `请求失败（${response.status}）`,
      Number.isFinite(retryAfter) ? retryAfter : null,
    )
  }

  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data === undefined ? undefined : JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// --------------------------------------------------------------------------- //
// 具体接口
// --------------------------------------------------------------------------- //

export interface PasskeyEntry {
  id: number
  name: string
  transports: string
  created_at: string
  last_used_at: string | null
}

export const authApi = {
  /**
   * 当前登录状态。未登录时返回 `{ user: null }` 而不是抛错，所以页面加载时
   * 调用它不会在控制台留下一串 401。
   */
  session: () => api.get<{ user: User | null }>('/auth/session'),

  me: () => api.get<User>('/auth/me'),

  /**
   * 密码登录。开了两步验证的账号返回 `{totp_required: true, ticket}`——
   * 票据要接着交给 ``loginTotp`` 换真会话，不能当登录成功。
   */
  login: (studentId: string, password: string) =>
    api.post<{ totp_required: false; user: User } | { totp_required: true; ticket: string }>(
      '/auth/login',
      { student_id: studentId, password },
    ),

  /** 两步验证第二步：票据 + 验证码 → 会话。 */
  loginTotp: (ticket: string, code: string) =>
    api.post<{ totp_required: false; user: User }>('/auth/login/totp', { ticket, code }),

  /** 通行密钥登录第一步：匿名拿挑战。 */
  passkeyLoginBegin: () => api.post<{ options: Record<string, unknown> }>('/auth/passkey/login/begin'),
  /** 通行密钥登录第二步：签名挑战 → 会话。 */
  passkeyLoginComplete: (challenge: string, credential: Record<string, unknown>) =>
    api.post<{ user: User; totp_required: false }>('/auth/passkey/login/complete', {
      challenge,
      credential,
    }),

  /** 自己账号的两步验证开关。 */
  totpBegin: () => api.post<{ secret: string; otpauth_uri: string; qr_svg: string }>('/auth/me/totp/begin'),
  totpEnable: (code: string) => api.post<{ ok: boolean }>('/auth/me/totp/enable', { code }),
  totpDisable: (code: string) => api.post<{ ok: boolean }>('/auth/me/totp/disable', { code }),

  /** 自己账号的通行密钥管理。 */
  passkeys: () => api.get<PasskeyEntry[]>('/me/passkeys'),
  passkeyRegisterBegin: () =>
    api.post<{ options: Record<string, unknown> }>('/me/passkeys/register/begin'),
  passkeyRegisterComplete: (challenge: string, credential: Record<string, unknown>, name: string) =>
    api.post<PasskeyEntry>('/me/passkeys/register/complete', { challenge, credential, name }),
  passkeyRemove: (id: number) => api.delete(`/me/passkeys/${id}`),

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

export const usersApi = {
  detail: (id: number) => api.get<PublicUser>(`/users/${id}`),
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
  /** 账号状态标记：privacy = 隐私保护，unverified = 未实名。null 正常。 */
  sync_flag?: 'privacy' | 'unverified' | null
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
  // 牛客填数字就行，竞赛站的题目 id。主站的题是 uuid，很少手填。
  nowcoder: '题号，如 233234',
}

/** 本地浏览器评测的练习题。不是同步平台，只在本地预览里出现在题单/集训中。 */
export const LEARN_PLATFORM = 'learn'
/**
 * 题库是否启用。默认开启；需要临时下线时构建时设
 * PUBLIC_LEARN_ENABLED=false（导航入口、页面、管理页一起消失）。
 */
export const LEARN_LOCAL = import.meta.env.PUBLIC_LEARN_ENABLED !== 'false'

/** 题行、题单、集训用的平台显示名；覆盖 PLATFORM_META 之外的本地平台。 */
export function platformLabel(platform: string): string {
  if (platform === LEARN_PLATFORM) return '题库'
  return PLATFORM_META[platform as Platform]?.label ?? platform
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
    // 用 != null 而不是真值判断：days=0 是合法的（历史综合），
    // 而 0 是 falsy，写成 if (params.days) 会把它吞掉。
    if (params.days != null) query.set('days', String(params.days))
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

/** 成员列表里显示的平台账号摘要。 */
export interface AdminAccountBrief {
  id: number
  platform: Platform
  identifier: string
  display_name: string | null
  /** 验证通过的时间。为 null 表示还没验证，不计入榜单。 */
  verified_at: string | null
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
  /** 成员能不能发文章。管理员天然能，这个开关只管普通成员。 */
  can_post: boolean
  /** 学院名与专业名。可能被管理员改过，所以不一定跟码对得上。 */
  college_name: string | null
  major_name: string | null
  /** 绑定的平台账号。列表页直接显示，不用点进详情。 */
  accounts: AdminAccountBrief[]
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
  // ---------------------------------------------------------------- //
  // 题解管理
  // ---------------------------------------------------------------- //

  /** 题解列表。不传 day 则返回全部，从新到旧。 */
  editorials: (query: { day?: string; status?: string; q?: string; limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      params.set(key, String(value))
    }
    const suffix = params.toString()
    return api.get<AdminEditorialPage>(`/admin/editorials${suffix ? `?${suffix}` : ''}`)
  },

  /** 还没生成题解的题，用来提示补跑。 */
  missingEditorials: (days = 30) =>
    api.get<MissingEditorial[]>(`/admin/editorials/missing?days=${days}`),

  updateEditorial: (
    id: number,
    payload: { hints?: string; body?: string; code?: Record<string, string> },
  ) => api.patch<AdminEditorial>(`/admin/editorials/${id}`, payload),

  publishEditorial: (id: number) =>
    api.post<AdminEditorial>(`/admin/editorials/${id}/publish`),

  unpublishEditorial: (id: number) =>
    api.post<AdminEditorial>(`/admin/editorials/${id}/unpublish`),

  deleteEditorial: (id: number) => api.delete<void>(`/admin/editorials/${id}`),


  /** 成员详情的管理员视角。普通成员调用会 403。 */
  memberDetail: (userId: number) => api.get<AdminMemberDetail>(`/admin/members/${userId}`),

  academics: () => api.get<AcademicOptions>('/admin/academics'),

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
      /** 「可发文章」开关。 */
      can_post?: boolean
      /** 班级序号，0 = 未分班。 */
      class_no?: number
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
  /** 同步平台或本地练习（learn）。
  platform: Platform | 'learn'
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

export interface ProblemListRankEntry {
  user_id: number
  display_name: string
  student_id: string
  enroll_year: number
  college_name: string | null
  major_name: string | null
  class_label: string | null
  done_count: number
  total: number
  /** 完成度百分比，0~100。 */
  percent: number
  last_done_date: string | null
}

export interface ProblemListRank {
  list_id: number
  title: string
  total: number
  entries: ProblemListRankEntry[]
}

/** 每日一题里的一道。 */
export interface DailyProblemEntry {
  /** 难度档位：800-1000 / 1100-1300 / 1400-1600。 */
  band: string
  platform: Platform
  key: string
  name: string
  rating: number | null
  url: string
  /** CF 全站多少人过了。用来旁证难度可信度。 */
  solved_count: number | null
  /** 站内有多少成员做对了这道题。 */
  members_solved: number
  /** 当前用户过没过。未登录时是 false。 */
  solved: boolean
}

export interface DailyProblemBoard {
  day: string
  /** 下一次换题的时刻（东八区次日零点），拿去算倒计时。 */
  reset_at: string
  problems: DailyProblemEntry[]
  /** 当前用户签到了几天。 */
  checkin_days: number
  /** 当前用户连续签到几天。 */
  checkin_streak: number
  /** 今天签到了没。 */
  checked_in_today: boolean
  /** 今天有谁签到了。 */
  checked_in_today_names: string[]
}

export interface CheckinEntry {
  rank: number
  user_id: number
  display_name: string
  student_id: string
  enroll_year: number
  class_label: string | null
  days: number
  streak: number
}

export interface CheckinBoard {
  entries: CheckinEntry[]
  total_members: number
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

/** 管理员看到的题解。比成员多状态、模型、失败原因。 */
export interface AdminEditorial {
  id: number
  daily_problem_id: number
  day: string
  platform: string
  key: string
  name: string
  rating: number | null

  status: 'pending' | 'draft' | 'published' | 'failed'
  error: string
  model: string

  hints: string
  body: string
  code: Record<string, string>

  generated_at: string | null
  published_at: string | null

  publish_at: string
}

export interface AdminEditorialPage {
  items: AdminEditorial[]
  total: number
}

/** 还没生成题解的题。 */
export interface MissingEditorial {
  daily_problem_id: number
  day: string
  band: string
  key: string
  name: string
  rating: number | null
  /** 今天的题还没生成是正常的，往日没有才是真漏了。 */
  is_today: boolean
}

/** 一道题的题解。未公布时只有 status 和 publish_at。 */
export interface EditorialView {
  band: string
  platform: string
  key: string
  name: string
  rating: number | null
  url: string

  status: 'pending' | 'draft' | 'published' | 'failed'
  available: boolean
  publish_at: string | null

  hints: string[]
  body: string
  /** 代码和正文一起公布，所以这个字段恒为 true（正文可见时代码就可见）。 */
  code_available: boolean
  /** 语言 → 源码。 */
  code: Record<string, string>
}

/** 某一天的题解。 */
export interface DayEditorials {
  day: string
  problems: EditorialView[]
}

/** 某道题的一个通过者。 */
export interface SolverEntry {
  rank: number
  user_id: number
  display_name: string
  student_id: string
  enroll_year: number
  class_label: string | null
  /** 我们记录到的时刻，不是平台上真实的通过时间。 */
  solved_at: string
}

/** 某道题的通过情况。 */
export interface ProblemSolvers {
  band: string
  platform: Platform
  key: string
  name: string
  rating: number | null
  /** 题面地址。后端算好的，前端不自己拼。 */
  url: string
  /** 通过者，按记录时间从早到晚。第一个就是最早通过。 */
  entries: SolverEntry[]
}

/** 当天每道题各自的通过名单。 */
export interface DailySolversBoard {
  day: string
  problems: ProblemSolvers[]
}

/** 往日列表里的一条。 */
export interface RecentDay {
  day: string
  problem_count: number
  editorial_count: number
}

export const dailyApi = {
  /** 某一天的每日一题，默认今天。同一天多次调用返回同一套。 */
  get: (day?: string) =>
    api.get<DailyProblemBoard>(`/daily${day ? `?day=${day}` : ''}`),

  /** 重抽某一天。管理员用。 */
  redraw: (day?: string) =>
    api.post<DailyProblemBoard>(`/daily/redraw${day ? `?day=${day}` : ''}`),

  /** 签到天数排行榜。 */
  checkin: () => api.get<CheckinBoard>('/daily/checkin'),

  /** 当天每道题谁通过了，按记录时间从早到晚。 */
  solvers: (day?: string) =>
    api.get<DailySolversBoard>(`/daily/solvers${day ? `?day=${day}` : ''}`),

  /** 某一天的题解，默认今天。未公布的内容服务端不会返回。 */
  editorials: (day?: string) =>
    api.get<DayEditorials>(`/daily/editorials${day ? `?day=${day}` : ''}`),

  /** 有每日一题的往日列表。 */
  recentDays: (limit = 30) =>
    api.get<RecentDay[]>(`/daily/editorials/recent?limit=${limit}`),
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

  /** 题单的完成度排行榜。 */
  rank: (id: number) => api.get<ProblemListRank>(`/problem-lists/${id}/rank`),

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
  lookup: (platform: Platform | 'learn', key: string) =>
    api.get<ProblemLookup>(
      `/problem-lists/lookup/problem?platform=${platform}&key=${encodeURIComponent(key)}`,
    ),

  purgeProblemCache: (platform?: Platform) =>
    api.post<{ deleted: number; platform: string | null }>(
      `/problem-lists/purge-problem-cache${platform ? `?platform=${platform}` : ''}`,
      {},
    ),

  /** 整批刷新 CF 题库。一次拿回一万多题。 */
  refreshCodeforces: () =>
    api.post<{ total: number; added: number; updated: number }>(
      '/problem-lists/refresh-codeforces',
      {},
    ),

  addProblem: (listId: number, payload: { platform: Platform | 'learn'; key: string; note?: string }) =>
    api.post<ProblemEntry>(`/problem-lists/${listId}/problems`, payload),

  updateProblem: (listId: number, itemId: number, payload: { note?: string }) =>
    api.patch<ProblemEntry>(`/problem-lists/${listId}/problems/${itemId}`, payload),

  removeProblem: (listId: number, itemId: number) =>
    api.delete<void>(`/problem-lists/${listId}/problems/${itemId}`),

  reorderProblems: (listId: number, ids: number[]) =>
    api.post<ProblemEntry[]>(`/problem-lists/${listId}/problems/reorder`, { ids }),
}

// --------------------------------------------------------------------------- //
// 管理员视角的成员详情
// --------------------------------------------------------------------------- //

/**
 * 管理员看到的一个平台账号。
 *
 * 比成员自己看到的多出同步健康度：抓取时间、失败次数、最近错误。这些是
 * 用来回答「这个人为什么没数据」的，对成员本人没有意义。
 */
export interface AdminAccountDetail {
  id: number
  platform: Platform
  identifier: string
  display_name: string | null

  verified_at: string | null
  /** 验证尝试次数。冷却时间随它翻倍。 */
  verify_attempts: number
  verify_attempted_at: string | null

  rating: number | null
  max_rating: number | null
  rating_fetched_at: string | null
  solved_fetched_at: string | null
  /** 最后一次抓到新题的时间。与 solved_fetched_at 不同：后者只是「最后一次去看」。 */
  last_active_at: string | null

  last_error: string | null
  consecutive_failures: number
  rating_failures: number
  sync_flag: 'privacy' | 'unverified' | null

  created_at: string
  solved_count: number
  active_days: number
}

/** 管理员视角的成员详情。在公开信息之外，加上排查用的那一块。 */
export interface AdminMemberDetail {
  id: number
  display_name: string
  student_id: string
  enroll_year: number
  level: number
  college_code: string
  major_code: string
  college_name: string | null
  major_name: string | null
  class_label: string | null
  role: string
  status: string

  admin_note: string
  last_login_at: string | null
  created_at: string

  accounts: AdminAccountDetail[]

  total_solved: number
  /** 最近 30 天有几天做过题。 */
  active_days_30: number
  last_practice_date: string | null
  /** 有几个账号处于连续失败状态。 */
  failing_accounts: number
}

// --------------------------------------------------------------------------- //
// 集训
// --------------------------------------------------------------------------- //

/** 集训里的一道题。 */
export interface CampProblem {
  platform: Platform | 'learn'
  key: string
  name: string
  rating: number | null
  url: string
  /** 已报名成员的集训通过状态；未报名访问者恒为 false，界面不展示通过标记。 */
  done: boolean
}

/** 排行榜里的一人。 */
export interface CampLeaderboardEntry {
  rank: number
  user_id: number
  display_name: string
  student_id: string
  enroll_year: number
  class_label: string | null
  college_name: string | null
  major_name: string | null
  solved_count: number
  /** 「平台:题号」→ 是否通过。 */
  per_problem: Record<string, boolean>
}

export interface CampResultStatus {
  phase: 'scheduled' | 'running' | 'finalizing' | 'finalized'
  finalized_at: string | null
  pending_accounts: number
}

/** 截止后题单公开；截止前仅已报名且已开始可见。排行榜始终仅已报名且已开始返回。 */
export interface CampDetail extends CampResultStatus {
  id: number
  name: string
  description: string
  start_at: string
  end_at: string
  started: boolean
  ended: boolean
  /** 生效的开放报名 / 开始显示时间。 */
  register_open: string | null
  visible_from: string | null
  registered: boolean
  registration_count: number
  problem_count: number
  /** 涉及的平台。报名前就显示——「需要哪些账号」是报名决策的一部分。 */
  platforms: Platform[]
  can_register: boolean
  can_unregister: boolean
  register_reason: string
  problems: CampProblem[]
  leaderboard: CampLeaderboardEntry[]
}

/** 列表页的一条。 */
export interface CampSummary {
  id: number
  name: string
  description: string
  start_at: string
  end_at: string
  started: boolean
  ended: boolean
  /** 生效的开放报名 / 开始显示时间。null = 不设限制。 */
  register_open: string | null
  visible_from: string | null
  registration_count: number
  problem_count: number
}

export const campApi = {
  list: () => api.get<CampSummary[]>('/camps'),
  detail: (id: number) => api.get<CampDetail>(`/camps/${id}`),
  register: (id: number) => api.post(`/camps/${id}/register`),
  unregister: (id: number) => api.post(`/camps/${id}/unregister`),
}

export interface CampAdminProblem {
  id: number
  platform: Platform
  key: string
  position: number
  /** 题名。管理页题目列表显示用。 */
  name: string
  rating: number | null
}

export interface CampAdminDetail extends CampSummary, CampResultStatus {
  created_by: number
  /** 编辑表单用的原始字段：_at 非空 = 绝对模式，否则按 _days 回推。 */
  register_open_at: string | null
  register_open_days: number | null
  visible_at: string | null
  visible_days: number | null
  problems: CampAdminProblem[]
  registrations: { user_id: number; display_name: string; registered_at: string }[]
  /** 最终榜单。管理员在管理页也要能看到谁过了什么。 */
  leaderboard: CampLeaderboardEntry[]
}

/** 开放报名 / 开始显示的模式化时间。_at = 绝对时间，_days = 开始前偏移天数。 */
export interface CampTimingPayload {
  register_open_at?: string | null
  register_open_days?: number | null
  visible_at?: string | null
  visible_days?: number | null
}

export const campAdminApi = {
  list: () => api.get<CampSummary[]>('/admin/camps'),
  detail: (id: number) => api.get<CampAdminDetail>(`/admin/camps/${id}`),
  create: (payload: CampTimingPayload & { name: string; description: string; start_at: string; end_at: string }) =>
    api.post<CampSummary>('/admin/camps', payload),
  update: (id: number, payload: Partial<{ name: string; description: string; start_at: string; end_at: string } & CampTimingPayload>) =>
    api.put<CampSummary>(`/admin/camps/${id}`, payload),
  remove: (id: number) => api.delete(`/admin/camps/${id}`),
  reorderProblems: (id: number, ids: number[]) =>
    api.post<CampAdminProblem[]>(`/admin/camps/${id}/problems/reorder`, { ids }),
  addProblem: (id: number, platform: Platform | 'learn', key: string) =>
    api.post(`/admin/camps/${id}/problems`, { platform, key }),
  /**
   * 批量导入题目。items 和 problem_list_id 可以一起给，重复的跳过。
   * 返回 added / skipped / failed。
   */
  importProblems: (
    id: number,
    payload: { items?: { platform: Platform | 'learn'; key: string }[]; problem_list_id?: number },
  ) => api.post<{ added: number; skipped: number; failed: string[] }>(`/admin/camps/${id}/problems/import`, payload),
  removeProblem: (id: number, problemId: number) =>
    api.delete(`/admin/camps/${id}/problems/${problemId}`),
  addMember: (id: number, userId: number) =>
    api.post(`/admin/camps/${id}/members`, { user_id: userId }),
  removeMember: (id: number, userId: number) =>
    api.delete(`/admin/camps/${id}/members/${userId}`),
  export: (id: number, format: 'xlsx' | 'csv' | 'json') =>
    request<Blob>(`/admin/camps/${id}/export?format=${format}`, {}, 'blob'),
  exportUrl: (id: number, format: 'xlsx' | 'csv' | 'json') =>
    `/api/admin/camps/${id}/export?format=${format}`,
}

// --------------------------------------------------------------------------- //
// 管理员站内信
// --------------------------------------------------------------------------- //

export interface AdminNotification {
  id: number
  title: string
  body: string
  href: string
  occurrences: number
  revision: number
  created_at: string
  updated_at: string
  resolved_at: string | null
  read: boolean
}

export const notificationApi = {
  list: (page = 1, unreadOnly = false) => api.get<{
    items: AdminNotification[]; total: number; unread_count: number
  }>(`/admin/notifications?page=${page}&unread_only=${unreadOnly}`),
  unread: () => api.get<{ count: number }>('/admin/notifications/unread-count'),
  read: (id: number) => api.post(`/admin/notifications/${id}/read`),
  readAll: () => api.post('/admin/notifications/read-all'),
}

// --------------------------------------------------------------------------- //
// 文章（博客/公告）
// --------------------------------------------------------------------------- //

/** 列表里的一篇文章。 */
export interface PostSummary {
  id: number
  slug: string
  title: string
  excerpt: string
  sort_order: number
  is_popup: boolean
  published_at: string
  author_name: string
}

/** 详情含正文。 */
export interface PostDetail extends PostSummary {
  body: string
}

/** 当前该弹的公告。version 是内容指纹，改了就重新弹。 */
export interface PopupInfo {
  id: number
  slug: string
  title: string
  body: string
  version: number
}

export const postApi = {
  list: () => api.get<PostSummary[]>('/posts'),
  detail: (slug: string) => api.get<PostDetail>(`/posts/${encodeURIComponent(slug)}`),
  popup: () => api.get<PopupInfo | null>('/posts/popup'),
}

export interface AdminPostSummary extends PostSummary {
  published: boolean
  author_id: number
  popup_until: string | null
  created_at: string
  updated_at: string
}

export interface AdminPostDetail extends AdminPostSummary {
  body: string
}

export const postAdminApi = {
  list: () => api.get<AdminPostSummary[]>('/admin/posts'),
  detail: (id: number) => api.get<AdminPostDetail>(`/admin/posts/${id}`),
  create: (payload: { title: string; body: string; sort_order?: number; slug?: string }) =>
    api.post<AdminPostDetail>('/admin/posts', payload),
  update: (id: number, payload: { title?: string; body?: string; sort_order?: number }) =>
    api.put<AdminPostDetail>(`/admin/posts/${id}`, payload),
  remove: (id: number) => api.delete(`/admin/posts/${id}`),
  setPopup: (id: number, on: boolean, until?: string) =>
    api.post<AdminPostSummary>(`/admin/posts/${id}/popup`, { on, until }),
  setPublished: (id: number, published: boolean) =>
    api.post<AdminPostSummary>(`/admin/posts/${id}/publish`, { published }),
}

export interface WorkshopOverride {
  id: number
  label: string
  note: string
  start_at: string | null
  until: string | null
  updated_at: string
}

export const workshopApi = {
  override: () => api.get<WorkshopOverride | null>('/workshop/override'),
  schedule: () => api.get<WorkshopOverride[]>('/workshop/schedule'),
  adminSchedule: () => api.get<WorkshopOverride[]>('/admin/workshop/schedule'),
  setOverride: (payload: {
    label: string
    note?: string
    start_at?: string | null
    until?: string | null
  }) => api.put<WorkshopOverride>('/admin/workshop/override', payload),
  updateOverride: (
    id: number,
    payload: { label?: string; note?: string; start_at?: string | null; until?: string | null },
  ) => api.patch<WorkshopOverride>(`/admin/workshop/override/${id}`, payload),
  deleteOverride: (id: number) => api.delete(`/admin/workshop/override/${id}`),
  clearOverride: () => api.delete('/admin/workshop/override'),
}


// --------------------------------------------------------------------------- //
// Web Push
// --------------------------------------------------------------------------- //

export interface PushAnnounceResult {
  audience: number
  sent: number
  failed: number
  dead: number
}

export const pushApi = {
  vapidKey: () => api.get<{ key: string; configured: boolean }>('/push/vapid-key'),
  subscribe: (payload: { endpoint: string; p256dh: string; auth: string }) =>
    api.post('/push/subscribe', payload),
  unsubscribe: (endpoint: string) => api.post('/push/unsubscribe', { endpoint }),
  announce: (payload: {
    request_id: string
    title: string
    body?: string
    url?: string
    audience?: string
  }) => api.post<PushAnnounceResult>('/admin/push/announce', payload),
}

// --------------------------------------------------------------------------- //
// 线下报名
// --------------------------------------------------------------------------- //

export interface SignupFieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'phone' | 'email'
  required: boolean
  options: string[]
  hint: string
}

/** 多选字段的值是数组，其余是 string/boolean。 */
export type SignupAnswer = string | boolean | string[]

export interface SignupSummary {
  id: number
  name: string
  description: string
  open_at: string
  close_at: string | null
  status: 'upcoming' | 'open' | 'closed'
  capacity: number | null
  entry_count: number
  my_entry: boolean
  fields: SignupFieldDef[]
  /** 前置条件：这些平台的账号都要已验证。空 = 不设限制。 */
  required_platforms: Platform[]
  /** 前置条件：仅限这些入学年级。空 = 不限。 */
  required_years: number[]
}

export interface SignupEntry {
  id: number
  user_id: number
  display_name: string
  student_id: string
  class_label: string | null
  answers: Record<string, SignupAnswer>
  created_at: string
  updated_at: string
}

export const signupApi = {
  list: () => api.get<SignupSummary[]>('/signups'),
  detail: (id: number) => api.get<SignupSummary>(`/signups/${id}`),
  myEntry: (id: number) => api.get<{ answers: Record<string, SignupAnswer> }>(`/signups/${id}/entries/me`),
  submit: (id: number, answers: Record<string, SignupAnswer>) =>
    api.post<{ ok: boolean; message: string }>(`/signups/${id}/entries`, { answers }),
  withdraw: (id: number) => api.delete(`/signups/${id}/entries/me`),
}

export interface SignupPayload {
  name: string
  description?: string
  fields?: (Omit<SignupFieldDef, 'key'> & { key?: string })[]
  /** 前置条件：这些平台的账号都要绑定并验证。 */
  required_platforms?: Platform[]
  /** 前置条件：仅限这些入学年级。 */
  required_years?: number[]
  open_at: string
  close_at?: string | null
  capacity?: number | null
}

export const signupAdminApi = {
  list: () => api.get<SignupSummary[]>('/admin/signups'),
  create: (payload: SignupPayload) => api.post<SignupSummary>('/admin/signups', payload),
  update: (id: number, payload: Partial<SignupPayload>) =>
    api.put<SignupSummary>(`/admin/signups/${id}`, payload),
  remove: (id: number) => api.delete(`/admin/signups/${id}`),
  entries: (id: number) => api.get<SignupEntry[]>(`/admin/signups/${id}/entries`),
  removeEntry: (signupId: number, entryId: number) =>
    api.delete(`/admin/signups/${signupId}/entries/${entryId}`),
  exportUrl: (id: number) => `/api/admin/signups/${id}/export`,
}
