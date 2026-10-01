<script setup lang="ts">
/**
 * 榜单。两个维度：
 *
 * * **练习量**：按天统计的过题数，同平台的主号小号按人合并。
 * * **Rating**：平台上的等级分，以账号为单位——主号和小号各有各的 rating，
 *   合并没有意义。
 *
 * 数据由后端定时同步平台得来，页面只读。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { AlertCircle, ChevronDown, Filter, Loader2, LogIn, RefreshCw, X } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import MemberDialog from './MemberDialog.vue'
import {
  ApiError,
  PLATFORM_META,
  practiceApi,
  type Platform,
  type PracticeEntry,
  type PracticeRank,
  type RatingBoard,
  type SyncStatus,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatEnrollYear } from '../lib/format'

const { ensureLoaded } = useAuth()

type Dimension = 'practice' | 'rating'

const dimension = ref<Dimension>('practice')

const loading = ref(true)
const error = ref('')
const data = ref<PracticeRank | null>(null)
const rating = ref<RatingBoard | null>(null)
const status = ref<SyncStatus | null>(null)
const needsLogin = ref(false)

const days = ref(1)
const platform = ref<Platform | ''>('')
const ratingPlatform = ref<Platform>('codeforces')

// 高级筛选。平时收起来——大多数时候只想看「今日谁在刷」，不想先面对一堆
// 下拉框。
const showFilters = ref(false)
const college = ref('')
const enrollYear = ref<number | null>(null)
const search = ref('')

// 点名字弹出的资料窗口。
const dialogEntry = ref<PracticeEntry | null>(null)

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

const RATING_PLATFORMS = (Object.keys(PLATFORM_META) as Platform[]).map((key) => ({
  value: key,
  label: PLATFORM_META[key].label,
}))

/** 有任何筛选条件生效时为真，用于决定要不要显示「清除」。 */
const hasFilters = computed(() => !!college.value || enrollYear.value !== null || !!search.value)

const maxDaily = computed(() => {
  if (!data.value) return 1
  let max = 0
  for (const entry of data.value.entries) {
    for (const day of entry.days) max = Math.max(max, day.count)
  }
  return Math.max(1, max)
})

/** 把每日数量画成柱子的高度。0 也留 2px，这样空白日不会看起来缺了一块。 */
function barHeight(count: number): string {
  if (count <= 0) return '2px'
  return `${Math.max(4, (count / maxDaily.value) * 40)}px`
}

async function load() {
  loading.value = true
  error.value = ''
  needsLogin.value = false
  try {
    if (dimension.value === 'rating') {
      rating.value = await practiceApi.rating(ratingPlatform.value)
    } else {
      const [rank, sync] = await Promise.all([
        practiceApi.rank({
          days: days.value,
          platform: platform.value || null,
          college: college.value || null,
          enroll_year: enrollYear.value,
          q: search.value || null,
        }),
        practiceApi.status(),
      ])
      data.value = rank
      status.value = sync
    }
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

/** 只重拉数据，不动筛选面板的开合状态。 */
function reload() {
  load()
}

function clearFilters() {
  college.value = ''
  enrollYear.value = null
  search.value = ''
}

function go(path: string) {
  window.location.href = path
}

// 切换维度或平台筛选就重拉。rating 榜只看平台，与天数无关。
watch([dimension, ratingPlatform], load)

// 搜索防抖：每敲一个字就发请求太浪费。
let searchTimer: number | undefined
watch(search, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(reload, 300)
})

onMounted(async () => {
  await ensureLoaded()
  await load()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold tracking-tight">榜单</h1>
        <p class="mt-0.5 text-xs text-muted-foreground">
          <template v-if="dimension === 'practice'">
            按过题数统计。同一平台的主号与小号已合并。一天从凌晨 4 点算起。
          </template>
          <template v-else>
            平台上的等级分，以账号为单位——主号和小号各有各的 rating，合并没有意义。
          </template>
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="loading" @click="reload">
        <RefreshCw class="mr-1.5 h-3.5 w-3.5" :class="loading && 'animate-spin'" />
        刷新
      </Button>
    </div>

    <!-- 维度 -->
    <div class="flex gap-1 rounded-md border border-border/40 p-0.5">
      <button
        v-for="tab in [
          { key: 'practice' as const, label: '练习量' },
          { key: 'rating' as const, label: 'Rating' },
        ]"
        :key="tab.key"
        class="flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors"
        :class="
          dimension === tab.key
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted/60'
        "
        @click="dimension = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 常用筛选 -->
    <div v-if="dimension === 'practice'" class="flex flex-wrap gap-2">
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
          @click="((days = option.value), reload())"
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
          @click="((platform = option.value), reload())"
        >
          {{ option.label }}
        </button>
      </div>

      <!-- 高级筛选开关。默认收起，免得一进来就面对一排下拉框。 -->
      <button
        class="flex items-center gap-1.5 rounded-md border border-border/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60"
        :class="showFilters || hasFilters ? 'text-foreground' : 'text-muted-foreground'"
        @click="showFilters = !showFilters"
      >
        <Filter class="h-3.5 w-3.5" />
        高级筛选
        <span v-if="hasFilters" class="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
          {{ [college, enrollYear, search].filter(Boolean).length }}
        </span>
        <ChevronDown class="h-3.5 w-3.5 transition-transform" :class="showFilters && 'rotate-180'" />
      </button>
    </div>

    <div v-else class="flex flex-wrap gap-1 rounded-md border border-border/40 p-0.5">
      <button
        v-for="option in RATING_PLATFORMS"
        :key="option.value"
        class="rounded px-3 py-1.5 text-xs font-medium transition-colors"
        :class="
          ratingPlatform === option.value
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted/60'
        "
        @click="ratingPlatform = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- 高级筛选面板 -->
    <div
      v-if="dimension === 'practice' && showFilters"
      class="grid gap-2 rounded-md border border-border/40 p-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div class="space-y-1">
        <label class="text-xs font-medium text-muted-foreground">搜索</label>
        <Input v-model="search" placeholder="姓名或学号" class="h-8 text-xs" />
      </div>

      <div class="space-y-1">
        <label class="text-xs font-medium text-muted-foreground">学院</label>
        <select
          v-model="college"
          class="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          @change="reload()"
        >
          <option value="">全部</option>
          <option v-for="name in data?.filters.colleges ?? []" :key="name" :value="name">
            {{ name }}
          </option>
        </select>
      </div>

      <div class="space-y-1">
        <label class="text-xs font-medium text-muted-foreground">年级</label>
        <select
          v-model="enrollYear"
          class="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          @change="reload()"
        >
          <option :value="null">全部</option>
          <option v-for="year in data?.filters.enroll_years ?? []" :key="year" :value="year">
            {{ year }} 级
          </option>
        </select>
      </div>

      <div class="flex items-end">
        <Button v-if="hasFilters" variant="ghost" size="sm" @click="clearFilters(), reload()">
          <X class="mr-1 h-3 w-3" />
          清除筛选
        </Button>
      </div>
    </div>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <Card v-if="needsLogin">
      <CardContent class="space-y-3 py-8 text-center">
        <p class="text-sm text-muted-foreground">榜单包含成员姓名与数据，需要登录后查看。</p>
        <Button @click="go('/login')">
          <LogIn class="mr-2 h-4 w-4" />
          去登录
        </Button>
      </CardContent>
    </Card>

    <!-- 练习量 -->
    <Card v-else-if="dimension === 'practice'">
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <CardTitle class="text-sm font-medium">
            <span v-if="data">{{ data.dates[0] }} ~ {{ data.dates[data.dates.length - 1] }}</span>
            <span v-else>加载中</span>
          </CardTitle>
          <span v-if="data" class="text-xs text-muted-foreground">
            {{ data.entries.length }} 人
          </span>
        </div>
      </CardHeader>

      <CardContent class="p-0">
        <div v-if="loading" class="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 class="h-4 w-4 animate-spin" />
          正在读取…
        </div>

        <div v-else-if="!data?.entries.length" class="p-6 text-center text-sm text-muted-foreground">
          <template v-if="hasFilters">没有符合条件的人。</template>
          <template v-else>
            这段时间还没有记录。榜单由后台定时同步，成员绑好账号后就会出现。
          </template>
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
                <button
                  class="truncate text-sm font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
                  :title="`查看 ${entry.display_name} 的资料`"
                  @click="dialogEntry = entry"
                >
                  {{ entry.display_name }}
                </button>
                <span
                  v-if="formatEnrollYear(entry.enroll_year)"
                  class="shrink-0 text-[11px] text-muted-foreground"
                >
                  {{ formatEnrollYear(entry.enroll_year) }}
                </span>
                <span
                  v-if="entry.college_name"
                  class="hidden shrink-0 text-[11px] text-muted-foreground/70 sm:inline"
                >
                  {{ entry.college_name }}
                  <template v-if="entry.major_name"> · {{ entry.major_name }}</template>
                </span>
              </div>

              <!-- 每日柱状图。每根柱子悬停时放大并浮出当天的数量。 -->
              <div class="mt-1.5 flex items-end gap-0.5" style="height: 40px">
                <span
                  v-for="day in entry.days"
                  :key="day.date"
                  class="group/bar relative flex-1 cursor-default rounded-sm transition-all duration-150 hover:bg-primary"
                  :class="day.count > 0 ? 'bg-primary/70' : 'bg-muted'"
                  :style="{ height: barHeight(day.count) }"
                >
                  <span
                    class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded border border-border/60 bg-popover px-1.5 py-0.5 text-[10px] text-popover-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover/bar:opacity-100"
                  >
                    {{ day.date.slice(5) }} · {{ day.count }} 题
                  </span>
                </span>
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

    <!-- Rating 榜。以账号为单位，所以同一个人可能出现多行。 -->
    <Card v-else>
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <CardTitle class="text-sm font-medium">{{ rating?.label ?? '' }} Rating</CardTitle>
          <span v-if="rating?.entries.length" class="text-xs text-muted-foreground">
            共 {{ rating.entries.length }} 个账号
          </span>
        </div>
      </CardHeader>

      <CardContent class="p-0">
        <div v-if="loading" class="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 class="h-4 w-4 animate-spin" />
          正在读取…
        </div>

        <div
          v-else-if="!rating?.entries.length"
          class="p-6 text-center text-sm text-muted-foreground"
        >
          还没有人绑定这个平台的账号，或者 rating 尚未同步（每天一次）。
        </div>

        <div v-else class="divide-y divide-border/40">
          <div
            v-for="entry in rating.entries"
            :key="`${entry.platform}-${entry.identifier}`"
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
                <button
                  class="truncate text-sm font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
                  :title="`查看 ${entry.display_name} 的资料`"
                  @click="go(`/member?id=${entry.user_id}`)"
                >
                  {{ entry.display_name }}
                </button>
                <span
                  v-if="formatEnrollYear(entry.enroll_year)"
                  class="shrink-0 text-[11px] text-muted-foreground"
                >
                  {{ formatEnrollYear(entry.enroll_year) }}
                </span>
              </div>
              <p class="truncate font-mono text-xs text-muted-foreground">{{ entry.identifier }}</p>
            </div>

            <div class="shrink-0 text-right">
              <span class="font-mono text-sm font-semibold">{{ entry.rating }}</span>
              <p
                v-if="entry.max_rating && entry.max_rating !== entry.rating"
                class="font-mono text-[10px] text-muted-foreground"
              >
                最高 {{ entry.max_rating }}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <p v-if="dimension === 'practice' && status?.has_run" class="text-xs text-muted-foreground">
      上次同步：{{ status.account_count }} 个账号，成功 {{ status.ok_count }}
      <span v-if="status.error_count">，失败 {{ status.error_count }}</span>
      <span v-if="status.errors.length" class="block pt-1 text-destructive/80">
        {{ status.errors.join('；') }}
      </span>
    </p>

    <p v-else-if="dimension === 'rating'" class="text-xs text-muted-foreground">
      Rating 每天同步一次。刚打完比赛的话，去首页点「刷新」立刻更新。
    </p>

    <!-- 成员资料弹窗。用榜单里已有的那一行，不再重复拉数据。 -->
    <MemberDialog v-if="dialogEntry" :entry="dialogEntry" @close="dialogEntry = null" />
  </div>
</template>
