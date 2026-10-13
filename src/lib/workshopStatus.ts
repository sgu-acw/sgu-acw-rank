/**
 * Workshop open/closed status.
 *
 * The workshop counts as open while the Raspberry Pi in the room keeps
 * sending SSH heartbeats. The backend only reports the age of the newest
 * heartbeat; the browser never talks to the Pi.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { workshopApi, type WorkshopOverride } from './api'

export const WORKSHOP_STATUS_API: string =
  import.meta.env.PUBLIC_WORKSHOP_STATUS_API ?? 'https://sgu-acw.hsn8086.com'

export interface WorkshopDevice {
  id: string
  last_seen: number
  age: number
  open: boolean
}

export interface WorkshopStatus {
  open: boolean
  last_seen: number | null
  age: number | null
  ttl: number
  now: number
  devices?: WorkshopDevice[]
}

export type WorkshopState = 'loading' | 'open' | 'closed' | 'error' | 'special'

const POLL_MS = 20_000

export function useWorkshopStatus() {
  const data = ref<WorkshopStatus | null>(null)
  const override = ref<WorkshopOverride | null>(null)
  const state = ref<WorkshopState>('loading')
  let timer: number | undefined

  async function refresh() {
    // 手动覆盖优先：有生效中的特殊状态就显示它，心跳只是背景。
    // 覆盖接口挂了不当成状态服务挂了——那不是一回事。
    try {
      override.value = await workshopApi.override()
    } catch {
      override.value = null
    }
    if (override.value) {
      state.value = 'special'
      data.value = null
      return
    }
    try {
      const res = await fetch(`${WORKSHOP_STATUS_API}/status`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as WorkshopStatus
      data.value = body
      state.value = body.open ? 'open' : 'closed'
    } catch {
      state.value = 'error'
    }
  }

  function onVisibility() {
    if (!document.hidden) refresh()
  }

  onMounted(() => {
    refresh()
    timer = window.setInterval(refresh, POLL_MS)
    document.addEventListener('visibilitychange', onVisibility)
  })

  onUnmounted(() => {
    if (timer !== undefined) window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return { data, state, override, refresh }
}

export function stateLabel(state: WorkshopState): string {
  switch (state) {
    case 'open':
      return '开门中'
    case 'closed':
      return '没开门'
    case 'error':
      return '状态未知'
    default:
      return '检测中'
  }
}

export function stateDescription(state: WorkshopState): string {
  //
  // 开门和关门不再给描述。状态词已经把结论说完了，
  // 「工作坊里的设备不在线，现在关着」只是把「没开门」换个说法再说一遍。
  // 只有出错时才有需要补充的信息：是服务联系不上，而不是真的关门。
  //
  switch (state) {
    case 'error':
      return '联系不上状态服务'
    default:
      return ''
  }
}

export function overrideUntilText(until: string | null | undefined): string {
  if (!until) return ''
  const d = new Date(until)
  return `到 ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function stateDotClass(state: WorkshopState): string {
  switch (state) {
    case 'open':
      return 'bg-emerald-500'
    case 'closed':
      return 'bg-muted-foreground/50'
    case 'error':
      return 'bg-amber-500'
    default:
      return 'bg-muted-foreground/30'
  }
}

export function stateTextClass(state: WorkshopState): string {
  switch (state) {
    case 'open':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'error':
      return 'text-amber-600 dark:text-amber-400'
    default:
      return 'text-foreground'
  }
}

export function formatAge(age: number | null | undefined): string {
  if (age === null || age === undefined) return '还没有收到过心跳'
  if (age < 10) return '刚刚还在'
  if (age < 60) return `${age} 秒前还在`
  const minutes = Math.floor(age / 60)
  if (minutes < 60) return `${minutes} 分钟前还在`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前还在`
  return `${Math.floor(hours / 24)} 天前还在`
}
