<script setup lang="ts">
/**
 * 每日一题。
 *
 * 每天三道，按难度分档各一道：800-1000 / 1100-1300 / 1400-1600。
 * 抽中的题当天固定，第二天凌晨 4 点（东八区）换——与练习数据的「一天」
 * 用同一个起点，免得出现「榜单算昨天、题目算今天」的错位。
 *
 * 三道题全站统一：抽签只由日期决定，与「谁在看」无关。
 */
import { computed, onMounted, ref } from 'vue'
import { Check, ChevronRight, ExternalLink, Loader2, RefreshCw, Shuffle } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import {
  ApiError,
  dailyApi,
  type CheckinBoard,
  type DailyProblemBoard,
  type DailyProblemEntry,
} from '../lib/api'
import { useAuth } from '../lib/auth'

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const { user, ensureLoaded } = useAuth()

const board = ref<DailyProblemBoard | null>(null)
const checkin = ref<CheckinBoard | null>(null)
const loading = ref(true)
const error = ref('')
const redrawing = ref(false)

const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'root')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    // 两个请求一起发，串行的话签到榜要等题目加载完才开始。
    const [boardResult, checkinResult] = await Promise.all([
      dailyApi.get(),
      dailyApi.checkin(),
    ])
    board.value = boardResult
    checkin.value = checkinResult
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
    checkin.value = await dailyApi.checkin()
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

    <!-- 三道题 -->
    <div v-else-if="board" class="grid gap-3 md:grid-cols-3">
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
          </div>
        </CardContent>
      </Card>
    </div>

    <!--
      签到排行榜。做对当天的每日一题里任意一道就算签到。
      只列签过到的人——一次没签过不是「0 天」，更接近「没参加」。
    -->
    <a
      v-if="props.compact && checkin"
      href="/daily"
      class="row-action group -mx-1 flex items-center gap-2 rounded-lg px-1.5 py-2 text-xs text-muted-foreground"
    >
      <span>签到排行</span>
      <span class="font-mono tabular-nums">{{ checkin.total_members }} 人</span>
      <ChevronRight class="ml-auto h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
    </a>

    <Card v-if="!props.compact && checkin && checkin.entries.length">
      <CardContent class="p-0">
        <div class="px-4 py-3">
          <h3 class="text-sm font-medium">
            签到排行
            <span class="ml-1 font-normal text-muted-foreground">
              {{ checkin.total_members }} 人
            </span>
          </h3>
        </div>

        <div class="divide-y divide-border/40 border-t border-border/40">
          <div
            v-for="entry in checkin.entries"
            :key="entry.user_id"
            class="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-muted/30"
          >
            <span
              class="w-6 shrink-0 text-center font-mono text-xs"
              :class="entry.rank <= 3 ? 'font-semibold text-foreground' : 'text-muted-foreground'"
            >
              {{ entry.rank }}
            </span>

            <div class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
              <a
                :href="`/member?id=${entry.user_id}`"
                class="truncate text-sm font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                {{ entry.display_name }}
              </a>
              <span v-if="entry.class_label" class="text-[11px] text-muted-foreground/70">
                {{ entry.class_label }}
              </span>
            </div>

            <!--
              连续天数放在前面，因为它就是排序依据——榜单上名次怎么来的，
              一眼要看得出来。

              连续 0 也要显示（写成「已中断」）。不显示的话，一个两个月没
              签到的人靠着历史累计排在榜上，看起来却和别人一样积极，那比
              不显示更误导。
            -->
            <span
              class="shrink-0 rounded px-1.5 py-0.5 font-mono text-sm font-semibold"
              :class="
                entry.streak > 0
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground/60'
              "
            >
              <template v-if="entry.streak > 0">连续 {{ entry.streak }} 天</template>
              <template v-else>已中断</template>
            </span>

            <!-- 累计天数。断过签的也算，只是不参与排序。 -->
            <span class="shrink-0 font-mono text-[11px] text-muted-foreground">
              累计 {{ entry.days }} 天
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
