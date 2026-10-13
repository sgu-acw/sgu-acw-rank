<script setup lang="ts">
/**
 * 集训列表。
 *
 * 所有集训都列出来——进行中的在前，还没开始的标出来，已结束的沉底。
 * 未登录也能看列表；详情页里才决定要不要给看题目。
 */
import { computed, onMounted, ref } from 'vue'
import { CalendarClock, ChevronRight, Loader2, Trophy, Users } from 'lucide-vue-next'
import { Card } from './ui/card'
import { ApiError, campApi, type CampSummary } from '../lib/api'
import { useAuth } from '../lib/auth'

const { ensureLoaded } = useAuth()

const camps = ref<CampSummary[]>([])
const loading = ref(true)
const error = ref('')

/** 进行中的在前，未开始的次之，已结束的沉底。同档按开始时间倒序。 */
const sorted = computed(() => {
  const bucket = (c: CampSummary) =>
    c.ended ? 2 : c.started ? 0 : 1
  return [...camps.value].sort((a, b) => {
    const d = bucket(a) - bucket(b)
    if (d !== 0) return d
    return Date.parse(b.start_at) - Date.parse(a.start_at)
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

onMounted(async () => {
  await ensureLoaded()
  try {
    camps.value = await campApi.list()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold">集训</h1>
    </div>

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <p v-else-if="error" class="py-10 text-sm text-destructive">{{ error }}</p>

    <div
      v-else-if="!sorted.length"
      class="flex flex-col items-center gap-2 py-16 text-muted-foreground"
    >
      <Trophy class="h-8 w-8 text-muted-foreground/40" />
      <p class="text-sm">还没有集训</p>
    </div>

    <Card v-for="camp in sorted" :key="camp.id" class="overflow-hidden">
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
