/**
 * 登录状态。整个站点共用一个响应式单例，页面之间跳转不必重新拉取。
 *
 * 后端把会话放在 HttpOnly Cookie 里，前端看不到令牌，只能通过 /auth/me
 * 问「我是谁」。因此刷新页面后需要重新确认一次，这就是 fetchMe 的用途。
 */

import { computed, readonly, ref } from 'vue'
import { authApi, type User } from './api'

const user = ref<User | null>(null)
const loading = ref(false)
const ready = ref(false)
let inflight: Promise<void> | null = null

export function useAuth() {
  /** 问后端当前是谁。并发调用会合并成一次请求。 */
  async function fetchMe(): Promise<void> {
    if (inflight) return inflight

    loading.value = true
    inflight = (async () => {
      try {
        // 用 /auth/session 而不是 /auth/me：前者未登录时也返回 200，避免每次
        // 页面加载都在控制台留下一个 401。
        const result = await authApi.session()
        user.value = result.user
      } catch {
        // 走到这里说明后端真的出问题了（网络断了或 5xx），按未登录处理。
        user.value = null
      } finally {
        loading.value = false
        ready.value = true
        inflight = null
      }
    })()

    return inflight
  }

  /** 只在第一次调用时真正请求，后续直接复用已有状态。 */
  async function ensureLoaded(): Promise<void> {
    if (ready.value || inflight) return inflight ?? undefined
    return fetchMe()
  }

  async function login(studentId: string, password: string): Promise<User> {
    const loggedIn = await authApi.login(studentId, password)
    user.value = loggedIn
    ready.value = true
    return loggedIn
  }

  async function register(payload: {
    invite_code: string
    student_id: string
    display_name: string
    password: string
  }): Promise<User> {
    const created = await authApi.register(payload)
    user.value = created
    ready.value = true
    return created
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } finally {
      // 即便请求失败也要清掉本地状态，否则界面会显示已登录但实际已失效。
      user.value = null
    }
  }

  return {
    user: readonly(user),
    loading: readonly(loading),
    ready: readonly(ready),
    isLoggedIn: computed(() => user.value !== null),
    isAdmin: computed(() => user.value?.role === 'root' || user.value?.role === 'admin'),
    fetchMe,
    ensureLoaded,
    login,
    register,
    logout,
  }
}
