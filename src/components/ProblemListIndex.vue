<script setup lang="ts">
/**
 * 题单总览。
 *
 * 顶层同时列出合集和散装题单——题单既可以在合集里，也可以和合集平级，
 * 这是需求里明确要的。合集显示它下面所有题单的合计完成度。
 *
 * 未登录时不显示进度条：谁能过哪些题是个人数据，不该公开给所有人看。
 */
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, ChevronRight, FolderOpen, ListChecks, Loader2, Settings } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { ApiError, problemListApi, type ProblemListSummary } from '../lib/api'
import { useAuth } from '../lib/auth'

const { user, ensureLoaded } = useAuth()

const lists = ref<ProblemListSummary[]>([])
const loading = ref(true)
const error = ref('')

/** 未登录时进度不可信，整块隐藏。 */
const showProgress = computed(() => !!user.value)

async function load() {
  loading.value = true
  error.value = ''
  try {
    lists.value = await problemListApi.list()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function percent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((done / total) * 100)
}

function go(path: string) {
  window.location.href = path
}

onMounted(async () => {
  await ensureLoaded()
  await load()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold tracking-tight">题单</h1>
      </div>
      <!--
        未登录时 user 是 null，``user?.role !== 'member'`` 会算成
        ``undefined !== 'member'`` 也就是 true，按钮就露出来了。所以要
        先判 user 存在。
      -->
      <Button
        v-if="user && user.role !== 'member'"
        size="sm"
        @click="go('/problems/admin')"
      >
        <Settings class="mr-1 h-3.5 w-3.5" />
        管理工作台
      </Button>
    </div>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <Card v-else-if="!lists.length">
      <CardContent class="py-10 text-center text-sm text-muted-foreground">
        还没有题单
      </CardContent>
    </Card>

    <div v-else class="space-y-2">
      <button
        v-for="item in lists"
        :key="item.id"
        class="surface-action group flex w-full items-start gap-3 rounded-lg border border-border/50 bg-card px-4 py-3.5 text-left"
        @click="go(`/problems/view?id=${item.id}`)"
      >
        <!-- 合集和题单用不同图标，一眼能分清 -->
        <component
          :is="item.kind === 'collection' ? FolderOpen : ListChecks"
          class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        />

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="text-sm font-medium transition-colors group-hover:text-primary">{{ item.title }}</span>
            <span class="text-[11px] text-muted-foreground">
              <template v-if="item.kind === 'collection'">
                {{ item.item_count }} 个题单 · {{ item.total_problems }} 题
              </template>
              <template v-else>{{ item.total_problems }} 题</template>
            </span>
          </div>
          <p v-if="item.description" class="mt-0.5 truncate text-xs text-muted-foreground/70">
            {{ item.description }}
          </p>

          <!-- 进度条。未登录不显示。 -->
          <div v-if="showProgress && item.total_problems > 0" class="mt-2 flex items-center gap-2">
            <div class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full bg-primary transition-[width] duration-300 ease-[var(--ease-out)]"
                :style="{ width: `${percent(item.done_count, item.total_problems)}%` }"
              />
            </div>
            <span class="shrink-0 font-mono text-[11px] text-muted-foreground">
              {{ item.done_count }}/{{ item.total_problems }}
            </span>
          </div>
        </div>

        <ChevronRight
          class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40 transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
        />
      </button>
    </div>
  </div>
</template>
