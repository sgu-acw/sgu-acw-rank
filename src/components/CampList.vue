<script setup lang="ts">
/**
 * 集训列表。
 *
 * 所有集训按状态优先排序：进行中 > 未开始 > 已结束，支持按状态标签快速切换。
 */
import { computed, onMounted, ref } from 'vue'
import { CalendarClock, ChevronRight, Trophy, Users } from 'lucide-vue-next'
import { Card } from './ui/card'
import { ApiError, campApi, type CampSummary } from '../lib/api'
import { useAuth } from '../lib/auth'

const { ensureLoaded } = useAuth()

const camps = ref<CampSummary[]>([])
const loading = ref(true)
const error = ref('')
const statusFilter = ref<'all' | 'ongoing' | 'upcoming' | 'ended'>('all')

const STATUS_TABS = [
  { key: 'all' as const, label: '全部' },
  { key: 'ongoing' as const, label: '进行中' },
  { key: 'upcoming' as const, label: '未开始' },
  { key: 'ended' as const, label: '已结束' },
]

const sorted = computed(() => {
  const bucket = (c: CampSummary) => (c.ended ? 2 : c.started ? 0 : 1)
  return [...camps.value].sort((a, b) => {
    const d = bucket(a) - bucket(b)
    if (d !== 0) return d
    return Date.parse(b.start_at) - Date.parse(a.start_at)
  })
})

const filteredCamps = computed(() => {
  if (statusFilter.value === 'all') return sorted.value
  return sorted.value.filter((c) => {
    if (statusFilter.value === 'ongoing') return c.started && !c.ended
    if (statusFilter.value === 'upcoming') return !c.started && !c.ended
    return c.ended
  })
})

function stateLabel(c: CampSummary): string {
  if (c.ended) return '已结束'
  if (!c.started) return '未开始'
  return '进行中'
}

function stateClass(c: CampSummary): string {
  if (c.ended) return 'text-muted-foreground/60'
  if (!c.started) return 'text-amber-600 dark:text-amber-500'
  return 'text-emerald-600 dark:text-emerald-500'
}

function formatRange(c: CampSummary): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${fmt(c.start_at)} — ${fmt(c.end_at)}`
}

function go(path: string) {
  import('astro:transitions/client').then(({ navigate }) => navigate(path))
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    camps.value = await campApi.list()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void Promise.all([ensureLoaded(), load()])
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-lg font-semibold tracking-tight">集训</h1>
      <div
        v-if="!loading && sorted.length > 0"
        class="inline-flex rounded-lg border border-border/50 bg-muted/40 p-0.5 text-xs"
        role="tablist"
        aria-label="按状态筛选集训"
      >
        <button
          v-for="tab in STATUS_TABS"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="statusFilter === tab.key"
          class="rounded-md px-2.5 py-1 font-medium transition-colors"
          :class="
            statusFilter === tab.key
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="statusFilter = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="space-y-2.5">
      <div v-for="i in 3" :key="i" class="h-18 animate-pulse rounded-xl border border-border/40 bg-card/60" />
    </div>

    <p v-else-if="error" class="py-10 text-sm text-destructive">{{ error }}</p>

    <div
      v-else-if="!sorted.length"
      class="flex flex-col items-center gap-2 py-16 text-muted-foreground"
    >
      <Trophy class="h-8 w-8 text-muted-foreground/40" />
      <p class="text-sm">还没有集训</p>
    </div>

    <div
      v-else-if="!filteredCamps.length"
      class="rounded-lg border border-border/50 bg-card py-10 text-center text-sm text-muted-foreground"
    >
      当前筛选下没有集训
    </div>

    <Card v-for="camp in filteredCamps" v-else :key="camp.id" class="overflow-hidden">
      <button
        type="button"
        class="surface-action flex w-full items-center gap-3 px-4 py-3 text-left"
        @click="go(`/camp?id=${camp.id}`)"
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="text-sm font-medium">{{ camp.name }}</span>
            <span class="text-xs font-medium" :class="stateClass(camp)">
              {{ stateLabel(camp) }}
            </span>
          </div>
          <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span class="flex items-center gap-1">
              <CalendarClock class="h-3 w-3" />
              {{ formatRange(camp) }}
            </span>
            <span class="flex items-center gap-1">
              <Users class="h-3 w-3" />
              {{ camp.registration_count }} 人
            </span>
            <span>{{ camp.problem_count }} 题</span>
          </div>
        </div>
        <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground/50" />
      </button>
    </Card>
  </div>
</template>
