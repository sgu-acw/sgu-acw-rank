<script setup lang="ts">
/**
 * 每日练习量排行。
 *
 * 数据由后端定时同步平台得来，页面只读。一个人在同一平台可能绑了主号和
 * 小号，后端已经把同一天的多个账号合并过，这里显示的就是合并后的数字。
 */
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, Loader2, LogIn, RefreshCw } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import {
  ApiError,
  PLATFORM_META,
  practiceApi,
  type Platform,
  type PracticeRank,
  type SyncStatus,
} from '../lib/api'
import { useAuth } from '../lib/auth'

const { ensureLoaded } = useAuth()

const loading = ref(true)
const error = ref('')
const data = ref<PracticeRank | null>(null)
const status = ref<SyncStatus | null>(null)
// 未登录与加载失败是两回事，分开呈现：前者引导登录，后者提示重试。
const needsLogin = ref(false)

const days = ref(1)
const platform = ref<Platform | ''>('')

const DAY_OPTIONS = [
  { value: 1, label: '今日' },
  { value: 7, label: '最近 7 天' },
  { value: 30, label: '最近 30 天' },
  { value: 90, label: '最近 90 天' },
]

const PLATFORM_OPTIONS = [
  { value: '' as const, label: '全部平台' },
  ...(Object.keys(PLATFORM_META) as Platform[]).map((key) => ({
    value: key,
    label: PLATFORM_META[key].label,
  })),
]

/** 把总数画成一条紧凑的柱状图，让人一眼看出谁最近在动。 */
function bars(entry: PracticeRank['entries'][number]): number[] {
  return entry.days.map((d) => d.count)
}

const maxDaily = computed(() => {
  if (!data.value) return 1
  let max = 0
  for (const entry of data.value.entries) {
    for (const day of entry.days) max = Math.max(max, day.count)
  }
  return Math.max(1, max)
})

function formatTime(epoch: number): string {
  const d = new Date(epoch * 1000)
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function load() {
  loading.value = true
  error.value = ''
  needsLogin.value = false
  try {
    const [rank, sync] = await Promise.all([
      practiceApi.rank({ days: days.value, platform: platform.value || null }),
      practiceApi.status(),
    ])
    data.value = rank
    status.value = sync
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      needsLogin.value = true
    } else {
      error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
    }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await ensureLoaded()
  await load()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold tracking-tight">每日练习量</h1>
        <p class="mt-0.5 text-xs text-muted-foreground">
          按过题数统计。同一平台的主号与小号已合并。一天从凌晨 4 点算起。
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="loading" @click="load">
        <RefreshCw class="mr-1.5 h-3.5 w-3.5" :class="loading && 'animate-spin'" />
        刷新
      </Button>
    </div>

    <div class="flex flex-wrap gap-2">
      <div class="flex gap-1 rounded-md border border-border/40 p-0.5">
        <button
          v-for="option in DAY_OPTIONS"
          :key="option.value"
          class="rounded px-3 py-1.5 text-xs font-medium transition-colors"
          :class="
            days === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted/60'
          "
          @click="((days = option.value), load())"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="flex flex-wrap gap-1 rounded-md border border-border/40 p-0.5">
        <button
          v-for="option in PLATFORM_OPTIONS"
          :key="option.value"
          class="rounded px-3 py-1.5 text-xs font-medium transition-colors"
          :class="
            platform === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted/60'
          "
          @click="((platform = option.value), load())"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <Card v-if="needsLogin">
      <CardContent class="space-y-3 py-8 text-center">
        <p class="text-sm text-muted-foreground">练习榜包含成员姓名与做题量，需要登录后查看。</p>
        <Button @click="() => (window.location.href = '/login')">
          <LogIn class="mr-2 h-4 w-4" />
          去登录
        </Button>
      </CardContent>
    </Card>

    <Card v-else>
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <CardTitle class="text-sm font-medium">
            <span v-if="data">{{ data.dates[0] }} ~ {{ data.dates[data.dates.length - 1] }}</span>
            <span v-else>加载中</span>
          </CardTitle>
          <span v-if="data" class="text-xs text-muted-foreground">
            数据更新于 {{ formatTime(data.generated_at) }}
          </span>
        </div>
      </CardHeader>

      <CardContent class="p-0">
        <div v-if="loading" class="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 class="h-4 w-4 animate-spin" />
          正在读取…
        </div>

        <div v-else-if="!data?.entries.length" class="p-6 text-center text-sm text-muted-foreground">
          这段时间还没有记录。榜单由后台定时同步，成员绑好账号后就会出现。
        </div>

        <div v-else class="divide-y divide-border/40">
          <div
            v-for="entry in data.entries"
            :key="entry.user_id"
            class="flex items-center gap-3 px-4 py-3"
          >
            <span
              class="w-6 shrink-0 text-center font-mono text-xs"
              :class="entry.rank <= 3 ? 'font-semibold text-foreground' : 'text-muted-foreground'"
            >
              {{ entry.rank }}
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <span class="truncate text-sm font-medium">{{ entry.display_name }}</span>
                <span class="shrink-0 text-[11px] text-muted-foreground">
                  {{ entry.enroll_year }} 级
                </span>
              </div>

              <!-- 每日柱状图。宽度按当天最大值归一，空白天也占位以保持对齐。 -->
              <div class="mt-1.5 flex items-end gap-0.5" style="height: 18px">
                <span
                  v-for="day in entry.days"
                  :key="day.date"
                  class="w-full rounded-sm"
                  :class="day.count > 0 ? 'bg-primary/70' : 'bg-muted'"
                  :style="{
                    height: day.count > 0 ? `${Math.max(3, (day.count / maxDaily) * 18)}px` : '2px',
                  }"
                  :title="`${day.date}：${day.count} 题`"
                />
              </div>
            </div>

            <div class="shrink-0 text-right">
              <span class="font-mono text-sm font-semibold">{{ entry.total }}</span>
              <span class="ml-0.5 text-xs text-muted-foreground">题</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <p v-if="status?.has_run" class="text-xs text-muted-foreground">
      上次同步：{{ status.account_count }} 个账号，成功 {{ status.ok_count }}
      <span v-if="status.error_count">，失败 {{ status.error_count }}</span>
      <span v-if="status.errors.length" class="block pt-1 text-destructive/80">
        {{ status.errors.join('；') }}
      </span>
    </p>
  </div>
</template>
