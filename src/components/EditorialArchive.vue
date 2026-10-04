<script setup lang="ts">
/**
 * 往日的每日一题。
 *
 * 列出有题目的日期，点开看那天的三道题和题解。过去的日子已经结束，
 * 不该还能签到，所以这里只读。
 *
 * 题解按公布状态分三种显示：已公布（可展开）、生成失败、还没生成。
 * 服务端只返回已公布的内容，所以这里不用做权限判断。
 */
import { onMounted, ref } from 'vue'
import { AlertCircle, BookOpen, ChevronRight, History, Loader2 } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import Editorial from './Editorial.vue'
import {
  ApiError,
  dailyApi,
  type DayEditorials,
  type EditorialView,
  type RecentDay,
} from '../lib/api'

const days = ref<RecentDay[]>([])
const loading = ref(true)
const error = ref('')

/** 当前展开的日期。同时只开一天。 */
const openDay = ref<string | null>(null)
const dayEditorials = ref<DayEditorials | null>(null)
const dayLoading = ref(false)
/** 展开着题解的题号。 */
const openEditorial = ref<string | null>(null)

function formatDay(day: string): string {
  const [, month, date] = day.split('-')
  return `${Number(month)} 月 ${Number(date)} 日`
}

function weekday(day: string): string {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return names[new Date(`${day}T00:00:00`).getDay()] ?? ''
}

function editorialFor(key: string): EditorialView | null {
  return dayEditorials.value?.problems.find((p) => p.key === key) ?? null
}

/**
 * 题解入口要不要显示。
 *
 * 只有已公布的才显示。往日里未公布的多半是生成失败或还在跑，对查阅的人
 * 来说等于「没有这道题的题解」——给个点进去写「正在生成」的入口没有意义。
 */
function hasEditorial(key: string): boolean {
  return editorialFor(key)?.available === true
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    days.value = await dailyApi.recentDays(60)
  } catch (exc) {
    error.value = exc instanceof ApiError ? exc.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function toggleDay(day: string) {
  if (openDay.value === day) {
    openDay.value = null
    dayEditorials.value = null
    openEditorial.value = null
    return
  }

  openDay.value = day
  openEditorial.value = null
  dayEditorials.value = null
  dayLoading.value = true
  try {
    dayEditorials.value = await dailyApi.editorials(day)
  } catch (exc) {
    error.value = exc instanceof ApiError ? exc.message : '加载失败'
    openDay.value = null
  } finally {
    dayLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <h2 class="flex items-center gap-2 text-sm font-medium">
      <History class="h-4 w-4 text-muted-foreground" />
      往日
    </h2>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <div v-if="loading" class="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <p v-else-if="!days.length" class="py-6 text-center text-sm text-muted-foreground">
      还没有往日的记录
    </p>

    <div v-else class="space-y-2">
      <div v-for="item in days" :key="item.day">
        <!-- 日期行 -->
        <button
          type="button"
          class="row-action flex w-full items-center gap-3 rounded-lg border border-border/50 px-4 py-3 text-left"
          :aria-expanded="openDay === item.day"
          @click="toggleDay(item.day)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <span class="text-sm font-medium">{{ formatDay(item.day) }}</span>
              <span class="text-xs text-muted-foreground">{{ weekday(item.day) }}</span>
            </div>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ item.problem_count }} 道题
              <template v-if="item.editorial_count > 0">
                · {{ item.editorial_count }} 篇题解
              </template>
            </p>
          </div>

          <ChevronRight
            class="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform duration-150"
            :class="openDay === item.day && 'rotate-90'"
          />
        </button>

        <!-- 展开的那天 -->
        <div v-if="openDay === item.day" class="mt-2 space-y-2 pl-3 sm:pl-4">
          <div v-if="dayLoading" class="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 class="h-3.5 w-3.5 animate-spin" />
            正在读取…
          </div>

          <template v-else-if="dayEditorials">
            <div
              v-for="problem in dayEditorials.problems"
              :key="problem.key"
              class="rounded-lg border border-border/40"
            >
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5">
                <span class="font-mono text-xs text-muted-foreground">{{ problem.key }}</span>
                <a
                  :href="problem.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-sm font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
                >
                  {{ problem.name || '（题名待抓取）' }}
                </a>
                <span v-if="problem.rating" class="font-mono text-[11px] text-muted-foreground">
                  {{ problem.rating }} 分
                </span>

                <button
                  v-if="hasEditorial(problem.key)"
                  type="button"
                  class="ml-auto flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-medium transition-colors hover:text-primary"
                  :class="openEditorial === problem.key ? 'text-primary' : 'text-muted-foreground'"
                  :aria-expanded="openEditorial === problem.key"
                  @click="openEditorial = openEditorial === problem.key ? null : problem.key"
                >
                  <BookOpen class="h-3 w-3" />
                  题解
                </button>
              </div>

              <div
                v-if="openEditorial === problem.key && hasEditorial(problem.key)"
                class="border-t border-border/40 px-3 py-3"
              >
                <Editorial :editorial="editorialFor(problem.key)!" />
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
