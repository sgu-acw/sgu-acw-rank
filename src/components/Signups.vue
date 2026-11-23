<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, CalendarDays, CheckCircle2, ChevronRight, Users } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Card, CardContent } from './ui/card'
import AccessGate from './AccessGate.vue'
import { ApiError, signupApi, type SignupSummary } from '../lib/api'
import { useAuth } from '../lib/auth'

const { user, isCampusMember, ready, ensureLoaded } = useAuth()

const signups = ref<SignupSummary[]>([])
const loading = ref(true)
const error = ref('')
const statusFilter = ref<'all' | 'open' | 'upcoming' | 'closed'>('all')

const STATUS_TABS = [
  { key: 'all' as const, label: '全部' },
  { key: 'open' as const, label: '报名中' },
  { key: 'upcoming' as const, label: '未开始' },
  { key: 'closed' as const, label: '已截止' },
]

const filteredSignups = computed(() => {
  if (statusFilter.value === 'all') return signups.value
  return signups.value.filter((s) => s.status === statusFilter.value)
})

function go(id: number) {
  import('astro:transitions/client').then(({ navigate }) => navigate(`/signup?id=${id}`))
}

function isFull(s: SignupSummary): boolean {
  return s.capacity !== null && s.entry_count >= s.capacity
}

function statusLabel(s: SignupSummary): string {
  if (s.my_entry) return '已报名'
  if (s.status === 'open') return isFull(s) ? '名额已满' : '报名中'
  if (s.status === 'upcoming') return '未开始'
  return '已截止'
}

function statusClass(s: SignupSummary): string {
  if (s.my_entry) return 'text-emerald-600 dark:text-emerald-500'
  if (s.status === 'open') return isFull(s) ? 'text-amber-600 dark:text-amber-500' : 'text-primary'
  if (s.status === 'upcoming') return 'text-amber-600 dark:text-amber-500'
  return 'text-muted-foreground'
}

function fmtRange(s: SignupSummary): string {
  const f = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const open = `${f(s.open_at)} 开放`
  const close = s.close_at ? ` · ${f(s.close_at)} 截止` : ''
  return open + close
}

function fillPercent(s: SignupSummary): number {
  if (!s.capacity || s.capacity <= 0) return 0
  return Math.min(100, Math.round((s.entry_count / s.capacity) * 100))
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    signups.value = await signupApi.list()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '读取失败'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await ensureLoaded()
  if (!isCampusMember.value) {
    loading.value = false
    return
  }
  await load()
})
</script>

<template>
  <AccessGate
    v-if="ready && !isCampusMember"
    :mode="user ? 'campus' : 'login'"
    title="线下赛报名仅对校内成员开放"
  />

  <div v-else class="page-shell">
    <div class="page-header">
      <div>
        <h1 class="page-title">线下赛报名</h1>
        <p class="page-subtitle">校内选拔赛与线下活动报名入口</p>
      </div>
      <div
        v-if="!loading && signups.length > 0"
        class="segment-tabs"
        role="tablist"
        aria-label="按状态筛选报名"
      >
        <button
          v-for="tab in STATUS_TABS"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="statusFilter === tab.key"
          class="segment-tab"
          @click="statusFilter = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <div v-if="loading" class="space-y-2.5">
      <div v-for="i in 3" :key="i" class="h-20 animate-pulse rounded-xl border border-border/40 bg-card/60" />
    </div>

    <Card v-else-if="!signups.length">
      <CardContent class="py-10 text-center text-sm text-muted-foreground">
        暂时没有报名活动
      </CardContent>
    </Card>

    <Card v-else-if="!filteredSignups.length">
      <CardContent class="py-10 text-center text-sm text-muted-foreground">
        当前筛选下没有报名活动
      </CardContent>
    </Card>

    <Card v-for="s in filteredSignups" v-else :key="s.id" class="overflow-hidden">
      <button
        type="button"
        class="surface-action flex w-full items-center gap-3 px-4 py-3.5 text-left"
        @click="go(s.id)"
      >
        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span class="text-sm font-medium">{{ s.name }}</span>
            <span class="inline-flex items-center gap-1 text-xs font-medium" :class="statusClass(s)">
              <CheckCircle2 v-if="s.my_entry" class="h-3.5 w-3.5" />
              {{ statusLabel(s) }}
            </span>
          </div>
          <p class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span class="inline-flex items-center gap-1"><CalendarDays class="h-3 w-3" />{{ fmtRange(s) }}</span>
            <span class="inline-flex items-center gap-1">
              <Users class="h-3 w-3" />{{ s.entry_count }}{{ s.capacity ? ` / ${s.capacity}` : '' }} 人
            </span>
          </p>
          <div v-if="s.capacity && s.capacity > 0" class="flex items-center gap-2 pt-0.5">
            <div class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full transition-[width] duration-300"
                :class="isFull(s) ? 'bg-amber-500' : 'bg-primary'"
                :style="{ width: `${fillPercent(s)}%` }"
              />
            </div>
            <span class="font-mono text-[10px] text-muted-foreground">{{ fillPercent(s) }}%</span>
          </div>
        </div>
        <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground/60" />
      </button>
    </Card>
  </div>
</template>
