<script setup lang="ts">
/**
 * 题解管理。
 *
 * 列出所有题解，能改正文、hint 和代码，能手动公布/收回，能删。
 *
 * **为什么需要这个页面**
 *
 * 题解是模型自动生成的，偶尔会跑偏——公式写错、代码有 bug、或者干脆
 * 理解错了题意。生成到公布之间只有几个小时，靠人工逐篇看来不及。所以
 * 这里提供的是「发现问题后能立刻处理」的能力：改几个字、撤下来、或者
 * 删掉让下次重跑。
 */
import { onMounted, ref, watch } from 'vue'
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Lightbulb,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import AdminWorkspaceNav from './AdminWorkspaceNav.vue'
import { renderMarkdown } from '../lib/markdown'
import {
  ApiError,
  adminApi,
  type AdminEditorial,
  type MissingEditorial,
} from '../lib/api'

const loading = ref(true)
const error = ref('')
const notice = ref('')

const items = ref<AdminEditorial[]>([])
const total = ref(0)
const missing = ref<MissingEditorial[]>([])

const filterDay = ref('')
const filterStatus = ref('')
const filterQuery = ref('')

/** 展开着编辑器的题解 id。同时只开一个，编辑区很高。 */
const editingId = ref<number | null>(null)
/** 展开着预览的题解 id。 */
const previewingId = ref<number | null>(null)
/** 预览里看哪个语言的代码。 */
const previewLang = ref('cpp17')

/**
 * 渲染后的正文。按 id 缓存，避免每次重渲染都跑一遍 markdown-it + KaTeX。
 */
const renderedBody = ref<Record<number, string>>({})

function previewBody(item: AdminEditorial): string {
  if (!(item.id in renderedBody.value)) {
    renderedBody.value[item.id] = renderMarkdown(item.body)
  }
  return renderedBody.value[item.id]
}
const draft = ref<{ hints: string; body: string; code: Record<string, string> }>({
  hints: '',
  body: '',
  code: {},
})
const saving = ref(false)
/** 编辑时看哪个语言的代码。 */
const editLang = ref('cpp17')

const STATUS_LABEL: Record<string, string> = {
  pending: '未生成',
  draft: '草稿',
  published: '已公布',
  failed: '生成失败',
}

const STATUS_TONE: Record<string, string> = {
  pending: 'text-muted-foreground',
  draft: 'text-amber-600 dark:text-amber-500',
  published: 'text-emerald-600 dark:text-emerald-500',
  failed: 'text-destructive',
}

const LANGS = [
  { key: 'cpp17', label: 'C++' },
  { key: 'py3', label: 'Python' },
  { key: 'java17', label: 'Java' },
]

function flash(message: string) {
  notice.value = message
  window.setTimeout(() => {
    if (notice.value === message) notice.value = ''
  }, 3000)
}

function formatTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** 题解是否对成员可见（正文）。 */
function isVisible(item: AdminEditorial): boolean {
  return item.published_at !== null
}

/** 代码是否对成员可见。 */
async function load() {
  loading.value = true
  error.value = ''
  try {
    const [page, miss] = await Promise.all([
      adminApi.editorials({
        day: filterDay.value || undefined,
        status: filterStatus.value || undefined,
        q: filterQuery.value || undefined,
        limit: 200,
      }),
      adminApi.missingEditorials(30),
    ])
    items.value = page.items
    total.value = page.total
    missing.value = miss
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function startEdit(item: AdminEditorial) {
  editingId.value = item.id
  draft.value = {
    hints: item.hints,
    body: item.body,
    code: { ...item.code },
  }
  editLang.value = 'cpp17'
}

function cancelEdit() {
  editingId.value = null
}

async function save() {
  if (!editingId.value) return
  saving.value = true
  error.value = ''
  try {
    const updated = await adminApi.updateEditorial(editingId.value, {
      hints: draft.value.hints,
      body: draft.value.body,
      code: draft.value.code,
    })
    const index = items.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) items.value[index] = updated
    // 正文改了，缓存要作废，否则预览还是旧的。
    delete renderedBody.value[updated.id]
    editingId.value = null
    flash('已保存')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function togglePublish(item: AdminEditorial) {
  error.value = ''
  try {
    const updated = isVisible(item)
      ? await adminApi.unpublishEditorial(item.id)
      : await adminApi.publishEditorial(item.id)
    const index = items.value.findIndex((row) => row.id === updated.id)
    if (index >= 0) items.value[index] = updated
    flash(isVisible(updated) ? '已公布' : '已收回')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '操作失败'
  }
}

async function remove(item: AdminEditorial) {
  if (!window.confirm(`确定删除 ${item.key} 的题解？删掉后下次生成会重写。`)) return
  error.value = ''
  try {
    await adminApi.deleteEditorial(item.id)
    items.value = items.value.filter((row) => row.id !== item.id)
    total.value = Math.max(0, total.value - 1)
    if (editingId.value === item.id) editingId.value = null
    flash('已删除')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败'
  }
}

// 筛选变化就重拉。搜索做防抖，别每敲一个字都发请求。
let searchTimer: number | undefined
watch([filterDay, filterStatus], load)
watch(filterQuery, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(load, 300)
})

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <AdminWorkspaceNav active="editorials">
      <Button variant="outline" size="sm" :disabled="loading" @click="load">
        <RefreshCw class="mr-1.5 h-3.5 w-3.5" :class="loading && 'animate-spin'" />
        刷新
      </Button>
    </AdminWorkspaceNav>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>
    <Alert v-if="notice" class="flex items-start gap-2">
      <Check class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ notice }}</span>
    </Alert>

    <!-- 缺题解的题。生成任务漏了的时候这里能看出来。 -->
    <Card v-if="missing.length">
      <CardHeader class="pb-3">
        <CardTitle class="text-sm font-medium">
          还没生成题解
          <span class="ml-1 font-normal text-muted-foreground">{{ missing.length }} 道</span>
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-1">
        <p class="text-xs text-muted-foreground">
          往日里这些题还没有题解。生成每天早上跑一次，只处理当天的题，
          所以往日落下的不会自动补上。
        </p>
        <div class="flex flex-wrap gap-1.5 pt-1">
          <span
            v-for="item in missing.slice(0, 40)"
            :key="item.daily_problem_id"
            class="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            :title="`${item.day} · ${item.name}`"
          >
            {{ item.key }}
          </span>
          <span v-if="missing.length > 40" class="text-[11px] text-muted-foreground">
            还有 {{ missing.length - 40 }} 道…
          </span>
        </div>
      </CardContent>
    </Card>

    <!-- 筛选 -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="relative min-w-48 flex-1">
        <Input v-model="filterQuery" placeholder="题号或日期" class="h-9" />
      </div>
      <select
        v-model="filterStatus"
        class="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">全部状态</option>
        <option value="draft">草稿</option>
        <option value="published">已公布</option>
        <option value="failed">生成失败</option>
      </select>
      <Input v-model="filterDay" type="date" class="h-9 w-40" />
      <span class="text-xs text-muted-foreground">{{ total }} 篇</span>
    </div>

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <Card v-else-if="!items.length">
      <CardContent class="py-10 text-center text-sm text-muted-foreground">
        没有符合条件的题解
      </CardContent>
    </Card>

    <div v-else class="space-y-2">
      <Card v-for="item in items" :key="item.id">
        <!-- 一行摘要 -->
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
          <span class="font-mono text-xs text-muted-foreground">{{ item.day }}</span>
          <span class="font-mono text-xs font-medium">{{ item.key }}</span>
          <span class="truncate text-sm">{{ item.name }}</span>
          <span v-if="item.rating" class="font-mono text-[11px] text-muted-foreground">
            {{ item.rating }}
          </span>

          <span class="text-xs font-medium" :class="STATUS_TONE[item.status]">
            {{ STATUS_LABEL[item.status] ?? item.status }}
          </span>

          <!-- 可见性。正文和代码一起公布，所以一个标识就够。 -->
          <span class="flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <component :is="isVisible(item) ? Eye : EyeOff" class="h-3 w-3" />
            {{ isVisible(item) ? '可见' : '未公布' }}
          </span>

          <span v-if="item.error" class="text-[11px] text-destructive" :title="item.error">
            {{ item.error.slice(0, 40) }}
          </span>

          <div class="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" @click="togglePublish(item)">
              <component :is="isVisible(item) ? EyeOff : Eye" class="mr-1 h-3.5 w-3.5" />
              {{ isVisible(item) ? '收回' : '公布' }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              @click="editingId === item.id ? cancelEdit() : startEdit(item)"
            >
              <Pencil class="mr-1 h-3.5 w-3.5" />
              {{ editingId === item.id ? '取消' : '编辑' }}
            </Button>
            <Button variant="ghost" size="sm" @click="remove(item)">
              <Trash2 class="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <!-- 编辑器 -->
        <CardContent v-if="editingId === item.id" class="space-y-3 border-t border-border/40 pt-3">
          <div class="space-y-1.5">
            <label class="text-xs font-medium">提示（每行一条）</label>
            <textarea
              v-model="draft.hints"
              rows="3"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium">
              正文
              <span class="ml-1 font-normal text-muted-foreground">
                Markdown + LaTeX，{{ draft.body.length }} 字符
              </span>
            </label>
            <textarea
              v-model="draft.body"
              rows="16"
              class="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed"
            />
          </div>

          <div class="space-y-1.5">
            <div class="flex items-center gap-1">
              <label class="text-xs font-medium">代码</label>
              <button
                v-for="lang in LANGS"
                :key="lang.key"
                type="button"
                class="rounded px-2 py-0.5 text-xs font-medium transition-colors"
                :class="
                  editLang === lang.key
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted/60'
                "
                @click="editLang = lang.key"
              >
                {{ lang.label }}
              </button>
            </div>
            <textarea
              v-model="draft.code[editLang]"
              rows="14"
              spellcheck="false"
              class="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed"
            />
          </div>

          <div class="flex items-center gap-2">
            <Button size="sm" :disabled="saving" @click="save">
              <Loader2 v-if="saving" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
              <Check v-else class="mr-1.5 h-3.5 w-3.5" />
              保存
            </Button>
            <Button variant="ghost" size="sm" @click="cancelEdit">取消</Button>
            <span class="text-xs text-muted-foreground">
              模型：{{ item.model || '未知' }} · 生成于 {{ formatTime(item.generated_at) }}
            </span>
          </div>
        </CardContent>

        <!--
          预览。不编辑时看看到底长什么样。

          渲染成 HTML 而不是直接显示 markdown 原文——公式、列表、加粗这些
          只有渲染出来才看得出对不对，而管理员要判断的正是「对不对」。
        -->
        <CardContent v-else-if="item.body" class="border-t border-border/40 px-4 py-2.5">
          <button
            type="button"
            class="row-action flex w-full items-center gap-1 rounded px-1 py-1 text-xs text-muted-foreground"
            :aria-expanded="previewingId === item.id"
            @click="previewingId = previewingId === item.id ? null : item.id"
          >
            <BookOpen class="h-3 w-3" />
            预览
            <ChevronDown
              class="h-3 w-3 transition-transform duration-150"
              :class="previewingId === item.id && 'rotate-180'"
            />
          </button>

          <div v-if="previewingId === item.id" class="mt-2 space-y-3">
            <!-- 提示 -->
            <div v-if="item.hints.trim()">
              <p class="mb-1 text-xs font-medium text-muted-foreground">提示</p>
              <ol class="space-y-1">
                <li
                  v-for="(hint, index) in item.hints.split('\n').filter((h) => h.trim())"
                  :key="index"
                  class="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                >
                  <Lightbulb class="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  <span>{{ hint }}</span>
                </li>
              </ol>
            </div>

            <!-- 正文 -->
            <div>
              <p class="mb-1 text-xs font-medium text-muted-foreground">正文</p>
              <!-- eslint-disable-next-line vue/no-v-html -- 见 Editorial.vue 的说明 -->
              <div class="editorial-body max-h-96 overflow-auto rounded-md border border-border/40 p-3" v-html="previewBody(item)" />
            </div>

            <!-- 代码 -->
            <div>
              <div class="mb-1 flex items-center gap-1">
                <p class="text-xs font-medium text-muted-foreground">代码</p>
                <button
                  v-for="lang in LANGS"
                  :key="lang.key"
                  type="button"
                  class="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
                  :class="
                    previewLang === lang.key
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted/60'
                  "
                  @click="previewLang = lang.key"
                >
                  {{ lang.label }}
                </button>
              </div>
              <pre
                class="max-h-80 overflow-auto rounded-md border border-border/40 bg-muted/30 p-3 font-mono text-xs leading-relaxed"
              ><code>{{ item.code[previewLang] || '（无）' }}</code></pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
