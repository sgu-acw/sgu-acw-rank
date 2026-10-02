<script setup lang="ts">
/**
 * 题单编辑页。
 *
 * 与公开的题单页分开：点进「编辑」看到的是可改的东西（加题、拖顺序、
 * 改备注、删题），而不是读者看的那一份。混在一起会让「我只是想看看」
 * 和「我要改」两件事互相干扰。
 *
 * 排序用拖拽。移动端也支持——sortablejs 自己处理触摸事件，HTML5 原生的
 * draggable 在触屏上不工作。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  GripVertical,
  Loader2,
  Plus,
} from 'lucide-vue-next'
import ProblemAdder from './ProblemAdder.vue'
import ProblemRow from './ProblemRow.vue'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { ApiError, problemListApi, type ProblemEntry, type ProblemListDetail } from '../lib/api'

const listId = ref(0)
const data = ref<ProblemListDetail | null>(null)
const loading = ref(true)
const error = ref('')
const notice = ref('')
const notFound = ref(false)

//: 正在改备注的题目 id。
const editingNoteId = ref<number | null>(null)
const noteDraft = ref('')

//: 加题表单是否展开。
const showAdder = ref(false)

const isCollection = computed(() => data.value?.kind === 'collection')

/**
 * 拖拽容器。
 *
 * 不给列表本身挂 ref：它们在 v-if 分支里，Vue 什么时候把 ref 填上是
 * 不保证的——实测 load() 里 nextTick 之后仍然拿不到，于是 Sortable.create
 * 收到 null，静默失败，拖不动也没有任何报错。
 *
 * 改成在根元素上挂一个 ref，再 querySelector 去找。根元素一定存在。
 */
const rootEl = ref<HTMLElement | null>(null)
let sortables: Sortable[] = []

function flash(message: string) {
  notice.value = message
  window.setTimeout(() => {
    if (notice.value === message) notice.value = ''
  }, 2500)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await problemListApi.get(listId.value)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound.value = true
    } else {
      error.value = err instanceof ApiError ? err.message : '加载失败'
    }
  } finally {
    loading.value = false
  }
}

/**
 * 挂上拖拽。
 *
 * 每次重新加载都要先销毁旧的：DOM 被 Vue 换过之后，旧的 Sortable 还指着
 * 已经不在页面上的节点，拖了不会报错但也没反应，很难查。
 */
function setupSortable() {
  for (const instance of sortables) instance.destroy()
  sortables = []

  const root = rootEl.value
  if (!root) return

  const problems = root.querySelector<HTMLElement>('[data-sortable="problems"]')
  const children = root.querySelector<HTMLElement>('[data-sortable="children"]')

  if (problems) {
    sortables.push(
      Sortable.create(problems, {
        handle: '[data-drag-handle]',
        animation: 150,
        // 触屏上长按 200ms 才开始拖，否则会和页面滚动打架。
        delayOnTouchOnly: true,
        delay: 200,
        onEnd: (event) => {
          if (event.oldIndex === undefined || event.newIndex === undefined) return
          if (event.oldIndex === event.newIndex) return
          void reorderProblems(event.oldIndex, event.newIndex)
        },
      }),
    )
  }

  if (children) {
    sortables.push(
      Sortable.create(children, {
        handle: '[data-drag-handle]',
        animation: 150,
        delayOnTouchOnly: true,
        delay: 200,
        onEnd: (event) => {
          if (event.oldIndex === undefined || event.newIndex === undefined) return
          if (event.oldIndex === event.newIndex) return
          void reorderChildren(event.oldIndex, event.newIndex)
        },
      }),
    )
  }
}

async function reorderProblems(from: number, to: number) {
  if (!data.value) return
  const items = [...data.value.problems]
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved)
  // 先本地更新，拖完立刻定住；失败再拉回真实顺序。
  data.value.problems = items

  try {
    const saved = await problemListApi.reorderProblems(
      listId.value,
      items.map((p) => p.id),
    )
    data.value.problems = saved
    flash('顺序已保存')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '排序失败'
    await load()
  }
}

async function reorderChildren(from: number, to: number) {
  if (!data.value) return
  const items = [...data.value.children]
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved)
  data.value.children = items

  try {
    await problemListApi.reorder(items.map((c) => c.id))
    flash('顺序已保存')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '排序失败'
    await load()
  }
}

async function removeProblem(problem: ProblemEntry) {
  if (!window.confirm(`从题单里移除「${problem.name || problem.key}」？`)) return
  try {
    await problemListApi.removeProblem(listId.value, problem.id)
    await load()
    flash('已移除')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '移除失败'
  }
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
    flash('已保存')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败'
  }
}

/** 改标题和说明。 */
const editingMeta = ref(false)
const metaTitle = ref('')
const metaDescription = ref('')

function startEditMeta() {
  if (!data.value) return
  editingMeta.value = true
  metaTitle.value = data.value.title
  metaDescription.value = data.value.description
}

async function saveMeta() {
  try {
    await problemListApi.update(listId.value, {
      title: metaTitle.value.trim(),
      description: metaDescription.value.trim(),
    })
    editingMeta.value = false
    await load()
    flash('已保存')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败'
  }
}

function go(path: string) {
  window.location.href = path
}

/*
 * 数据到位之后再挂拖拽。
 *
 * 用 watch + flush:'post' 而不是在 load() 里手动 nextTick：nextTick 只保证
 * 「下一次 DOM 更新之前」的回调时机，实测那时列表还没渲染出来，querySelector
 * 拿到 null，Sortable.create 收不到元素就静默失败——拖不动，也不报错。
 *
 * flush:'post' 是「DOM 更新之后」执行，正是这里需要的。
 */
watch(data, setupSortable, { flush: 'post' })

onMounted(async () => {
  const raw = new URLSearchParams(window.location.search).get('id')
  const parsed = Number(raw)
  if (!raw || !Number.isFinite(parsed)) {
    notFound.value = true
    loading.value = false
    return
  }
  listId.value = parsed
  await load()
})

onBeforeUnmount(() => {
  for (const instance of sortables) instance.destroy()
  sortables = []
})
</script>

<template>
  <div ref="rootEl" class="space-y-4">
    <button
      class="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      @click="go('/problems/admin')"
    >
      <ArrowLeft class="h-3.5 w-3.5" />
      管理题单
    </button>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>
    <Alert v-if="notice" class="flex items-start gap-2">
      <Check class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ notice }}</span>
    </Alert>

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <Card v-else-if="notFound">
      <CardContent class="space-y-3 py-10 text-center">
        <p class="text-sm text-muted-foreground">这个题单不存在，可能已经被删了。</p>
        <Button size="sm" @click="go('/problems/admin')">回到管理</Button>
      </CardContent>
    </Card>

    <template v-else-if="data">
      <!-- 标题与说明，可改 -->
      <div class="space-y-2">
        <div v-if="editingMeta" class="space-y-2">
          <Input v-model="metaTitle" placeholder="标题" class="h-10" />
          <Input v-model="metaDescription" placeholder="说明（可选）" class="h-10" />
          <div class="flex gap-2">
            <Button size="sm" @click="saveMeta">保存</Button>
            <Button variant="ghost" size="sm" @click="editingMeta = false">取消</Button>
          </div>
        </div>
        <div v-else class="flex flex-wrap items-baseline gap-2">
          <h1 class="text-lg font-semibold tracking-tight">{{ data.title }}</h1>
          <span class="text-xs text-muted-foreground">
            <template v-if="isCollection">{{ data.children.length }} 个题单</template>
            <template v-else>{{ data.problems.length }} 题</template>
          </span>
          <Button variant="ghost" size="sm" class="ml-auto" @click="startEditMeta">改标题</Button>
          <Button
            variant="ghost"
            size="sm"
            @click="go(`/problems/view?id=${data.id}`)"
            title="看读者看到的样子"
          >
            预览
          </Button>
        </div>
        <p v-if="!editingMeta && data.description" class="text-sm text-muted-foreground">
          {{ data.description }}
        </p>
      </div>

      <!-- 合集：拖拽排序子题单 -->
      <Card v-if="isCollection">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium">题单（可拖动排序）</CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <p v-if="!data.children.length" class="p-4 text-sm text-muted-foreground">
            这个合集里还没有题单。
          </p>
          <div v-else data-sortable="children" class="divide-y divide-border/40">
            <div
              v-for="child in data.children"
              :key="child.id"
              class="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4"
            >
              <span
                data-drag-handle
                class="shrink-0 cursor-grab touch-none text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
                title="拖动排序"
              >
                <GripVertical class="h-4 w-4" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline gap-x-2">
                  <span class="text-sm font-medium">{{ child.title }}</span>
                  <span class="text-[11px] text-muted-foreground">{{ child.total_problems }} 题</span>
                </div>
                <p v-if="child.description" class="truncate text-[11px] text-muted-foreground/70">
                  {{ child.description }}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="shrink-0"
                title="编辑这个题单"
                @click="go(`/problems/edit?id=${child.id}`)"
              >
                编辑
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 题单：拖拽排序题目 -->
      <Card v-else>
        <!--
          space-y-0 去掉 CardHeader 默认的 space-y-1.5（竖排的间距，横排时
          会把右边的按钮推下去）；py-3 让上下 padding 对称（默认 p-6 只改
          pb-3 会变成上 24 下 12，内容偏下）。
        -->
        <CardHeader class="flex flex-row items-center justify-between gap-2 space-y-0 py-3">
          <CardTitle class="text-sm font-medium">题目（可拖动排序）</CardTitle>
          <Button variant="outline" size="sm" @click="showAdder = !showAdder">
            <Plus class="mr-1 h-3.5 w-3.5" />
            加题
          </Button>
        </CardHeader>

        <CardContent v-if="showAdder" class="border-b border-border/40 pb-4">
          <ProblemAdder :list-id="listId" @added="load" />
        </CardContent>

        <CardContent class="p-0">
          <p v-if="!data.problems.length" class="p-4 text-sm text-muted-foreground">
            这个题单里还没有题目。点上面的「加题」开始。
          </p>
          <div v-else data-sortable="problems" class="divide-y divide-border/40">
            <div
              v-for="problem in data.problems"
              :key="problem.id"
              class="flex items-start gap-1"
            >
              <span
                data-drag-handle
                class="mt-3.5 shrink-0 cursor-grab touch-none pl-2 text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
                title="拖动排序"
              >
                <GripVertical class="h-4 w-4" />
              </span>
              <div class="min-w-0 flex-1">
                <ProblemRow
                  :problem="problem"
                  :show-progress="false"
                  editable
                  :editing-note="editingNoteId === problem.id"
                  :note-draft="noteDraft"
                  @update:note-draft="noteDraft = $event"
                  @edit-note="startEditNote(problem)"
                  @save-note="saveNote(problem)"
                  @cancel-note="editingNoteId = null"
                  @remove="removeProblem(problem)"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
