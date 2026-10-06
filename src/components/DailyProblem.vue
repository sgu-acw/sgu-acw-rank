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
import { computed, onMounted, ref } from 'vue'
import { BookOpen, Check, ExternalLink, Loader2, RefreshCw, Shuffle } from 'lucide-vue-next'
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

const { user, ensureLoaded } = useAuth()

const board = ref<DailyProblemBoard | null>(null)
const loading = ref(true)
const error = ref('')
const redrawing = ref(false)

/** 题号 → 题解。和后端返回的题目按 key 对应。 */
const editorials = ref<Record<string, EditorialView>>({})
/** 展开着题解的题号。同时只开一道，避免页面太长。 */
const openEditorial = ref<string | null>(null)

function editorialFor(key: string): EditorialView | null {
  return editorials.value[key] ?? null
}

/**
 * 题解入口要不要显示。
 *
 * 只有已公布的才显示。八点之前题解已经生成好了（草稿），但那是个半成品，
 * 对成员来说等于「没有」——显示一个点进去写着「正在生成」的入口，比不显示
 * 更让人困惑。生成失败同理，那是给管理员看的，不该扰民。
 */
function hasEditorial(key: string): boolean {
  return editorialFor(key)?.available === true
}

function toggleEditorial(key: string) {
  openEditorial.value = openEditorial.value === key ? null : key
}

const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'root')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    // 两个请求一起发，串行的话题解要等题目加载完才开始。
    const [boardResult, editorialResult] = await Promise.all([
      dailyApi.get(),
      dailyApi.editorials(),
    ])
    board.value = boardResult
    editorials.value = Object.fromEntries(
      editorialResult.problems.map((item) => [item.key, item]),
    )
  } catch (exc) {
    error.value = exc instanceof ApiError ? exc.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function redraw(): Promise<void> {
  redrawing.value = true
  try {
    board.value = await dailyApi.redraw()
  } catch (exc) {
    error.value = exc instanceof ApiError ? exc.message : '重抽失败'
  } finally {
    redrawing.value = false
  }
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
        <!--
          compact 是首页用的。首页上它是今天的主线，标题要压过周围的
          卡片标题，否则整个页面看起来全是同样重量的块，没有重点。
        -->
        <h2 :class="props.compact ? 'text-lg font-semibold tracking-tight' : 'text-sm font-medium'">每日一题</h2>
        <!--
          不显示倒计时。小时分钟一直在跳，看久了只会让人焦虑，而这是一天
          一次的东西——知道「凌晨四点换」就够了。
        -->
        <p class="mt-0.5 text-[11px] text-muted-foreground">凌晨四点刷新</p>
        <!-- 签到状态。只有登录后才显示——未登录没有「我」这个概念。 -->
        <p v-if="user && board" class="mt-1 flex flex-wrap items-center gap-x-2 text-[11px]">
          <span
            v-if="board.checked_in_today"
            class="flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-500"
          >
            <Check class="h-3 w-3" />
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
        <!--
          重抽是管理员功能，标出来。
          不标的话管理员会以为是普通操作，随手点了就把全站的题换掉——
          而其他人还在做原来那套。
        -->
        <Button
          v-if="!props.compact && isAdmin && board"
          variant="ghost"
          size="sm"
          :disabled="redrawing"
          @click="redraw"
        >
          <component
            :is="redrawing ? Loader2 : Shuffle"
            class="mr-1 h-3.5 w-3.5"
            :class="redrawing && 'animate-spin'"
          />
          重抽
          <span
            class="ml-1 rounded border border-border px-1 py-px text-[10px] font-normal text-muted-foreground"
          >
            管理员
          </span>
        </Button>
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
            <!-- 站内完成人数。这是成员之间的进度参照，比 CF 全站数字更有意义。 -->
            <span>{{ membersSolved(problem) }}</span>

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

        <Editorial :editorial="editorialFor(openEditorial)!" />
      </CardContent>
    </Card>
  </div>
</template>
