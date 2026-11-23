<script setup lang="ts">
/**
 * 题单总览。
 *
 * 顶层同时列出合集和散装题单，支持按关键词快速筛选。
 * 未登录时不显示进度条：过题进度属于个人数据。
 */
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, CheckCircle2, ChevronRight, FolderOpen, ListChecks, Search } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Card, CardContent } from './ui/card'
import { Input } from './ui/input'
import { ApiError, problemListApi, type ProblemListSummary } from '../lib/api'
import { useAuth } from '../lib/auth'

const { user, ensureLoaded } = useAuth()

const lists = ref<ProblemListSummary[]>([])
const loading = ref(true)
const error = ref('')
const query = ref('')

const showProgress = computed(() => !!user.value)

const filteredLists = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return lists.value
  return lists.value.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q),
  )
})

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
  import('astro:transitions/client').then(({ navigate }) => navigate(path))
}

onMounted(() => {
  void Promise.all([ensureLoaded(), load()])
})
</script>

<template>
  <div class="space-y-4">
    <div class="page-header">
      <div>
        <h1 class="page-title">题单</h1>
        <p class="page-subtitle">按算法专题整理的训练题单与合集</p>
      </div>
      <div v-if="!loading && lists.length > 3" class="relative w-full sm:w-64">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          v-model="query"
          aria-label="筛选题单"
          placeholder="搜索题单标题或说明…"
          class="h-9 pl-8 text-sm"
        />
      </div>
    </div>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <div v-if="loading" class="space-y-2">
      <div v-for="i in 4" :key="i" class="h-16 animate-pulse rounded-lg border border-border/40 bg-card/60" />
    </div>

    <Card v-else-if="!lists.length">
      <CardContent class="py-10 text-center text-sm text-muted-foreground">
        还没有题单
      </CardContent>
    </Card>

    <Card v-else-if="!filteredLists.length">
      <CardContent class="py-10 text-center text-sm text-muted-foreground">
        没有匹配的题单
      </CardContent>
    </Card>

    <div v-else class="space-y-2">
      <button
        v-for="item in filteredLists"
        :key="item.id"
        type="button"
        class="surface-card surface-action group flex w-full items-start gap-3 px-4 py-3.5 text-left"
        @click="go(`/problems/view?id=${item.id}`)"
      >
        <component
          :is="item.kind === 'collection' ? FolderOpen : ListChecks"
          class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        />

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span class="text-sm font-medium transition-colors group-hover:text-primary">{{ item.title }}</span>
            <span class="text-[11px] text-muted-foreground">
              <template v-if="item.kind === 'collection'">
                {{ item.item_count }} 个题单 · {{ item.total_problems }} 题
              </template>
              <template v-else>{{ item.total_problems }} 题</template>
            </span>
            <span
              v-if="showProgress && item.total_problems > 0 && item.done_count >= item.total_problems"
              class="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-500"
            >
              <CheckCircle2 class="h-3 w-3" />
              已完成
            </span>
          </div>
          <p v-if="item.description" class="mt-0.5 truncate text-xs text-muted-foreground/75">
            {{ item.description }}
          </p>

          <div v-if="showProgress && item.total_problems > 0" class="mt-2 flex items-center gap-2">
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out)]"
                :class="item.done_count >= item.total_problems ? 'bg-emerald-500' : 'bg-primary'"
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
