<script setup lang="ts">
/**
 * 题单管理。管理员在这里增删改查题单和题目。
 *
 * 两种形态：合集（装题单）和题单（装题目）。合集里不能再放合集——
 * 只允许两层，嵌套会让完成度计算和界面都复杂很多。
 *
 * 加题时填平台和题号，题号离开焦点会自动去查题目名。查不到就标红提示，
 * 免得填错了要到列表里才发现。
 */
import { computed, onMounted, ref } from 'vue'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Separator } from './ui/separator'
import {
  ApiError,
  PLATFORM_META,
  PROBLEM_KEY_HINT,
  problemListApi,
  type Platform,
  type ProblemListSummary,
} from '../lib/api'

const lists = ref<ProblemListSummary[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')

const PLATFORMS = Object.keys(PLATFORM_META) as Platform[]

//: 正在编辑的题单 id。null 表示没有在编辑。
const editingId = ref<number | null>(null)
const editTitle = ref('')
const editDescription = ref('')

//: 新建表单。
const showCreate = ref(false)
const newKind = ref<'collection' | 'list'>('list')
const newTitle = ref('')
const newDescription = ref('')
const newCollectionId = ref<number | null>(null)
const creating = ref(false)

//: 加题表单。key 是题单 id，值为该题单正在输入的内容。
const addingTo = ref<number | null>(null)
const newPlatform = ref<Platform>('codeforces')
const newKey = ref('')
const newNote = ref('')
const adding = ref(false)
//: 题号校验结果。null 表示还没查过。
const lookupState = ref<
  | null
  | { status: 'loading' }
  | { status: 'ok'; name: string; rating: number | null; tags: string[] }
  | { status: 'bad'; reason: string }
>(null)

const refreshing = ref(false)

const collections = computed(() => lists.value.filter((l) => l.kind === 'collection'))
/** 不属于任何合集的题单。合集内的那些在各自合集下面显示，不重复列。 */
const standalone = computed(
  () => lists.value.filter((l) => l.kind === 'list' && l.collection_id == null),
)

/**
 * 合集 id → 它下面的题单。
 *
 * 合集里的题单也要能加题，否则放进合集就等于失去了编辑入口。
 */
const childrenOf = computed(() => {
  const map = new Map<number, ProblemListSummary[]>()
  for (const item of lists.value) {
    if (item.collection_id == null) continue
    const bucket = map.get(item.collection_id) ?? []
    bucket.push(item)
    map.set(item.collection_id, bucket)
  }
  return map
})

/** 合集里所有题单，拍平了用于排序。 */
const nestedLists = computed(() => lists.value.filter((l) => l.collection_id != null))

function flash(message: string) {
  notice.value = message
  window.setTimeout(() => {
    if (notice.value === message) notice.value = ''
  }, 3000)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    // 要连合集内部的题单一起拿，否则看不到它们、也没法加题。
    lists.value = await problemListApi.list({ include_nested: true })
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function create() {
  if (!newTitle.value.trim()) return
  creating.value = true
  error.value = ''
  try {
    await problemListApi.create({
      kind: newKind.value,
      title: newTitle.value.trim(),
      description: newDescription.value.trim(),
      collection_id: newKind.value === 'list' ? newCollectionId.value : null,
    })
    newTitle.value = ''
    newDescription.value = ''
    newCollectionId.value = null
    showCreate.value = false
    flash('已创建')
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '创建失败'
  } finally {
    creating.value = false
  }
}

function startEdit(item: ProblemListSummary) {
  editingId.value = item.id
  editTitle.value = item.title
  editDescription.value = item.description
}

async function saveEdit(id: number) {
  try {
    await problemListApi.update(id, {
      title: editTitle.value.trim(),
      description: editDescription.value.trim(),
    })
    editingId.value = null
    flash('已保存')
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败'
  }
}

async function remove(item: ProblemListSummary) {
  const what = item.kind === 'collection' ? '合集' : '题单'
  const extra =
    item.kind === 'collection' && item.item_count > 0
      ? `\n里面的 ${item.item_count} 个题单不会被删除，只是不再属于这个合集。`
      : ''
  if (!window.confirm(`删除${what}「${item.title}」？${extra}`)) return

  try {
    await problemListApi.remove(item.id)
    flash('已删除')
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败'
  }
}

async function move(item: ProblemListSummary, delta: number) {
  const siblings = item.kind === 'collection' ? collections.value : standalone.value
  const index = siblings.findIndex((s) => s.id === item.id)
  const target = index + delta
  if (target < 0 || target >= siblings.length) return

  const reordered = [...siblings]
  const [moved] = reordered.splice(index, 1)
  reordered.splice(target, 0, moved)

  try {
    await problemListApi.reorder(reordered.map((s) => s.id))
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '排序失败'
  }
}

/**
 * 题号离开输入框时查一次题目信息。
 *
 * 光看「1004A」看不出是哪个平台哪道题，填错了要到列表里才发现。查一次
 * 把题名显示出来，当场就能核对。
 */
async function lookupKey() {
  const key = newKey.value.trim()
  if (!key) {
    lookupState.value = null
    return
  }

  lookupState.value = { status: 'loading' }
  try {
    const result = await problemListApi.lookup(newPlatform.value, key)
    if (result.missing_reason) {
      lookupState.value = { status: 'bad', reason: result.missing_reason }
    } else {
      lookupState.value = {
        status: 'ok',
        name: result.name,
        rating: result.rating,
        tags: result.tags,
      }
    }
  } catch (err) {
    lookupState.value = {
      status: 'bad',
      reason: err instanceof ApiError ? err.message : '查询失败',
    }
  }
}

async function addProblem(listId: number) {
  const key = newKey.value.trim()
  if (!key) return
  if (lookupState.value?.status === 'bad') return

  adding.value = true
  error.value = ''
  try {
    await problemListApi.addProblem(listId, {
      platform: newPlatform.value,
      key,
      note: newNote.value.trim(),
    })
    newKey.value = ''
    newNote.value = ''
    lookupState.value = null
    addingTo.value = null
    flash('已添加')
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '添加失败'
  } finally {
    adding.value = false
  }
}

async function refreshCodeforces() {
  refreshing.value = true
  error.value = ''
  try {
    const result = await problemListApi.refreshCodeforces()
    flash(`CF 题库已刷新：共 ${result.total} 题，新增 ${result.added}，更新 ${result.updated}`)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '刷新失败'
  } finally {
    refreshing.value = false
  }
}

function go(path: string) {
  window.location.href = path
}

onMounted(load)
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

    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold tracking-tight">管理题单</h1>
        <p class="mt-0.5 text-xs text-muted-foreground">
          合集装题单，题单装题目。只允许两层。
        </p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="refreshing" @click="refreshCodeforces">
          <RefreshCw class="mr-1 h-3.5 w-3.5" :class="refreshing && 'animate-spin'" />
          刷新 CF 题库
        </Button>
        <Button size="sm" @click="showCreate = !showCreate">
          <Plus class="mr-1 h-3.5 w-3.5" />
          新建
        </Button>
      </div>
    </div>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>
    <Alert v-if="notice" class="flex items-start gap-2">
      <Check class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ notice }}</span>
    </Alert>

    <!-- 新建 -->
    <Card v-if="showCreate">
      <CardHeader class="pb-3">
        <CardTitle class="text-sm font-medium">新建</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="text-xs font-medium">类型</label>
            <select
              v-model="newKind"
              class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="list">题单（装题目）</option>
              <option value="collection">合集（装题单）</option>
            </select>
          </div>
          <div v-if="newKind === 'list'" class="space-y-1.5">
            <label class="text-xs font-medium">所属合集（可不选）</label>
            <select
              v-model="newCollectionId"
              class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option :value="null">不放进合集</option>
              <option v-for="c in collections" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium">标题</label>
          <Input v-model="newTitle" placeholder="如：第一周 · 基础语法" @keyup.enter="create" />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium">说明（可选）</label>
          <Input v-model="newDescription" placeholder="这个题单是干什么的" />
        </div>
        <Button size="sm" :disabled="creating || !newTitle.trim()" @click="create">
          <Loader2 v-if="creating" class="mr-1 h-3.5 w-3.5 animate-spin" />
          创建
        </Button>
      </CardContent>
    </Card>

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <!-- 合集 -->
    <Card v-else-if="collections.length">
      <CardHeader class="pb-3">
        <CardTitle class="text-sm font-medium">合集</CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        <div class="divide-y divide-border/40">
          <div v-for="(item, index) in collections" :key="item.id" class="space-y-2 px-4 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <template v-if="editingId === item.id">
                <Input v-model="editTitle" class="h-9 flex-1 text-sm" />
                <Button size="sm" @click="saveEdit(item.id)">
                  <Check class="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" @click="editingId = null">
                  <X class="h-3.5 w-3.5" />
                </Button>
              </template>
              <template v-else>
                <a
                  :href="`/problems/view?id=${item.id}`"
                  class="text-sm font-medium hover:text-primary"
                >
                  {{ item.title }}
                </a>
                <span class="text-xs text-muted-foreground">
                  {{ item.item_count }} 个题单 · {{ item.total_problems }} 题
                </span>
                <div class="ml-auto flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    :disabled="index === 0"
                    title="上移"
                    @click="move(item, -1)"
                  >
                    <ArrowUp class="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    :disabled="index === collections.length - 1"
                    title="下移"
                    @click="move(item, 1)"
                  >
                    <ArrowDown class="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" title="改标题" @click="startEdit(item)">
                    <Pencil class="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" title="删除" @click="remove(item)">
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                </div>
              </template>
            </div>
            <Input
              v-if="editingId === item.id"
              v-model="editDescription"
              placeholder="说明"
              class="h-9 text-sm"
            />

            <!--
              合集里的题单。它们也要能加题——不然放进合集就没了编辑入口。
              缩进一格表示从属关系。
            -->
            <div
              v-if="childrenOf.get(item.id)?.length"
              class="ml-4 space-y-1 border-l border-border/40 pl-3"
            >
              <div
                v-for="child in childrenOf.get(item.id)"
                :key="child.id"
                class="flex flex-wrap items-center gap-2 py-1"
              >
                <a
                  :href="`/problems/view?id=${child.id}`"
                  class="text-xs font-medium hover:text-primary"
                >
                  {{ child.title }}
                </a>
                <span class="text-[11px] text-muted-foreground">{{ child.total_problems }} 题</span>
                <div class="ml-auto flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    title="加题"
                    @click="addingTo = addingTo === child.id ? null : child.id"
                  >
                    <Plus class="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" title="删除" @click="remove(child)">
                    <Trash2 class="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!--
      合集内题单的加题表单。放在合集卡外面，避免缩进层级把表单挤窄。
    -->
    <Card v-if="addingTo !== null && nestedLists.some((l) => l.id === addingTo)">
      <CardHeader class="pb-3">
        <CardTitle class="text-sm font-medium">
          加题到「{{ nestedLists.find((l) => l.id === addingTo)?.title }}」
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-2">
        <div class="flex flex-wrap gap-2">
          <select
            v-model="newPlatform"
            class="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            @change="newKey && lookupKey()"
          >
            <option v-for="p in PLATFORMS" :key="p" :value="p">{{ PLATFORM_META[p].label }}</option>
          </select>
          <Input
            v-model="newKey"
            :placeholder="PROBLEM_KEY_HINT[newPlatform]"
            class="h-9 min-w-[160px] flex-1 font-mono text-sm"
            @blur="lookupKey"
            @keyup.enter="addProblem(addingTo)"
          />
          <Button
            size="sm"
            class="h-9"
            :disabled="adding || !newKey.trim() || lookupState?.status === 'bad'"
            @click="addProblem(addingTo)"
          >
            <Loader2 v-if="adding" class="mr-1 h-3.5 w-3.5 animate-spin" />
            添加
          </Button>
        </div>
        <div class="flex items-start gap-2 text-xs">
          <Loader2 v-if="lookupState?.status === 'loading'" class="mt-0.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <Check v-else-if="lookupState?.status === 'ok'" class="mt-0.5 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
          <AlertCircle v-else-if="lookupState?.status === 'bad'" class="mt-0.5 h-3.5 w-3.5 text-destructive" />
          <span v-if="lookupState?.status === 'ok'" class="text-muted-foreground">
            <span class="font-medium text-foreground">{{ lookupState.name }}</span>
            <span v-if="lookupState.rating" class="ml-1.5 font-mono">★{{ lookupState.rating }}</span>
          </span>
          <span v-else-if="lookupState?.status === 'bad'" class="text-destructive">
            {{ lookupState.reason }}
          </span>
          <span v-else-if="lookupState?.status === 'loading'" class="text-muted-foreground">
            正在查题号…
          </span>
        </div>
      </CardContent>
    </Card>

    <!-- 题单 -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="text-sm font-medium">题单</CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        <p v-if="!standalone.length" class="p-4 text-sm text-muted-foreground">
          还没有不属于合集的题单。
        </p>
        <div v-else class="divide-y divide-border/40">
          <div v-for="(item, index) in standalone" :key="item.id" class="space-y-3 px-4 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <template v-if="editingId === item.id">
                <Input v-model="editTitle" class="h-9 flex-1 text-sm" />
                <Button size="sm" @click="saveEdit(item.id)">
                  <Check class="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" @click="editingId = null">
                  <X class="h-3.5 w-3.5" />
                </Button>
              </template>
              <template v-else>
                <a
                  :href="`/problems/view?id=${item.id}`"
                  class="text-sm font-medium hover:text-primary"
                >
                  {{ item.title }}
                </a>
                <span class="text-xs text-muted-foreground">{{ item.total_problems }} 题</span>
                <div class="ml-auto flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    :disabled="index === 0"
                    title="上移"
                    @click="move(item, -1)"
                  >
                    <ArrowUp class="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    :disabled="index === standalone.length - 1"
                    title="下移"
                    @click="move(item, 1)"
                  >
                    <ArrowDown class="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" title="加题" @click="addingTo = addingTo === item.id ? null : item.id">
                    <Plus class="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" title="改标题" @click="startEdit(item)">
                    <Pencil class="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" title="删除" @click="remove(item)">
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                </div>
              </template>
            </div>

            <!-- 加题。题号离开焦点时查题目名。 -->
            <div v-if="addingTo === item.id" class="space-y-2 rounded-md border border-border/40 p-3">
              <div class="flex flex-wrap gap-2">
                <select
                  v-model="newPlatform"
                  class="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
                  @change="newKey && lookupKey()"
                >
                  <option v-for="p in PLATFORMS" :key="p" :value="p">
                    {{ PLATFORM_META[p].label }}
                  </option>
                </select>
                <Input
                  v-model="newKey"
                  :placeholder="PROBLEM_KEY_HINT[newPlatform]"
                  class="h-9 min-w-[160px] flex-1 font-mono text-sm"
                  @blur="lookupKey"
                  @keyup.enter="addProblem(item.id)"
                />
                <Button
                  size="sm"
                  class="h-9"
                  :disabled="adding || !newKey.trim() || lookupState?.status === 'bad'"
                  @click="addProblem(item.id)"
                >
                  <Loader2 v-if="adding" class="mr-1 h-3.5 w-3.5 animate-spin" />
                  添加
                </Button>
              </div>

              <div class="flex items-start gap-2 text-xs">
                <Loader2 v-if="lookupState?.status === 'loading'" class="mt-0.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <Check v-else-if="lookupState?.status === 'ok'" class="mt-0.5 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
                <AlertCircle v-else-if="lookupState?.status === 'bad'" class="mt-0.5 h-3.5 w-3.5 text-destructive" />

                <span v-if="lookupState?.status === 'loading'" class="text-muted-foreground">
                  正在查题号…
                </span>
                <span v-else-if="lookupState?.status === 'ok'" class="text-muted-foreground">
                  <span class="font-medium text-foreground">{{ lookupState.name }}</span>
                  <span v-if="lookupState.rating" class="ml-1.5 font-mono">★{{ lookupState.rating }}</span>
                  <span v-if="lookupState.tags.length" class="ml-1.5">
                    {{ lookupState.tags.slice(0, 4).join(' · ') }}
                  </span>
                </span>
                <span v-else-if="lookupState?.status === 'bad'" class="text-destructive">
                  {{ lookupState.reason }}
                </span>
                <span v-else class="text-muted-foreground/60">
                  填完题号离开输入框会自动查题目名
                </span>
              </div>

              <Input v-model="newNote" placeholder="备注（可选）" class="h-9 text-sm" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
