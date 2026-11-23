<script setup lang="ts">
/**
 * 首页的个人数据面板。
 *
 * 所有核心数字一次请求拿齐（/practice/dashboard），同时以非阻塞方式并行拉取
 * 近期进行中的集训和开放中的线下赛报名，方便成员一眼看到待办活动。
 */
import { computed, onMounted, ref } from 'vue'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ClipboardList,
  Flame,
  ListChecks,
  LogIn,
  RefreshCw,
  Trophy,
} from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import {
  ApiError,
  campApi,
  practiceApi,
  signupApi,
  type CampSummary,
  type Dashboard,
  type DashboardAccount,
  type SignupSummary,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatEnrollYear } from '../lib/format'
import WorkshopStatusCard from './WorkshopStatusCard.vue'
import DailyProblem from './DailyProblem.vue'

const { user, ensureLoaded } = useAuth()

const loading = ref(true)
const error = ref('')
const data = ref<Dashboard | null>(null)
const activeCamps = ref<CampSummary[]>([])
const openSignups = ref<SignupSummary[]>([])
const activeDayIndex = ref<number | null>(null)

const maxDaily = computed(() => {
  if (!data.value) return 1
  return Math.max(1, ...data.value.days.map((d) => d.count))
})

/** 最近 14 天画成柱状图，30 天在小屏上太密。 */
const recentDays = computed(() => data.value?.days.slice(-14) ?? [])

const highlightedDay = computed(() => {
  if (!recentDays.value.length) return null
  if (activeDayIndex.value !== null && recentDays.value[activeDayIndex.value]) {
    return recentDays.value[activeDayIndex.value]
  }
  return recentDays.value[recentDays.value.length - 1]
})

function accountWarning(account: DashboardAccount): string | null {
  if (!account.verified) return '待验证'
  if (account.sync_flag === 'privacy') return '隐私保护'
  if (account.sync_flag === 'unverified') return '未实名'
  if ((account.consecutive_failures ?? 0) >= 3) return '同步异常'
  return null
}

function go(path: string) {
  import('astro:transitions/client').then(({ navigate }) => navigate(path))
}

async function load() {
  loading.value = true
  error.value = ''

  const tasks = [
    user.value ? practiceApi.dashboard() : Promise.resolve(null),
    campApi.list(),
    signupApi.list(),
  ] as const

  const [dashRes, campsRes, signupsRes] = await Promise.allSettled(tasks)

  if (dashRes.status === 'fulfilled') {
    data.value = dashRes.value
  } else {
    const err = dashRes.reason
    if (err instanceof ApiError && err.status === 401) {
      data.value = null
    } else {
      error.value = err instanceof ApiError ? err.message : '加载失败'
    }
  }

  if (campsRes.status === 'fulfilled') {
    activeCamps.value = campsRes.value.filter((c) => !c.ended).slice(0, 3)
  }
  if (signupsRes.status === 'fulfilled') {
    openSignups.value = signupsRes.value.filter((s) => s.status === 'open').slice(0, 3)
  }

  loading.value = false
}

onMounted(async () => {
  await ensureLoaded()
  await load()
})
</script>

<template>
  <div class="space-y-4">
    <!-- 结构化骨架屏，减少首屏跳动 -->
    <div v-if="loading" class="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
      <div class="space-y-4">
        <div class="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div class="h-44 animate-pulse rounded-xl border border-border/40 bg-card/60" />
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div v-for="i in 4" :key="i" class="h-20 animate-pulse rounded-xl border border-border/40 bg-card/60" />
        </div>
        <div class="h-36 animate-pulse rounded-xl border border-border/40 bg-card/60" />
      </div>
      <div class="space-y-4">
        <div class="h-36 animate-pulse rounded-xl border border-border/40 bg-card/60" />
        <div class="h-44 animate-pulse rounded-xl border border-border/40 bg-card/60" />
      </div>
    </div>

    <!-- 未登录：每日一题 + 工作坊状态 + 快捷入口 + 登录引导 -->
    <template v-else-if="!user">
      <DailyProblem />
      <WorkshopStatusCard />

      <div class="grid gap-3 sm:grid-cols-3">
        <a
          href="/problems"
          class="group rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border hover:bg-accent/30"
        >
          <div class="flex items-center justify-between">
            <ListChecks class="h-4 w-4 text-primary" />
            <ArrowRight class="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <p class="mt-2.5 text-sm font-medium">专题题单</p>
          <p class="mt-0.5 text-xs text-muted-foreground">按专题整理训练题目与完成进度</p>
        </a>
        <a
          href="/practice"
          class="group rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border hover:bg-accent/30"
        >
          <div class="flex items-center justify-between">
            <BarChart3 class="h-4 w-4 text-primary" />
            <ArrowRight class="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <p class="mt-2.5 text-sm font-medium">练习榜单</p>
          <p class="mt-0.5 text-xs text-muted-foreground">查看刷题趋势与多平台 Rating 排行</p>
        </a>
        <a
          href="/signups"
          class="group rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border hover:bg-accent/30"
        >
          <div class="flex items-center justify-between">
            <ClipboardList class="h-4 w-4 text-primary" />
            <ArrowRight class="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <p class="mt-2.5 text-sm font-medium">线下赛报名</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ openSignups.length > 0 ? `当前有 ${openSignups.length} 项报名开放中` : '查看比赛报名与队伍安排' }}
          </p>
        </a>
      </div>

      <Card class="py-8 text-center">
        <CardContent class="space-y-3">
          <p class="text-sm text-muted-foreground">登录后可追踪每日刷题进度、参与集训与管理 OJ 账号绑定</p>
          <div class="flex flex-wrap items-center justify-center gap-2">
            <Button @click="go('/login')">
              <LogIn class="mr-2 h-4 w-4" />
              登录工作坊账号
            </Button>
            <Button variant="outline" @click="go('/register')">
              使用邀请码注册
            </Button>
          </div>
        </CardContent>
      </Card>
    </template>

    <template v-else>
      <Alert v-if="error" variant="destructive" class="flex flex-wrap items-center justify-between gap-2">
        <span class="flex items-center gap-2 text-sm">
          <AlertCircle class="h-4 w-4 shrink-0" />
          {{ error }}
        </span>
        <Button size="sm" variant="outline" @click="load">
          <RefreshCw class="mr-1.5 h-3.5 w-3.5" />
          重试
        </Button>
      </Alert>

      <div v-if="data" class="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
        <section class="min-w-0 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h1 class="text-xl font-semibold tracking-tight">
              {{ user.display_name }}
              <span v-if="formatEnrollYear(user.enroll_year)" class="ml-1.5 text-sm font-normal text-muted-foreground">
                {{ formatEnrollYear(user.enroll_year) }}
              </span>
            </h1>
            <span
              v-if="(data.practice_streak ?? 0) > 0"
              class="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
            >
              <Flame class="h-3.5 w-3.5" />
              连续刷题 {{ data.practice_streak }} 天
            </span>
          </div>

          <DailyProblem compact />

          <!-- 今日/近况汇总 -->
          <Card>
            <CardContent class="grid grid-cols-2 divide-y divide-border/40 p-0 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <div
                v-for="stat in [
                  { label: '今日完成', value: data.today },
                  { label: '最近 7 天', value: data.week },
                  { label: '最近 30 天', value: data.total },
                ]"
                :key="stat.label"
                class="px-5 py-4"
              >
                <p class="text-xs text-muted-foreground">{{ stat.label }}</p>
                <p class="mt-1.5 font-mono text-2xl font-semibold tabular-nums">{{ stat.value }}</p>
              </div>

              <div class="px-5 py-4">
                <p class="text-xs text-muted-foreground">7 天排名</p>
                <p class="mt-1.5 font-mono text-2xl font-semibold tabular-nums">
                  <template v-if="data.practice_rank">
                    {{ data.practice_rank }}
                    <span class="text-sm font-normal text-muted-foreground">/ {{ data.practice_total }}</span>
                  </template>
                  <span v-else class="text-base font-normal text-muted-foreground">未上榜</span>
                </p>
              </div>
            </CardContent>
          </Card>

          <!-- 趋势：悬停或点击柱子可直接读具体日期和题数（兼容触屏） -->
          <Card>
            <CardHeader class="pb-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <CardTitle class="flex items-center gap-2 text-sm font-medium">
                  <BarChart3 class="h-4 w-4 text-muted-foreground" />
                  最近 14 天
                  <span v-if="highlightedDay" class="font-mono text-xs font-normal text-muted-foreground">
                    · {{ highlightedDay.date.slice(5) }} {{ highlightedDay.count }} 题
                  </span>
                </CardTitle>
                <a href="/practice" class="text-xs text-muted-foreground transition-colors hover:text-primary">
                  看完整榜单 →
                </a>
              </div>
            </CardHeader>
            <CardContent>
              <div class="flex items-end gap-1" style="height: 72px">
                <button
                  v-for="(day, idx) in recentDays"
                  :key="day.date"
                  type="button"
                  :aria-label="`${day.date} 完成 ${day.count} 题`"
                  class="flex h-full flex-1 items-end rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  @mouseenter="activeDayIndex = idx"
                  @focus="activeDayIndex = idx"
                  @click="activeDayIndex = idx"
                >
                  <span
                    class="w-full rounded-sm transition-colors"
                    :class="
                      activeDayIndex === idx
                        ? 'bg-primary'
                        : day.count > 0
                          ? 'bg-primary/70 hover:bg-primary'
                          : 'bg-muted hover:bg-muted-foreground/30'
                    "
                    :style="{
                      height: day.count > 0 ? `${Math.max(6, (day.count / maxDaily) * 68)}px` : '3px',
                    }"
                  />
                </button>
              </div>
              <div v-if="recentDays.length" class="mt-1.5 flex justify-between text-[10px] text-muted-foreground/60">
                <span>{{ recentDays[0].date.slice(5) }}</span>
                <span>{{ recentDays[recentDays.length - 1].date.slice(5) }}</span>
              </div>
            </CardContent>
          </Card>
        </section>

        <aside class="min-w-0 space-y-4">
          <WorkshopStatusCard />

          <!-- 进行中的集训与开放报名 -->
          <Card v-if="activeCamps.length > 0 || openSignups.length > 0">
            <CardHeader class="pb-3">
              <CardTitle class="text-sm font-medium">近期活动</CardTitle>
            </CardHeader>
            <CardContent class="space-y-2 pt-0">
              <a
                v-for="camp in activeCamps"
                :key="`camp-${camp.id}`"
                :href="`/camp?id=${camp.id}`"
                class="flex items-center gap-2.5 rounded-lg border border-border/50 px-3 py-2 text-sm transition-colors hover:bg-accent/50"
              >
                <Trophy class="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium">{{ camp.name }}</p>
                  <p class="text-[11px] text-muted-foreground">
                    {{ camp.started ? '集训进行中' : '即将开始' }} · {{ camp.problem_count }} 题
                  </p>
                </div>
              </a>
              <a
                v-for="s in openSignups"
                :key="`signup-${s.id}`"
                :href="`/signup?id=${s.id}`"
                class="flex items-center gap-2.5 rounded-lg border border-border/50 px-3 py-2 text-sm transition-colors hover:bg-accent/50"
              >
                <ClipboardList class="h-4 w-4 shrink-0 text-primary" />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium">{{ s.name }}</p>
                  <p class="text-[11px] text-muted-foreground">
                    {{ s.my_entry ? '已报名' : '报名开放中' }} · {{ s.entry_count }} 人
                  </p>
                </div>
              </a>
            </CardContent>
          </Card>

          <!-- 平台账号状态 -->
          <Card>
            <CardHeader class="pb-3">
              <div class="flex items-center justify-between">
                <CardTitle class="text-sm font-medium">平台账号</CardTitle>
                <a href="/me" class="text-xs text-muted-foreground transition-colors hover:text-primary">
                  管理 →
                </a>
              </div>
            </CardHeader>
            <CardContent class="p-0">
              <div v-if="!data.accounts.length" class="space-y-2.5 p-4 text-sm text-muted-foreground">
                <p>还没有绑定 OJ 账号，绑定后即可自动统计刷题进度。</p>
                <Button size="sm" variant="outline" @click="go('/me')">去绑定账号</Button>
              </div>
              <div v-else class="divide-y divide-border/40">
                <div
                  v-for="account in data.accounts"
                  :key="`${account.platform}-${account.identifier}`"
                  class="flex flex-wrap items-center gap-2 px-4 py-2.5"
                >
                  <span class="text-sm font-medium">{{ account.label }}</span>
                  <span class="font-mono text-xs text-muted-foreground">{{ account.identifier }}</span>
                  <span
                    v-if="account.rating"
                    class="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {{ account.rating }}
                    <span v-if="account.max_rating && account.max_rating !== account.rating" class="text-muted-foreground">
                      / {{ account.max_rating }}
                    </span>
                  </span>
                  <a
                    v-if="accountWarning(account)"
                    href="/me"
                    :title="account.last_error || accountWarning(account) || undefined"
                    class="ml-auto inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                  >
                    <AlertTriangle class="h-3 w-3" />
                    {{ accountWarning(account) }}
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </template>
  </div>
</template>
