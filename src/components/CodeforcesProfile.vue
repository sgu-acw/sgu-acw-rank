<script setup lang="ts">
/**
 * Codeforces 选手资料查询。
 *
 * 页面原来有两个毛病：搜到一次之后输入框就消失了（v-if 把搜索框和结果
 * 放在了同一个 else 分支里），以及查不到 Handle 时只往控制台打日志，
 * 页面上什么都不说，看起来像卡住了。这里把搜索框常驻，失败时给出提示。
 */
import { ref, onMounted, computed } from 'vue'
import { AlertCircle, ExternalLink, Loader2, Search } from 'lucide-vue-next'
import { fetchOneUserInfoStructured, fetchUserRating, getRatingHexColor } from '../lib/cfapi'
import type { User } from '../lib/interfaces/cfapi'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Avatar } from './ui/avatar'
import { Input } from './ui/input'

const searchHandle = ref('')
const user = ref<User | null>(null)
const ratingHistory = ref<number[]>([])
const searching = ref(false)
const error = ref('')

const rankColor = computed(() => (user.value ? getRatingHexColor(user.value.rating) : undefined))
const historyStart = computed(() => ratingHistory.value[0] ?? 0)
const historyEnd = computed(() => ratingHistory.value.at(-1) ?? 0)

/**
 * 最高段位。
 *
 * CF 的 user.info 不返回 maxRank，只给 maxRating，所以按分数自己推。
 * 原来直接把 maxRating 当段位显示，那一栏是空的。
 */
const maxRank = computed(() => {
  const rating = user.value?.maxRating ?? 0
  if (rating >= 3000) return 'Legendary Grandmaster'
  if (rating >= 2600) return 'International Grandmaster'
  if (rating >= 2400) return 'Grandmaster'
  if (rating >= 2300) return 'International Master'
  if (rating >= 2100) return 'Master'
  if (rating >= 1900) return 'Candidate Master'
  if (rating >= 1600) return 'Expert'
  if (rating >= 1400) return 'Specialist'
  if (rating >= 1200) return 'Pupil'
  return 'Newbie'
})

// SVG 折线。用 Catmull-Rom 转贝塞尔，让折点圆滑一些。
function catmullRomToBezier(points: [number, number][]): string {
  if (points.length < 2) return ''
  const d: string[] = [`M ${points[0][0]},${points[0][1]}`]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    d.push(`C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`)
  }
  return d.join(' ')
}

const SPARK_WIDTH = 600
const SPARK_HEIGHT = 100
const SPARK_PADDING = 8

function getSparklinePoints(data: number[]): [number, number][] {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  return data.map((val, i) => [
    SPARK_PADDING + (i / (data.length - 1)) * (SPARK_WIDTH - 2 * SPARK_PADDING),
    SPARK_PADDING + (1 - (val - min) / range) * (SPARK_HEIGHT - 2 * SPARK_PADDING),
  ])
}

const sparklinePath = computed(() => {
  if (ratingHistory.value.length < 2) return ''
  return catmullRomToBezier(getSparklinePoints(ratingHistory.value))
})

const sparklineAreaPath = computed(() => {
  if (ratingHistory.value.length < 2) return ''
  const curvePath = catmullRomToBezier(getSparklinePoints(ratingHistory.value))
  return `${curvePath} L ${SPARK_WIDTH - SPARK_PADDING},${SPARK_HEIGHT} L ${SPARK_PADDING},${SPARK_HEIGHT} Z`
})

async function searchUser() {
  const handle = searchHandle.value.trim()
  if (!handle || searching.value) return

  searching.value = true
  error.value = ''
  user.value = null
  ratingHistory.value = []

  try {
    user.value = await fetchOneUserInfoStructured(handle)
  } catch {
    error.value = `查不到「${handle}」。确认一下 Handle 有没有拼错。`
    searching.value = false
    return
  }

  // Rating 变化拿不到不影响资料本身，静默跳过就行。
  try {
    const ratingChanges = await fetchUserRating(handle)
    ratingHistory.value = ratingChanges.map((change) => change.newRating)
  } catch {
    ratingHistory.value = []
  }

  window.history.replaceState({}, '', `/codeforces/profile?handle=${encodeURIComponent(handle)}`)
  searching.value = false
}

onMounted(async () => {
  const handle = new URLSearchParams(window.location.search).get('handle')
  if (handle) {
    searchHandle.value = handle
    await searchUser()
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <div>
      <h1 class="text-lg font-semibold tracking-tight">Codeforces 资料</h1>
    </div>

    <form class="flex gap-2" @submit.prevent="searchUser">
      <Input
        v-model="searchHandle"
        placeholder="Codeforces Handle"
        class="font-mono"
        aria-label="Codeforces Handle"
        @keyup.enter="searchUser"
      />
      <Button type="submit" class="shrink-0" :disabled="searching || !searchHandle.trim()">
        <Loader2 v-if="searching" class="mr-1.5 h-4 w-4 animate-spin" />
        <Search v-else class="mr-1.5 h-4 w-4" />
        {{ searching ? '查询中' : '查询' }}
      </Button>
    </form>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <Card v-if="user">
      <CardContent class="space-y-4 p-5">
        <div class="flex items-center gap-4">
          <Avatar :src="user.titlePhoto" :alt="user.handle" size="72" class="shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium" :style="{ color: rankColor }">{{ user.rank }}</p>
            <h2 class="truncate text-lg font-semibold tracking-tight">{{ user.handle }}</h2>
            <p v-if="user.organization" class="mt-0.5 truncate text-xs text-muted-foreground">
              {{ user.organization }}
            </p>
          </div>
          <a
            :href="`https://codeforces.com/profile/${user.handle}`"
            target="_blank"
            rel="noreferrer"
            class="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            主页
            <ExternalLink class="h-3 w-3" />
          </a>
        </div>

        <!-- 几个关键数字。和首页的统计卡一样，用分隔线切成格子。 -->
        <div class="grid grid-cols-3 divide-x divide-border/40 rounded-md border border-border/40">
          <div class="px-4 py-3">
            <p class="text-xs text-muted-foreground">当前 Rating</p>
            <p class="mt-1 font-mono text-lg font-semibold tabular-nums" :style="{ color: rankColor }">
              {{ user.rating }}
            </p>
          </div>
          <div class="px-4 py-3">
            <p class="text-xs text-muted-foreground">最高 Rating</p>
            <p class="mt-1 font-mono text-lg font-semibold tabular-nums">{{ user.maxRating }}</p>
            <p class="text-[11px] text-muted-foreground">{{ maxRank }}</p>
          </div>
          <div class="px-4 py-3">
            <p class="text-xs text-muted-foreground">好友数</p>
            <p class="mt-1 font-mono text-lg font-semibold tabular-nums">{{ user.friendOfCount }}</p>
          </div>
        </div>

        <div v-if="ratingHistory.length >= 2">
          <div class="flex items-baseline justify-between gap-2">
            <h3 class="text-sm font-medium">Rating 变化</h3>
            <span class="font-mono text-[11px] text-muted-foreground">
              {{ historyStart }} → {{ historyEnd }} · {{ ratingHistory.length }} 场
            </span>
          </div>
          <svg viewBox="0 0 600 100" class="mt-2 h-24 w-full" preserveAspectRatio="none" aria-label="Rating 变化折线">
            <defs>
              <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgb(59,130,246)" stop-opacity="0.25" />
                <stop offset="100%" stop-color="rgb(59,130,246)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path :d="sparklineAreaPath" fill="url(#sparkGrad)" />
            <path :d="sparklinePath" fill="none" stroke="rgb(59,130,246)" stroke-width="2" />
          </svg>
        </div>
      </CardContent>
    </Card>

    <Card v-else-if="!searching && !error">
      <CardContent class="py-10 text-center text-sm text-muted-foreground">
        输入 Handle 后，资料会显示在这里
      </CardContent>
    </Card>
  </div>
</template>
