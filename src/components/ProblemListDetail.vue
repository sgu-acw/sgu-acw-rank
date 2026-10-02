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
  Plus,
} from 'lucide-vue-next'
import ProblemAdder from './ProblemAdder.vue'
import ProblemRow from './ProblemRow.vue'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import {
  ApiError,
  problemListApi,
  type ProblemEntry,
  type ProblemListDetail,
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

const showProgress = computed(() => !!user.value)
/** 管理员在详情页也能直接改题目，不用跳到管理页。 */
const canManage = computed(() => !!user.value && user.value.role !== 'member')

//: 正在改备注的题目 id。
const editingNoteId = ref<number | null>(null)
const noteDraft = ref('')

//: 加题表单是否展开。默认收起，免得只想看题的人被表单挡住。
const showAdder = ref(false)

async function onAdded() {
  await load()
}

function startEditNote(problem: ProblemEntry) {
  editingNoteId.value = problem.id
  noteDraft.value = problem.note
}

async function saveNote(problem: ProblemEntry) {
  try {
    await problemListApi.updateProblem(listId.value, problem.id, { note: noteDraft.value.trim() })
    editingNoteId.value = null
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败'
  }
}

async function removeProblem(problem: ProblemEntry) {
  if (!window.confirm(`从题单里移除「${problem.name || problem.key}」？`)) return
  try {
    await problemListApi.removeProblem(listId.value, problem.id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '移除失败'
  }
}

/** 上移或下移一道题。后端收完整顺序，所以先算好新顺序再整串发。 */
async function moveProblem(index: number, delta: number) {
  if (!data.value) return
  const target = index + delta
  if (target < 0 || target >= data.value.problems.length) return

  const reordered = [...data.value.problems]
  const [moved] = reordered.splice(index, 1)
  reordered.splice(target, 0, moved)
  data.value.problems = reordered

  try {
    const saved = await problemListApi.reorderProblems(
      listId.value,
      reordered.map((p) => p.id),
    )
    data.value.problems = saved
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '排序失败'
    await load()
  }
}
const isCollection = computed(() => data.value?.kind === 'collection')

function percent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((done / total) * 100)
}


async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await problemListApi.get(listId.value)
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

      <!-- 题单：题目清单 -->
      <Card v-else>
        <!--
          管理员可以直接在这里加题。之前只有管理页能加，从合集点进题单
          看到缺题也没法补，得先退出去找到那个题单。
        -->
        <CardHeader v-if="canManage" class="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle class="text-sm font-medium">题目</CardTitle>
          <Button variant="outline" size="sm" @click="showAdder = !showAdder">
            <Plus class="mr-1 h-3.5 w-3.5" />
            加题
          </Button>
        </CardHeader>
        <CardContent v-if="canManage && showAdder" class="border-b border-border/40 pb-4">
          <ProblemAdder :list-id="listId" @added="onAdded" />
        </CardContent>

        <CardContent class="p-0">
          <p v-if="!data.problems.length" class="p-6 text-center text-sm text-muted-foreground">
            这个题单里还没有题目。
          </p>

          <div v-else class="divide-y divide-border/40">
            <ProblemRow
              v-for="(problem, index) in data.problems"
              :key="problem.id"
              :problem="problem"
              :show-progress="showProgress"
              :editable="canManage"
              :editing-note="editingNoteId === problem.id"
              :note-draft="noteDraft"
              :can-move-up="index > 0"
              :can-move-down="index < data.problems.length - 1"
              @update:note-draft="noteDraft = $event"
              @move="(delta) => moveProblem(index, delta)"
              @edit-note="startEditNote(problem)"
              @save-note="saveNote(problem)"
              @cancel-note="editingNoteId = null"
              @remove="removeProblem(problem)"
            />
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
