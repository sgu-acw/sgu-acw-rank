<script setup lang="ts">
/**
 * 榜单。三个维度：
 *
 * * **练习量**：按天统计的过题数，同平台的主号小号按人合并。
 * * **Rating**：平台上的等级分，以账号为单位——主号和小号各有各的 rating，
 *   合并没有意义。
 * * **签到**：做对当天每日一题任意一道的连续天数。
 *
 * 签到原来放在每日一题页。它虽然由做题产生，但展示的是「别人的数据」，
 * 和「今天做什么题」不是一回事——放在这里和其他榜单一起才顺。
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
  dailyApi,
  practiceApi,
  type CheckinBoard,
  type DailySolversBoard,
  type Platform,
  type PracticeEntry,
  type PracticeRank,
  type RatingBoard,
  type SyncStatus,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatEnrollYear } from '../lib/format'

const { ensureLoaded } = useAuth()

type Dimension = 'practice' | 'rating' | 'checkin'

const loading = ref(true)
const error = ref('')
const data = ref<PracticeRank | null>(null)
const rating = ref<RatingBoard | null>(null)
const checkin = ref<CheckinBoard | null>(null)
const solvers = ref<DailySolversBoard | null>(null)
/** 当前看的是第几道题的通过名单。切维度或刷新后回到第一道。 */
const activeProblem = ref(0)
const currentProblem = computed(() => solvers.value?.problems[activeProblem.value] ?? null)
const status = ref<SyncStatus | null>(null)
const needsLogin = ref(false)

/**
 * 筛选状态的持久化。
 *
 * 切走再回来要还是原来那一屏——选了「最近 90 天 · 只看信工」，去题单看一眼
 * 再回来又变回「今日」，得重新选一遍，很烦。
 *
 * 只存这几个筛选条件，不存滚动位置之类——那些存了反而奇怪。
 * 搜索词也存：它同样是「我正在看什么」的一部分。
 */
const FILTER_KEY = 'practice-filters'

interface StoredFilters {
  dimension?: Dimension
  days?: number
  platform?: string
  ratingPlatform?: string
  college?: string
  enrollYear?: number | null
}

function readStoredFilters(): StoredFilters {
  try {
    const raw = localStorage.getItem(FILTER_KEY)
    return raw ? (JSON.parse(raw) as StoredFilters) : {}
  } catch {
    // 存储被禁用或内容坏了，当作没有存过。筛选状态不值得为它报错。
    return {}
  }
}

const stored = readStoredFilters()

const dimension = ref<Dimension>(
  stored.dimension === 'rating' || stored.dimension === 'checkin' ? stored.dimension : 'practice',
)
const days = ref(typeof stored.days === 'number' ? stored.days : 1)
const platform = ref<Platform | ''>((stored.platform as Platform | '') ?? '')
const ratingPlatform = ref<Platform>((stored.ratingPlatform as Platform) ?? 'codeforces')

// 高级筛选。平时收起来——大多数时候只想看「今日谁在刷」，不想先面对一堆
// 下拉框。
const showFilters = ref(false)
const college = ref(stored.college ?? '')
const enrollYear = ref<number | null>(stored.enrollYear ?? null)
const search = ref('')

function saveFilters() {
  try {
    localStorage.setItem(
      FILTER_KEY,
      JSON.stringify({
        dimension: dimension.value,
        days: days.value,
        platform: platform.value,
        ratingPlatform: ratingPlatform.value,
        college: college.value,
        enrollYear: enrollYear.value,
      }),
    )
  } catch {
    // 存不下就算了，不影响当前这一屏。
  }
}

// 点名字弹出的资料窗口。
const dialogEntry = ref<PracticeEntry | null>(null)

const DAY_OPTIONS = [
  { value: 1, label: '今日' },
  { value: 7, label: '最近 7 天' },
  { value: 30, label: '最近 30 天' },
  { value: 90, label: '最近 90 天' },
  // 0 是约定：后端从 2024-01-01 算到今天。不用一个很大的天数，因为社团的
  // 记录从 2024 级才开始，按天数拉会带出一段没有意义的空白期。
  { value: 0, label: '历史综合' },
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

/**
 * 窄屏。手机上柱状图要换一种画法。
 */
const isNarrow = ref(false)

/**
 * 把某人的每日数据聚合成柱子。
 *
 * 桌面端 90 天有 90 根柱子，一根挨一根，看得出每天的形状。手机屏只有
 * 390px，90 根柱子每根不到 2px，画出来就是一条灰线，既看不出起伏，
 * 也点不中。
 *
 * 所以窄屏按周合并：90 天变 13 根，每根代表一周的题量。牺牲了单日
 * 精度，换来能看清趋势——这是手机上唯一说得通的选择。
 */
/**
 * 把一个日期归到哪个学期。
 *
 * 广工的校历大致是：秋季学期 9 月到次年 1 月，春季学期 2 月到 6 月，
 * 7-8 月是暑假。暑假单独一桶，因为那段时间的练习多半是集训，和学期中
 * 的节奏不一样。
 *
 * 返回的字符串直接当分组键，同时也是标签的一部分。
 */
function termOf(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4))
  const month = Number(isoDate.slice(5, 7))

  if (month >= 9) return `${year} 秋`
  if (month === 1) return `${year - 1} 秋`
  if (month >= 2 && month <= 6) return `${year} 春`
  return `${year} 暑`
}

/** 学期是否要按学期分桶。只有「历史综合」是这样。 */
const byTerm = computed(() => days.value === 0)

/**
 * 把学期键转成提示里的话。
 *
 * 键本身是「2024 秋」这种紧凑写法（当分组键用，越短越好），但显示时
 * 「2024 秋季学期」才通顺。暑假不是学期，单独说。
 */
function termLabel(key: string): string {
  const [year, season] = key.split(' ')
  return season === '暑' ? `${year} 年暑假` : `${year} 年${season}季学期`
}

function barsFor(input: { date: string; count: number }[]): { date: string; count: number }[] {
  // 历史综合：一个学期一根柱子。
  //
  // 不分桶的话是 1000 多根，全挤成一条线。按学期分既能看出趋势，柱子数量
  // 又刚好（三四年也就七八根），而且「哪一学期练得多」本来就是最自然的
  // 问法。
  if (byTerm.value) {
    const buckets: { date: string; count: number }[] = []
    for (const day of input) {
      const term = termOf(day.date)
      const last = buckets[buckets.length - 1]
      if (last && last.date === term) {
        last.count += day.count
      } else {
        buckets.push({ date: term, count: day.count })
      }
    }
    return buckets
  }

  // 一个月以内照原样画。再长就得合并，否则柱子会细到看不见。
  if (input.length <= 30) return input

  // 90 天按周，再长按月。
  const step = input.length > 365 ? 30 : 7

  const buckets: { date: string; count: number }[] = []
  for (let i = 0; i < input.length; i += step) {
    const chunk = input.slice(i, i + step)
    buckets.push({
      // 用这一格的最后一天当标签，表示「截至这天」。
      date: chunk[chunk.length - 1].date,
      count: chunk.reduce((sum, d) => sum + d.count, 0),
    })
  }
  return buckets
}

/** 聚合后的最大值。柱子高度得按它算，否则会顶出容器。 */
const maxBar = computed(() => {
  if (!data.value) return 1
  let max = 0
  for (const entry of data.value.entries) {
    for (const bar of barsFor(entry.days)) max = Math.max(max, bar.count)
  }
  return Math.max(1, max)
})

/** 把数量画成柱子的高度。0 也留 2px，这样空白日不会看起来缺了一块。 */
function barHeight(count: number): string {
  if (count <= 0) return '2px'
  return `${Math.max(4, (count / maxBar.value) * 40)}px`
}

/**
 * 柱子是一周还是单日，决定提示文字怎么写。
 */
/** 柱子是否代表一段时间而不是单日。决定提示文字怎么写。 */
const bucketed = computed(() => days.value > 30)

/**
 * 只有一天时改用横向条。
 *
 * 「今日」窗口只有一根柱子，竖着画会占满整行宽度——看起来像一条分隔线，
 * 而不是「谁做了多少」。横条更直观：长度直接对比，第一名占满整宽。
 */
// 只有「今日」是单日。注意 days=0 是「历史综合」，不是「零天」——
    // 写成 days.value <= 1 会把历史综合也算进来。
const singleDay = computed(() => days.value === 1)

/** 今天最多的人做了多少题。横条按它算比例。 */
const topToday = computed(() => {
  if (!data.value) return 1
  return Math.max(1, ...data.value.entries.map((e) => e.total))
})

/** 横条宽度，第一位 100%。 */
function barWidth(total: number): string {
  return `${Math.max(2, Math.round((total / topToday.value) * 100))}%`
}

/**
 * 记录时刻，显示成「14:23」。
 *
 * 这是同步任务发现「这道题过了」的时间，不是平台上真正的通过时间。
 * 同步每 5 分钟一批，所以同批次内的先后分不出来，界面上会说明这点。
 */
function formatSolvedAt(value: string): string {
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

async function load() {
  loading.value = true
  error.value = ''
  needsLogin.value = false
  try {
    if (dimension.value === 'rating') {
      rating.value = await practiceApi.rating(ratingPlatform.value)
    } else if (dimension.value === 'checkin') {
      // 签到相关的两个榜一起拉：天数榜和每题通过名单。
      // 它们不需要平台、天数这些筛选，只看「当天的每日一题做了没有」。
      const [board, solversBoard] = await Promise.all([
        dailyApi.checkin(),
        dailyApi.solvers(),
      ])
      checkin.value = board
      solvers.value = solversBoard
      // 换了一天或重新加载，回到第一道题。
      activeProblem.value = 0
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
// 筛选一变就存下来，下次回来接着用。
watch([dimension, ratingPlatform, days, platform, college, enrollYear], () => {
  saveFilters()
})

watch([dimension, ratingPlatform], load)

// 搜索防抖：每敲一个字就发请求太浪费。
let searchTimer: number | undefined
watch(search, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(reload, 300)
})

onMounted(async () => {
  // 用 matchMedia 而不是监听 resize：它只在真正跨越断点时才回调，
  // 而且能直接给出当前是否匹配，不用自己拿宽度去比。
  const mq = window.matchMedia('(max-width: 639px)')
  isNarrow.value = mq.matches
  mq.addEventListener('change', (e) => {
    isNarrow.value = e.matches
  })

  await ensureLoaded()
  await load()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-lg font-semibold tracking-tight">榜单</h1>
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
          { key: 'checkin' as const, label: '签到' },
        ]"
        :key="tab.key"
        class="flex-1 rounded px-3 py-2 text-xs font-medium transition-colors active:scale-[0.98]"
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
          class="rounded px-3 py-2 text-xs font-medium transition-colors active:scale-[0.98]"
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
          class="rounded px-3 py-2 text-xs font-medium transition-colors active:scale-[0.98]"
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
        class="flex items-center gap-1.5 rounded-md border border-border/40 px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/60 active:scale-[0.98]"
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

    <div
      v-else-if="dimension === 'rating'"
      class="flex flex-wrap gap-1 rounded-md border border-border/40 p-0.5"
    >
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
      class="grid gap-3 rounded-md border border-border/40 p-3 sm:grid-cols-2 sm:gap-2 lg:grid-cols-4"
    >
      <div class="space-y-1">
        <label class="text-xs font-medium text-muted-foreground">搜索</label>
        <Input v-model="search" placeholder="姓名或学号" class="h-9 text-sm" />
      </div>

      <div class="space-y-1">
        <label class="text-xs font-medium text-muted-foreground">学院</label>
        <select
          v-model="college"
          class="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
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
          class="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
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
      <CardContent class="py-8 text-center">
        <Button @click="go('/login')">
          <LogIn class="mr-2 h-4 w-4" />
          登录后查看榜单
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
          <template v-if="hasFilters">没有符合条件的人</template>
          <template v-else>
            这段时间还没有记录。榜单由后台定时同步，成员绑好账号后就会出现。
          </template>
        </div>

        <div v-else class="divide-y divide-border/40">
          <div
            v-for="entry in data.entries"
            :key="entry.user_id"
            class="row-action flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4"
          >
            <span
              class="w-6 shrink-0 text-center font-mono text-xs"
              :class="entry.rank <= 3 ? 'font-semibold text-foreground' : 'text-muted-foreground'"
            >
              {{ entry.rank }}
            </span>

            <div class="min-w-0 flex-1">
              <!--
                姓名、年级、学院专业。窄屏分两行：第一行姓名和年级，
                第二行学院专业班级。
                挤在一行会互相压缩，长专业名直接把姓名截断。
              -->
              <div class="flex flex-wrap items-baseline gap-x-2">
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
                <!--
                  只显示班级简称（「信工软工 3 班」），不再重复学院和专业。

                  那个简称里已经含了学院和专业（信工 + 软工），前面再写一遍
                  「信息工程学院 · 软件工程」是同一件事说两遍，整行又长又挤。
                -->
                <span
                  v-if="entry.class_label"
                  class="w-full text-[11px] text-muted-foreground/70 sm:w-auto"
                >
                  {{ entry.class_label }}
                </span>
                <!-- 没有班级号的人（比如 root 或老数据）退回显示学院专业。 -->
                <span
                  v-else-if="entry.college_name"
                  class="w-full text-[11px] text-muted-foreground/70 sm:w-auto"
                >
                  {{ entry.college_name }}
                  <template v-if="entry.major_name"> · {{ entry.major_name }}</template>
                </span>
              </div>

              <!--
                只有一天（「今日」窗口）时画横条。

                竖着画的话只有一根柱子，占满整行宽度，看起来像一条分隔线，
                读不出「谁做了多少」。横条按题数比长度，第一位 100%。
              -->
              <div v-if="singleDay" class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary/70 transition-[width] duration-300 ease-[var(--ease-out)]"
                  :style="{ width: barWidth(entry.total) }"
                />
              </div>

              <!--
                柱状图。窄屏且窗口较长时按周聚合，否则 90 根柱子会挤成
                一条线，既看不出起伏也点不中。

                每一列都是整高（40px）的感应区，柱子画在里面。
                早先感应区就是柱子本身，而没练的那天柱子只有 2px——
                想看一眼那天有没有练，得拿鼠标去够一条发丝，手指更不可能点中。

                外层列负责感应，内层柱子负责画。提示跟着柱子走，
                这样它不会因为列是整高就飘到图表外面去。
              -->
              <div v-else class="mt-1.5 flex gap-px sm:gap-0.5" style="height: 40px">
                <span
                  v-for="bar in barsFor(entry.days)"
                  :key="bar.date"
                  class="group/bar relative flex h-full flex-1 cursor-default items-end rounded-sm transition-colors hover:bg-muted/60 active:bg-muted/60"
                >
                  <span
                    class="relative w-full rounded-sm transition-colors duration-150 group-hover/bar:bg-primary group-active/bar:bg-primary"
                    :class="bar.count > 0 ? 'bg-primary/70' : 'bg-muted'"
                    :style="{ height: barHeight(bar.count) }"
                  >
                    <!--
                      提示。桌面端靠悬停，触屏没有悬停，所以长按也要能出。
                      group-active/bar 让手指按下时同样显示。
                    -->
                    <span
                      class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded border border-border/60 bg-popover px-1.5 py-0.5 text-[10px] text-popover-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover/bar:opacity-100 group-active/bar:opacity-100"
                    >
                      <template v-if="byTerm">{{ termLabel(bar.date) }} · {{ bar.count }} 题</template>
                      <template v-else-if="bucketed">
                        截至 {{ bar.date.slice(5) }} 那{{ days > 365 ? '月' : '周' }} ·
                        {{ bar.count }} 题
                      </template>
                      <template v-else>{{ bar.date.slice(5) }} · {{ bar.count }} 题</template>
                    </span>
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
    <Card v-else-if="dimension === 'rating'">
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
            class="row-action flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4"
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
              <!--
                handle 与班级专业。窄屏分两行——handle 和「信息工程学院 ·
                软件工程 · 软件工程 3 班」挤一行会互相截断。
              -->
              <p class="truncate font-mono text-xs text-muted-foreground">
                {{ entry.identifier }}
              </p>
              <p
                v-if="entry.class_label || entry.college_name"
                class="truncate text-[11px] text-muted-foreground/70"
              >
                <!-- 班级简称里已含学院和专业，不再重复。 -->
                {{ entry.class_label || [entry.college_name, entry.major_name].filter(Boolean).join(' · ') }}
              </p>
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

    <!--
      签到榜。按连续天数排，不是累计。

      连续天数才是「现在还在坚持」的信号；累计天数只说明来得早。
      累计作为次要信息放在右边。
    -->
    <Card v-if="dimension === 'checkin'">
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <CardTitle class="text-sm font-medium">签到排行</CardTitle>
          <span v-if="checkin?.entries.length" class="text-xs text-muted-foreground">
            {{ checkin.total_members }} 人
          </span>
        </div>
      </CardHeader>

      <CardContent class="p-0">
        <div v-if="loading" class="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 class="h-4 w-4 animate-spin" />
          正在读取…
        </div>

        <div
          v-else-if="!checkin?.entries.length"
          class="p-6 text-center text-sm text-muted-foreground"
        >
          还没有人签到。做对当天的每日一题里任意一道就算签到。
        </div>

        <div v-else class="divide-y divide-border/40">
          <div
            v-for="entry in checkin.entries"
            :key="entry.user_id"
            class="row-action flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4"
          >
            <span
              class="w-6 shrink-0 text-center font-mono text-xs"
              :class="entry.rank <= 3 ? 'font-semibold text-foreground' : 'text-muted-foreground'"
            >
              {{ entry.rank }}
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2">
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
                <span
                  v-if="entry.class_label"
                  class="truncate text-[11px] text-muted-foreground/70"
                >
                  {{ entry.class_label }}
                </span>
              </div>
            </div>

            <div class="shrink-0 text-right">
              <span class="font-mono text-sm font-semibold">{{ entry.streak }}</span>
              <span class="ml-0.5 text-xs text-muted-foreground">天</span>
              <p v-if="entry.days > entry.streak" class="font-mono text-[10px] text-muted-foreground">
                累计 {{ entry.days }}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    <!--
      当天每道题谁通过了，按记录时间从早到晚。

      和上面的签到天数榜并列：那个看「谁连续来了几天」，这个看「哪道题
      谁先做出来」。四道题各一张卡。
    -->
    <!--
      当天每道题谁通过了。

      四道题横着排成一排 tab，点哪个看哪个——竖着堆成四张卡会把页面拉得很长，
      而且大多数时候只想看其中一道。
    -->
    <Card v-if="dimension === 'checkin' && solvers?.problems.length">
      <!-- tab 条。每道题一个，显示难度档和题号。 -->
      <div
        class="flex gap-1 overflow-x-auto border-b border-border/50 p-1"
        role="tablist"
        aria-label="每日一题的题目"
      >
        <button
          v-for="(problem, index) in solvers.problems"
          :key="problem.key"
          type="button"
          role="tab"
          :aria-selected="activeProblem === index"
          class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors"
          :class="
            activeProblem === index
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          "
          @click="activeProblem = index"
        >
          <span class="font-mono">{{ problem.band }}</span>
          <span class="font-mono text-muted-foreground">{{ problem.key }}</span>
          <span
            v-if="problem.entries.length"
            class="rounded-full bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground"
          >
            {{ problem.entries.length }}
          </span>
        </button>
      </div>

      <CardContent v-if="currentProblem" class="p-0">
        <!-- 当前这道题的题目信息 -->
        <div class="flex flex-wrap items-baseline gap-x-2 px-4 py-3">
          <span class="text-sm font-medium">{{ currentProblem.name || currentProblem.key }}</span>
          <a
            :href="currentProblem.url"
            target="_blank"
            rel="noreferrer"
            class="font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            {{ currentProblem.key }}
          </a>
          <span
            v-if="currentProblem.rating"
            class="font-mono text-[11px] text-muted-foreground"
          >
            {{ currentProblem.rating }} 分
          </span>
          <span class="ml-auto text-xs text-muted-foreground">
            {{ currentProblem.entries.length }} 人通过
          </span>
        </div>

        <p
          v-if="!currentProblem.entries.length"
          class="px-4 pb-4 text-xs text-muted-foreground"
        >
          还没有人通过
        </p>

        <div v-else class="divide-y divide-border/40 border-t border-border/40">
          <div
            v-for="entry in currentProblem.entries"
            :key="entry.user_id"
            class="row-action flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4"
          >
            <span
              class="w-6 shrink-0 text-center font-mono text-xs"
              :class="entry.rank === 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'"
            >
              {{ entry.rank }}
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2">
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
                <span
                  v-if="entry.class_label"
                  class="truncate text-[11px] text-muted-foreground/70"
                >
                  {{ entry.class_label }}
                </span>
              </div>
            </div>

            <span class="shrink-0 font-mono text-xs text-muted-foreground">
              {{ formatSolvedAt(entry.solved_at) }}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>

    <p
      v-if="dimension === 'checkin' && solvers?.problems.length"
      class="text-xs text-muted-foreground/60"
    >
      时间是后台同步发现的时间，每 5 分钟一批；同一批内的先后分不出来。
    </p>

    <!--
      只在同步出错时提示。同步了多少个账号、成功几个是运维数字，
      成员看了没用；但抓失败得说出来，否则数据缺了没人知道。
    -->
    <Alert v-if="dimension === 'practice' && status?.errors.length" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">部分账号同步失败：{{ status.errors.join('；') }}</span>
    </Alert>

    <!-- 成员资料弹窗。用榜单里已有的那一行，不再重复拉数据。 -->
    <MemberDialog v-if="dialogEntry" :entry="dialogEntry" @close="dialogEntry = null" />
  </div>
</template>
