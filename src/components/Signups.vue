<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { AlertCircle, CalendarDays, CheckCircle2, ChevronRight, Loader2, Users } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Card, CardContent } from './ui/card'
import { ApiError, signupApi, type SignupSummary } from '../lib/api'
import { useAuth } from '../lib/auth'

const { user, ensureLoaded } = useAuth()

const signups = ref<SignupSummary[]>([])
const loading = ref(true)
const error = ref('')

function go(id: number) {
  import('astro:transitions/client').then(({ navigate }) => navigate(`/signup?id=${id}`))
}

function statusLabel(s: SignupSummary): string {
  if (s.my_entry) return '已报名'
  if (s.status === 'open') return '报名中'
  if (s.status === 'upcoming') return '未开始'
  return '已截止'
}
function statusClass(s: SignupSummary): string {
  if (s.my_entry) return 'text-emerald-600 dark:text-emerald-500'
  if (s.status === 'open') return 'text-primary'
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

onMounted(async () => {
  await ensureLoaded()
  try {
    signups.value = await signupApi.list()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '读取失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold">线下赛报名</h1>
      <a v-if="user && user.role !== 'member'" href="/admin/signups" class="text-sm text-muted-foreground hover:text-foreground">管理 →</a>
    </div>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />正在读取…
    </div>

    <Card v-else-if="!signups.length">
      <CardContent class="py-10 text-center text-sm text-muted-foreground">
        暂时没有报名活动
      </CardContent>
    </Card>

    <Card v-for="s in signups" v-else :key="s.id" class="overflow-hidden">
      <button
        type="button"
        class="surface-action flex w-full items-center gap-3 px-4 py-3 text-left"
        @click="go(s.id)"
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="text-sm font-medium">{{ s.name }}</span>
            <span class="flex items-center gap-1 text-xs font-medium" :class="statusClass(s)">
              <CheckCircle2 v-if="s.my_entry" class="h-3.5 w-3.5" />
              {{ statusLabel(s) }}
            </span>
          </div>
          <p class="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span class="inline-flex items-center gap-1"><CalendarDays class="h-3 w-3" />{{ fmtRange(s) }}</span>
            <span class="inline-flex items-center gap-1">
              <Users class="h-3 w-3" />{{ s.entry_count }}{{ s.capacity ? `/${s.capacity}` : '' }} 人
            </span>
          </p>
        </div>
        <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground/60" />
      </button>
    </Card>
  </div>
</template>
