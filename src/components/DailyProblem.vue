<script setup lang="ts">
/**
 * 每日一题。
 *
 * 每天几道由后端的 BANDS 决定，按难度分档各一道。
 * 抽中的题当天固定，第二天凌晨 4 点（东八区）换——与练习数据的「一天」
 * 用同一个起点，免得出现「榜单算昨天、题目算今天」的错位。
 *
 * 题目全站统一：抽签只由日期决定，与「谁在看」无关。
 */
import { onMounted, ref } from 'vue'
import { BookOpen, Check, ExternalLink, Loader2, RefreshCw, Users } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import Editorial from './Editorial.vue'
import {
  ApiError,
  dailyApi,
  type DailyProblemBoard,
  type DailyProblemEntry,
  type EditorialView,
} from '../lib/api'
import { useAuth } from '../lib/auth'

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const { isCampusMember, ensureLoaded } = useAuth()

const board = ref<DailyProblemBoard | null>(null)
const loading = ref(true)
const error = ref('')

/** 题号 → 题解。和后端返回的题目按 key 对应。 */
const editorials = ref<Record<string, EditorialView>>({})
/** 展开着题解的题号。同时只开一道，避免页面太长。 */
const openEditorial = ref<string | null>(null)

function editorialFor(key: string): EditorialView | null {
  return editorials.value[key] ?? null
}

function hasEditorial(key: string): boolean {
  return editorialFor(key)?.available === true
}

function toggleEditorial(key: string) {
  openEditorial.value = openEditorial.value === key ? null : key
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  const [boardRes, editorialRes] = await Promise.allSettled([
    dailyApi.get(),
    dailyApi.editorials(),
  ])
  if (boardRes.status === 'fulfilled') {
    board.value = boardRes.value
  } else {
    const exc = boardRes.reason
    error.value = exc instanceof ApiError ? exc.message : '加载失败'
  }
  if (editorialRes.status === 'fulfilled') {
    editorials.value = Object.fromEntries(
      editorialRes.value.problems.map((item) => [item.key, item]),
    )
  } else {
    editorials.value = {}
  }
  loading.value = false
}

onMounted(() => {
  void ensureLoaded()
  void load()
})

/** 档位的显示文字。接口给的是「800-1000」这种，直接显示就行。 */
function bandLabel(band: string): string {
  return band
}

/** 站内完成人数。这是本平台的数字，不是 CF 全站的。 */
function membersSolved(entry: DailyProblemEntry): string {
  if (entry.members_solved <= 0) return '无人通过'
  return `${entry.members_solved} 人通过`
}
</script>

<template>
  <div class="space-y-3">
    <!-- 头部：说明 + 倒计时 + 重抽 -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-0">
        <h1 v-if="!props.compact" class="page-title">每日一题</h1>
        <h2 v-else class="text-lg font-semibold tracking-tight">每日一题</h2>
        <!--
          不显示倒计时。小时分钟一直在跳，看久了只会让人焦虑，而这是一天
          一次的东西——知道「凌晨四点换」就够了。
        -->
        <p class="mt-0.5 text-xs text-muted-foreground">按难度分档每日抽题 · 凌晨四点刷新</p>
        <!-- 签到状态：仅校内成员展示。 -->
        <p v-if="isCampusMember && board" class="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span
            v-if="board.checked_in_today"
            class="flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-500"
          >
            <Check class="h-3.5 w-3.5" />
            今天已签到
          </span>
          <span v-else class="text-muted-foreground">今天还没签到</span>
          <span class="text-muted-foreground">
            累计 {{ board.checkin_days }} 天
            <template v-if="board.checkin_streak > 1"> · 连续 {{ board.checkin_streak }} 天</template>
          </span>
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <Button v-if="!props.compact" variant="ghost" size="sm" :disabled="loading" @click="load">
          <RefreshCw class="mr-1 h-3.5 w-3.5" :class="loading && 'animate-spin'" />
          刷新
        </Button>
      </div>
    </div>

    <Alert v-if="error" variant="destructive">
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <!-- 加载中 -->
    <Card v-if="loading && !board">
      <CardContent class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin" />
        正在抽题…
      </CardContent>
    </Card>

    <!-- 题库还没准备好 -->
    <Card v-else-if="board && !board.problems.length">
      <CardContent class="py-8 text-center text-sm text-muted-foreground">
        题库还没准备好。管理员同步一次 Codeforces 题库后就有题了。
      </CardContent>
    </Card>

    <!--
      题目卡片。列数跟着档位数走，不写死——加档位时不用改这里。
      两列起步，宽屏按数量摊开。
    -->
    <div
      v-else-if="board"
      class="grid gap-3 sm:grid-cols-2"
      :class="board.problems.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'"
    >
      <Card v-for="problem in board.problems" :key="problem.key">
        <CardContent class="flex h-full flex-col gap-2 p-4">
          <!-- 档位 + 做过了 -->
          <div class="flex items-center justify-between gap-2">
            <span
              class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground"
            >
              {{ bandLabel(problem.band) }}
            </span>
            <span
              v-if="problem.solved"
              class="flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-500"
            >
              <Check class="h-3 w-3" />
              做过了
            </span>
          </div>

          <!-- 题名。点标题直接开题面。 -->
          <a
            :href="problem.url"
            target="_blank"
            rel="noopener noreferrer"
            class="group -mx-1 rounded px-1 text-sm font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            <span class="mr-1.5 font-mono text-xs text-muted-foreground">{{ problem.key }}</span>
            {{ problem.name || '（题名待抓取）' }}
            <ExternalLink
              class="ml-0.5 inline h-3 w-3 shrink-0 align-[-1px] text-muted-foreground transition-colors group-hover:text-primary"
            />
          </a>

          <!-- 难度和过题人数。放在底部，三张卡对齐。 -->
          <div class="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-1 text-[11px] text-muted-foreground">
            <span v-if="problem.rating" class="font-mono">{{ problem.rating }} 分</span>
            <!-- 站内完成人数仅对校内成员显示，避免向访客或校外账号暴露站内成员动态。 -->
            <span v-if="isCampusMember">{{ membersSolved(problem) }}</span>

            <!--
              题解入口。放在卡片底部，与难度同一行。

              三列网格里放不下题解正文，所以点击后在网格下方展开一块全宽的
              区域（见下面那个 Editorial）。
            -->
            <button
              v-if="hasEditorial(problem.key)"
              type="button"
              class="ml-auto flex items-center gap-0.5 rounded px-1 py-0.5 font-medium transition-colors hover:text-primary"
              :class="openEditorial === problem.key ? 'text-primary' : ''"
              :aria-expanded="openEditorial === problem.key"
              @click="toggleEditorial(problem.key)"
            >
              <BookOpen class="h-3 w-3" />
              题解
            </button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!--
      题解展开区。全宽放在题目下面。

      同时只开一道：几道题的题解一起展开会有几千字，页面长得没法用。
      点另一道的「题解」会切换过去。
    -->
    <Card v-if="board && openEditorial && hasEditorial(openEditorial)">
      <CardContent class="p-4 sm:p-5">
        <div class="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 class="text-sm font-medium">
            <span class="mr-1.5 font-mono text-xs text-muted-foreground">{{ openEditorial }}</span>
            {{ editorialFor(openEditorial)?.name }}
          </h3>
          <button
            type="button"
            class="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
            @click="openEditorial = null"
          >
            收起
          </button>
        </div>

        <!--
          :key 不能省。不加的话 Vue 会复用组件实例，展开的提示和「看完整题解」
          的状态会带到下一道题上——点开另一道题时，它一上来就显示着上次展开到
          的位置。
        -->
        <Editorial :key="openEditorial" :editorial="editorialFor(openEditorial)!" />
      </CardContent>
    </Card>

    <!-- 今日已签到成员（完整页且仅校内成员展示） -->
    <div
      v-if="!props.compact && isCampusMember && board && board.checked_in_today_names?.length"
      class="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-3.5 py-2.5 text-xs text-muted-foreground"
    >
      <span class="inline-flex items-center gap-1 font-medium text-foreground">
        <Users class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
        今日已签到（{{ board.checked_in_today_names.length }}）：
      </span>
      <span
        v-for="name in board.checked_in_today_names"
        :key="name"
        class="rounded-md bg-muted/70 px-2 py-0.5 text-foreground"
      >
        {{ name }}
      </span>
    </div>
  </div>
</template>
