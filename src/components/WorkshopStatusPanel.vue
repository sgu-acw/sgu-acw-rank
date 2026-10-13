<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CalendarDays, Clock, RefreshCw } from 'lucide-vue-next'
import { workshopApi, type WorkshopOverride } from '../lib/api'
import {
  formatAge,
  overrideUntilText,
  stateDescription,
  stateDotClass,
  stateLabel,
  stateTextClass,
  useWorkshopStatus,
} from '../lib/workshopStatus'

const { data, state, override, refresh } = useWorkshopStatus()

const busy = ref(false)
const checkedAt = ref<Date | null>(null)

const label = computed(() =>
  state.value === 'special' ? (override.value?.label ?? '特殊状态') : stateLabel(state.value),
)
const description = computed(() => {
  if (state.value === 'special') {
    const note = override.value?.note ?? ''
    const until = overrideUntilText(override.value?.until)
    return [note, until].filter(Boolean).join(' · ')
  }
  return stateDescription(state.value)
})
const age = computed(() => formatAge(data.value?.age))
const devices = computed(() => data.value?.devices ?? [])

const lastSeenText = computed(() => {
  const ts = data.value?.last_seen
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
})

function dotClass() {
  if (state.value === 'special') return 'bg-violet-500'
  return stateDotClass(state.value)
}
function textClass() {
  if (state.value === 'special') return 'text-violet-600 dark:text-violet-400'
  return stateTextClass(state.value)
}

async function manualRefresh() {
  busy.value = true
  try {
    await refresh()
    checkedAt.value = new Date()
  } finally {
    busy.value = false
  }
}

// 状态时间表：只读，管理入口在 /admin/status。
const schedule = ref<WorkshopOverride[]>([])

function fmtRange(r: WorkshopOverride): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const s = r.start_at ? new Date(r.start_at) : null
  const e = r.until ? new Date(r.until) : null
  if (!s && !e) return '立即生效 · 直到手动关闭'
  if (s && e && s.toDateString() === e.toDateString())
    return `${s.getMonth() + 1}/${s.getDate()} ${hm(s)} – ${hm(e)}`
  const sp = s ? `${s.getMonth() + 1}/${s.getDate()} ${hm(s)}` : '现在'
  const ep = e ? `${e.getMonth() + 1}/${e.getDate()} ${hm(e)}` : '手动关闭'
  return `${sp} – ${ep}`
}

function isCurrent(r: WorkshopOverride): boolean {
  const now = Date.now()
  if (r.start_at && new Date(r.start_at).getTime() > now) return false
  if (r.until && new Date(r.until).getTime() <= now) return false
  return true
}

onMounted(async () => {
  try {
    schedule.value = await workshopApi.schedule()
  } catch {
    schedule.value = []
  }
})
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-4">
    <div class="rounded-lg border border-border/40 bg-card p-6">
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-3">
          <span class="relative flex h-3 w-3">
            <span
              v-if="state === 'open'"
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/50"
            />
            <span class="relative inline-flex h-3 w-3 rounded-full" :class="dotClass()" />
          </span>
          <div>
            <h1 class="text-2xl font-semibold tracking-tight" :class="textClass()">
              {{ label }}
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">{{ description }}</p>
          </div>
        </div>

        <button
          class="inline-flex shrink-0 items-center gap-2 rounded-md border border-border/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          :disabled="busy"
          @click="manualRefresh"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="busy ? 'animate-spin' : ''" />
          刷新
        </button>
      </div>

      <div
        v-if="state !== 'special'"
        class="mt-6 flex items-center gap-2 rounded-md border border-border/40 px-4 py-3"
      >
        <Clock class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="text-xs text-muted-foreground">最后心跳</span>
        <span class="ml-auto text-sm font-medium">{{ age }}</span>
        <span class="text-xs text-muted-foreground/60">{{ lastSeenText }}</span>
      </div>
      <p v-else class="mt-6 text-xs text-muted-foreground/70">
        特殊状态生效中，心跳检测暂时不显示。
      </p>

      <div v-if="devices.length" class="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span
          v-for="device in devices"
          :key="device.id"
          class="inline-flex items-center gap-1.5 rounded-md border border-border/40 px-2 py-1"
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="device.open ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
          />
          <span class="font-medium">{{ device.id }}</span>
          <span class="text-muted-foreground/60">{{ formatAge(device.age) }}</span>
        </span>
      </div>
    </div>

    <!-- 状态时间表：只读展示，管理在 /admin/status -->
    <div v-if="schedule.length" class="rounded-lg border border-border/40 bg-card p-6">
      <h2 class="flex items-center gap-1.5 text-sm font-semibold">
        <CalendarDays class="h-4 w-4" />状态时间表
      </h2>
      <div class="mt-4 divide-y divide-border/40">
        <div v-for="r in schedule" :key="r.id" class="flex items-start gap-3 py-3">
          <span
            class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            :class="isCurrent(r) ? 'bg-violet-500' : 'bg-muted-foreground/40'"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ r.label }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ fmtRange(r) }}
              <template v-if="isCurrent(r)"> · <span class="text-violet-600 dark:text-violet-400">生效中</span></template>
            </p>
            <p v-if="r.note" class="mt-0.5 text-xs text-muted-foreground/80">{{ r.note }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
