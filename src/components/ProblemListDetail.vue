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
  ExternalLink,
  FolderOpen,
  Loader2,
} from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Card, CardContent } from './ui/card'
import { ApiError, PLATFORM_META, problemListApi, type ProblemListDetail } from '../lib/api'
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

const showProgress = computed(() => !!user.value)
const isCollection = computed(() => data.value?.kind === 'collection')

function percent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((done / total) * 100)
}

/** 难度的显示方式各平台不同：CF 是 rating 数字，洛谷是 1~7 的等级。 */
function difficultyLabel(platform: string, rating: number | null): string {
  if (rating == null) return ''
  if (platform === 'luogu') {
    return ['暂无评定', '入门', '普及−', '普及/提高−', '普及+/提高', '提高+/省选−', '省选/NOI−', 'NOI/NOI+/CTSC'][rating] ?? `等级 ${rating}`
  }
  return String(rating)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await problemListApi.get(listId.value)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function go(path: string) {
  window.location.href = path
}

onMounted(async () => {
  const raw = new URLSearchParams(window.location.search).get('id')
  const parsed = Number(raw)
  if (!raw || !Number.isFinite(parsed)) {
    error.value = '题单不存在'
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
      @click="go('/problems')"
    >
      <ChevronLeft class="h-3.5 w-3.5" />
      题单
    </button>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

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
          @click="go(`/problems/${child.id}`)"
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

      <!-- 题单：题目清单 -->
      <Card v-else>
        <CardContent class="p-0">
          <p v-if="!data.problems.length" class="p-6 text-center text-sm text-muted-foreground">
            这个题单里还没有题目。
          </p>

          <div v-else class="divide-y divide-border/40">
            <div
              v-for="problem in data.problems"
              :key="problem.id"
              class="flex items-center gap-3 px-4 py-3"
            >
              <!-- 完成状态。未登录时留出等宽占位，免得整列跳动。 -->
              <span
                v-if="showProgress"
                class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]"
                :class="
                  problem.done
                    ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500'
                    : 'border-border text-transparent'
                "
                :title="problem.done ? '已完成' : '未完成'"
              >
                ✓
              </span>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline gap-x-2">
                  <a
                    :href="problem.url"
                    target="_blank"
                    rel="noreferrer"
                    class="truncate text-sm font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
                  >
                    {{ problem.name || problem.key }}
                  </a>
                  <span class="shrink-0 font-mono text-[11px] text-muted-foreground/60">
                    {{ problem.key }}
                  </span>
                  <span class="shrink-0 text-[11px] text-muted-foreground/70">
                    {{ PLATFORM_META[problem.platform]?.label ?? problem.platform }}
                  </span>
                  <span
                    v-if="difficultyLabel(problem.platform, problem.rating)"
                    class="shrink-0 rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {{ difficultyLabel(problem.platform, problem.rating) }}
                  </span>
                </div>

                <p v-if="problem.missing_reason" class="mt-0.5 text-[11px] text-amber-600/80 dark:text-amber-500/80">
                  {{ problem.missing_reason }}
                </p>
                <p v-else-if="problem.note" class="mt-0.5 text-[11px] text-muted-foreground/70">
                  {{ problem.note }}
                </p>

                <div v-if="problem.tags.length" class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-for="tag in problem.tags"
                    :key="tag"
                    class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>

              <a
                :href="problem.url"
                target="_blank"
                rel="noreferrer"
                class="shrink-0 rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                title="去平台上做这道题"
              >
                <ExternalLink class="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
