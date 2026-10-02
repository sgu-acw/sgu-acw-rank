<script setup lang="ts">
/**
 * 题单详情。
 *
 * 合集进去是一堆子题单，题单进去是题目清单。两种形态共用一个页面，
 * 因为它们的头部（标题、描述、完成度）是一样的。
 *
 * 每道题显示题名、难度、标签、是否完成，点击跳转对应平台。
 * 未登录时不显示完成状态——进度是个人数据。
 */
import { computed, onMounted, ref } from 'vue'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Loader2,
} from 'lucide-vue-next'
import ProblemRow from './ProblemRow.vue'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import {
  ApiError,
  problemListApi,
  type ProblemListDetail,
  type ProblemListRank,
} from '../lib/api'
import { useAuth } from '../lib/auth'

const { user, ensureLoaded } = useAuth()

/**
 * 题单 id 从查询参数里取。
 *
 * 本站是纯静态输出，构建时不知道有哪些题单，所以不能用 /problems/3
 * 这种路径——那需要 getStaticPaths 列举所有 id。与成员资料页同样的处理。
 *
 * 必须在 onMounted 里读 window，服务端渲染时没有 location。
 */
const listId = ref(0)

const data = ref<ProblemListDetail | null>(null)
const loading = ref(true)
const error = ref('')
/** 题单不存在（而不是加载失败）。两种情况的界面不一样。 */
const notFound = ref(false)

/** 完成度排行榜。合集不显示——那要先把子题单的题合并，意义不大。 */
const rank = ref<ProblemListRank | null>(null)
const rankLoading = ref(false)
/** 榜单是否展开。默认收起，免得盖住题目列表。 */
const showRank = ref(false)

/** 合集进去是一堆子题单，题单进去是题目清单。 */
const isCollection = computed(() => data.value?.kind === 'collection')

const showProgress = computed(() => !!user.value)

function percent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((done / total) * 100)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await problemListApi.get(listId.value)
    // 排行单独拉，失败不影响题目列表。
    if (data.value.kind === 'list') {
      rankLoading.value = true
      try {
        rank.value = await problemListApi.rank(listId.value)
      } catch {
        rank.value = null
      } finally {
        rankLoading.value = false
      }
    }
  } catch (err) {
    // 404 和「网络坏了」是两回事：前者是这个题单没有，后者是等一下就好。
    if (err instanceof ApiError && err.status === 404) {
      notFound.value = true
    } else {
      error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
    }
  } finally {
    loading.value = false
  }
}

function go(path: string) {
  window.location.href = path
}

/**
 * 返回按钮去哪。
 *
 * 从合集点进来的题单，返回该回到那个合集——直接扔回顶层列表会让人
 * 丢掉刚才的位置，想再看下一个子题单还得重新找一遍。
 */
const backTarget = computed(() => {
  if (data.value?.collection_id) {
    return { href: `/problems/view?id=${data.value.collection_id}`, label: '合集' }
  }
  return { href: '/problems', label: '题单' }
})

onMounted(async () => {
  const raw = new URLSearchParams(window.location.search).get('id')
  const parsed = Number(raw)
  if (!raw || !Number.isFinite(parsed)) {
    notFound.value = true
    loading.value = false
    return
  }
  listId.value = parsed

  await ensureLoaded()
  await load()
})
</script>

<template>
  <div class="space-y-4">
    <button
      class="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      @click="go(backTarget.href)"
    >
      <ChevronLeft class="h-3.5 w-3.5" />
      {{ backTarget.label }}
    </button>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <!--
      题单不存在。给一条明确的出路，别让人卡在空页面上——
      链接可能是旧的，或者题单已经被删了。
    -->
    <Card v-else-if="notFound">
      <CardContent class="space-y-3 py-10 text-center">
        <p class="text-sm text-muted-foreground">这个题单不存在，可能已经被删了。</p>
        <Button size="sm" @click="go('/problems')">看看其他题单</Button>
      </CardContent>
    </Card>

    <template v-else-if="data">
      <!-- 头部：标题、描述、完成度 -->
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <component
            :is="isCollection ? FolderOpen : undefined"
            v-if="isCollection"
            class="h-4 w-4 text-muted-foreground"
          />
          <h1 class="text-lg font-semibold tracking-tight">{{ data.title }}</h1>
          <span class="text-xs text-muted-foreground">
            <template v-if="isCollection">
              {{ data.item_count }} 个题单 · {{ data.total_problems }} 题
            </template>
            <template v-else>{{ data.total_problems }} 题</template>
          </span>
        </div>

        <p v-if="data.description" class="mt-1 text-sm text-muted-foreground">
          {{ data.description }}
        </p>

        <div v-if="showProgress && data.total_problems > 0" class="mt-3 flex items-center gap-2">
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-primary transition-[width] duration-300 ease-[var(--ease-out)]"
              :style="{ width: `${percent(data.done_count, data.total_problems)}%` }"
            />
          </div>
          <span class="shrink-0 font-mono text-xs text-muted-foreground">
            {{ data.done_count }}/{{ data.total_problems }}（{{ percent(data.done_count, data.total_problems) }}%）
          </span>
        </div>
      </div>

      <!-- 合集：子题单 -->
      <div v-if="isCollection" class="space-y-2">
        <p v-if="!data.children.length" class="py-6 text-center text-sm text-muted-foreground">
          这个合集里还没有题单。
        </p>
        <button
          v-for="child in data.children"
          :key="child.id"
          class="group flex w-full items-center gap-3 rounded-lg border border-border/50 bg-card px-4 py-3 text-left transition-colors hover:border-border hover:bg-muted/30 active:scale-[0.995]"
          @click="go(`/problems/view?id=${child.id}`)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <span class="text-sm font-medium">{{ child.title }}</span>
              <span class="text-[11px] text-muted-foreground">{{ child.total_problems }} 题</span>
            </div>
            <p v-if="child.description" class="mt-0.5 truncate text-xs text-muted-foreground/70">
              {{ child.description }}
            </p>
            <div v-if="showProgress && child.total_problems > 0" class="mt-2 flex items-center gap-2">
              <div class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary transition-[width] duration-300 ease-[var(--ease-out)]"
                  :style="{ width: `${percent(child.done_count, child.total_problems)}%` }"
                />
              </div>
              <span class="shrink-0 font-mono text-[11px] text-muted-foreground">
                {{ child.done_count }}/{{ child.total_problems }}
              </span>
            </div>
          </div>
          <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      <!--
        完成度排行榜。谁做了多少，一眼看得到。
        默认收起，免得盖住题目列表——看题单的人多半是来问题目的。
      -->
      <Card v-if="!isCollection && rank?.entries.length">
        <!--
          这一串覆盖 class 每一个都不能少：

          * ``space-y-1.5`` 要去掉。CardHeader 默认是竖排（flex-col
            space-y-1.5），改成横排之后那个 space-y 还在，会给第二个子元素
            （右边的按钮）加 6px 的 margin-top，把它往下推。
          * ``items-center`` 就够了。试过 items-baseline，但那是在有 margin
            偏移的情况下调的，去掉 space-y 之后反而不准。
        -->
        <CardHeader class="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle class="text-sm font-medium">
            完成度排行
            <span class="ml-1 font-normal text-muted-foreground">
              {{ rank.entries.length }} 人
            </span>
          </CardTitle>
          <Button variant="ghost" size="sm" @click="showRank = !showRank">
            {{ showRank ? '收起' : '展开' }}
          </Button>
        </CardHeader>

        <CardContent v-if="showRank" class="p-0">
          <div class="divide-y divide-border/40">
            <div
              v-for="(entry, index) in rank.entries"
              :key="entry.user_id"
              class="flex items-end gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4"
            >
              <!--
                名次和百分比都跟进度条对齐（items-end + 底边留白）。
                行里有两层：姓名一行、进度条一行。垂直居中的话，右侧的
                百分比会落在两行之间，看起来是浮着的。
              -->
              <span
                class="w-6 shrink-0 pb-0.5 text-center font-mono text-xs"
                :class="index < 3 ? 'font-semibold text-foreground' : 'text-muted-foreground'"
              >
                {{ index + 1 }}
              </span>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline gap-x-2">
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

                <!-- 进度条。长度直接对比，比只给数字直观。 -->
                <div class="mt-1.5 flex items-center gap-2">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      class="h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out)]"
                      :class="entry.done_count > 0 ? 'bg-primary/70' : 'bg-transparent'"
                      :style="{ width: `${entry.percent}%` }"
                    />
                  </div>
                  <span class="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {{ entry.done_count }}/{{ entry.total }}
                  </span>
                </div>
              </div>

              <span class="shrink-0 pb-0.5 font-mono text-sm font-semibold">
                {{ entry.percent }}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 题单：题目清单 -->
      <Card v-else>
        <CardContent class="p-0">
          <p v-if="!data.problems.length" class="p-6 text-center text-sm text-muted-foreground">
            这个题单里还没有题目。
          </p>

          <div v-else class="divide-y divide-border/40">
            <ProblemRow
              v-for="problem in data.problems"
              :key="problem.id"
              :problem="problem"
              :show-progress="showProgress"
            />
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
