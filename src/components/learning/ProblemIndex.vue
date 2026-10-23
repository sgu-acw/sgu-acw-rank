<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Search, ArrowUpRight, ChevronRight, Check, BookOpen, Code2, SlidersHorizontal, X, ChevronLeft } from 'lucide-vue-next'
import { learningApi } from '../../lib/learning/api'
import { difficulties, type ProblemSummary } from '../../lib/learning/types'
import { useAuth } from '../../lib/auth'
import Input from '../ui/input/Input.vue'
import Button from '../ui/button/Button.vue'
import IconButton from '../ui/IconButton.vue'
import RefreshButton from '../ui/RefreshButton.vue'
import ActionNotice from '../ui/ActionNotice.vue'
const { user, ensureLoaded } = useAuth()
const rows = ref<ProblemSummary[]>([]), solved = ref<Set<number>>(new Set())
const chapter = ref(''), difficulty = ref(''), tag = ref(''), status = ref('all'), keyword = ref('')
const filtersOpen = ref(false), loading = ref(false), error = ref(''), progressError = ref('')
const page = ref(1), lastId = ref<number | null>(null)
const pageSize = 30
let serial = 0, initialized = false
const chapters = computed(() => [...new Set(rows.value.map(p => p.chapter))])
const tags = computed(() => [...new Set(rows.value.flatMap(p => p.tags))].sort())
const activeFilters = computed(() => [chapter.value, difficulty.value, tag.value, status.value !== 'all' ? status.value : '', keyword.value.trim()].filter(Boolean).length)
const chapterProgress = (name: string) => ({ total: rows.value.filter(p => p.chapter === name).length, solved: rows.value.filter(p => p.chapter === name && solved.value.has(p.id)).length })
const filtered = computed(() => rows.value.filter(p => {
  if (chapter.value && p.chapter !== chapter.value || difficulty.value && p.difficulty !== difficulty.value || tag.value && !p.tags.includes(tag.value)) return false
  if (status.value === 'done' && !solved.value.has(p.id) || status.value === 'todo' && solved.value.has(p.id)) return false
  const q = keyword.value.trim().toLowerCase()
  return !q || `${p.id} ${p.title} ${p.chapter} ${p.tags.join(' ')}`.toLowerCase().includes(q)
}))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const resume = computed(() => rows.value.find(p => p.id === lastId.value))
function resetFilters() { chapter.value = ''; difficulty.value = ''; tag.value = ''; status.value = 'all'; keyword.value = '' }
watch([chapter, difficulty, tag, status, keyword], () => {
  page.value = 1
  if (!initialized) return
  const params = new URLSearchParams()
  for (const [key, value] of [['q', keyword.value], ['chapter', chapter.value], ['difficulty', difficulty.value], ['tag', tag.value], ['status', status.value === 'all' ? '' : status.value]]) if (value) params.set(key!, value!)
  history.replaceState(history.state, '', `${location.pathname}${params.size ? `?${params}` : ''}`)
})
watch(pageCount, count => { page.value = Math.min(count, page.value) })
async function load() {
  if (loading.value) return
  const request = ++serial; loading.value = true; error.value = ''; progressError.value = ''
  try {
    const data = await learningApi.list()
    if (request !== serial) return
    rows.value = data
    await ensureLoaded()
    if (user.value) {
      try { const progress = await learningApi.progress(); if (request === serial) solved.value = new Set(progress.solved_problem_ids) }
      catch { if (request === serial) progressError.value = '完成记录读取失败，可刷新重试。' }
    } else solved.value = new Set()
  } catch (e) { if (request === serial) error.value = e instanceof Error ? e.message : String(e) }
  finally { if (request === serial) loading.value = false }
}
onMounted(() => {
  const p = new URLSearchParams(location.search)
  keyword.value = p.get('q') || ''; chapter.value = p.get('chapter') || ''; difficulty.value = p.get('difficulty') || ''; tag.value = p.get('tag') || ''; status.value = ['todo', 'done'].includes(p.get('status') || '') ? p.get('status')! : 'all'
  try { lastId.value = Number(localStorage.getItem('learning:last-problem')) || null } catch { /* 忽略 */ }
  initialized = true; void load()
})
onUnmounted(() => { serial++ })
</script>
<template>
  <div class="learning-page problem-library">
    <header class="learning-page-heading">
      <div><div class="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><BookOpen class="h-4 w-4" />PROBLEM LIBRARY</div><h1 class="text-2xl font-semibold tracking-tight">题库</h1><p class="mt-2 text-sm text-muted-foreground">从一道题开始，把想法写成代码。</p></div>
      <a href="/ide" class="learning-text-link"><Code2 class="h-4 w-4" />打开云端 IDE<ArrowUpRight class="h-4 w-4" /></a>
    </header>
    <div class="library-overview">
      <div class="flex flex-wrap items-center gap-x-7 gap-y-3"><div><span class="text-2xl font-semibold tabular-nums">{{ rows.length || (loading ? '—' : 0) }}</span><span class="ml-2 text-xs text-muted-foreground">道题目</span></div><div><span class="text-2xl font-semibold tabular-nums">{{ chapters.length || (loading ? '—' : 0) }}</span><span class="ml-2 text-xs text-muted-foreground">个章节</span></div><div v-if="user"><span class="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{{ solved.size }}</span><span class="ml-2 text-xs text-muted-foreground">已通过</span></div></div>
      <a v-if="resume" :href="`/learn/problem?id=${resume.id}`" class="inline-flex min-h-11 min-w-0 items-center gap-2 text-sm"><span class="shrink-0 text-muted-foreground">继续上次</span><span class="truncate font-medium">{{ resume.title }}</span><ChevronRight class="h-4 w-4 shrink-0" /></a>
      <a v-else href="/learn/runtimes" class="learning-text-link text-xs"><Code2 class="h-4 w-4" />准备语言包<ChevronRight class="h-4 w-4" /></a>
    </div>
    <ActionNotice :message="error" variant="error" /><ActionNotice :message="progressError" variant="info" />
    <div class="library-layout">
      <aside class="library-chapters" aria-label="按章节浏览"><p class="mb-3 text-xs font-medium text-muted-foreground">学习章节</p><nav class="space-y-1"><button type="button" class="chapter-link" :aria-pressed="!chapter" @click="chapter = ''"><span>全部题目</span><span>{{ rows.length }}</span></button><button v-for="name in chapters" :key="name" type="button" class="chapter-link" :aria-pressed="chapter === name" @click="chapter = name"><span class="truncate">{{ name }}</span><span>{{ user ? `${chapterProgress(name).solved} / ` : '' }}{{ chapterProgress(name).total }}</span></button></nav><p v-if="!user" class="mt-5 text-xs leading-6 text-muted-foreground">登录后可记录完成进度。<br />所有题目均可直接阅读和练习。</p></aside>
      <section class="min-w-0" aria-label="题目列表">
        <div class="library-controls">
          <div class="flex min-w-0 items-center gap-2"><div class="relative min-w-0 flex-1"><Search class="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input v-model="keyword" type="search" class="w-full pl-9" aria-label="搜索题目" placeholder="搜索题名、标签或题号…" /></div><IconButton label="筛选条件" :aria-expanded="filtersOpen" @click="filtersOpen = !filtersOpen"><SlidersHorizontal class="h-4 w-4" /></IconButton><RefreshButton :busy="loading" @click="load" /></div>
          <div class="flex flex-wrap items-center gap-2">
            <div v-if="user" class="flex min-w-0 gap-1" role="group" aria-label="完成状态"><button v-for="o in [['all', '全部'], ['todo', '未完成'], ['done', '已通过']]" :key="o[0]" type="button" class="choice-button" :aria-pressed="status === o[0]" @click="status = o[0]!">{{ o[1] }}</button></div>
            <span class="ml-auto text-xs text-muted-foreground">{{ filtered.length }} 道题目</span><button v-if="activeFilters && filtered.length" type="button" class="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground" @click="resetFilters"><X class="h-3.5 w-3.5" />清除筛选</button>
          </div>
          <div v-show="filtersOpen" class="grid gap-3 border-t pt-3 sm:grid-cols-3"><div><label for="filter-chapter" class="mb-2 block text-xs text-muted-foreground">章节</label><select id="filter-chapter" v-model="chapter" class="form-select w-full"><option value="">全部章节</option><option v-for="c in chapters" :key="c" :value="c">{{ c }}</option></select></div><div><label for="filter-difficulty" class="mb-2 block text-xs text-muted-foreground">难度</label><select id="filter-difficulty" v-model="difficulty" class="form-select w-full"><option value="">全部难度</option><option v-for="d in difficulties" :key="d" :value="d">{{ d }}</option></select></div><div><label for="filter-tag" class="mb-2 block text-xs text-muted-foreground">标签</label><select id="filter-tag" v-model="tag" class="form-select w-full"><option value="">全部标签</option><option v-for="t in tags" :key="t" :value="t">{{ t }}</option></select></div></div>
          <div class="lg:hidden"><label for="mobile-chapter" class="sr-only">章节</label><select id="mobile-chapter" v-model="chapter" class="form-select w-full"><option value="">全部章节</option><option v-for="c in chapters" :key="c" :value="c">{{ c }} · {{ chapterProgress(c).total }}</option></select></div>
        </div>
        <div class="library-list">
          <div class="library-table-heading"><span>状态 / 题号</span><span>题目</span><span class="text-right">难度</span></div>
          <div v-if="loading && !rows.length" class="divide-y" role="status" aria-label="正在加载题库"><div v-for="n in 6" :key="n" class="flex gap-5 px-5 py-6"><div class="h-4 w-8 animate-pulse rounded bg-muted" /><div class="h-4 w-2/3 animate-pulse rounded bg-muted" /></div></div>
          <a v-for="p in visible" :key="p.id" :href="`/learn/problem?id=${p.id}`" class="library-row"><span class="flex items-center gap-2 text-xs tabular-nums text-muted-foreground"><Check v-if="solved.has(p.id)" class="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-label="已通过" /><span v-else class="h-4 w-4 rounded-full border border-border" :aria-label="user ? '未完成' : '题目'" /><span>{{ p.id.toString().padStart(3, '0') }}</span></span><span class="min-w-0"><span class="block truncate text-sm font-medium">{{ p.title }}</span><span class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>{{ p.chapter }}</span><span v-for="t in p.tags.slice(0, 2)" :key="t">{{ t }}</span></span></span><span class="flex items-center justify-end gap-3"><span class="learning-difficulty" :data-level="p.difficulty">{{ p.difficulty }}</span><ChevronRight class="hidden h-4 w-4 text-muted-foreground/50 sm:block" /></span></a>
          <div v-if="!loading && !filtered.length" class="flex flex-col items-center gap-3 px-5 py-14 text-center"><Search class="h-7 w-7 text-muted-foreground/50" /><p class="text-sm font-medium">{{ error ? '暂时无法读取题库' : '没有找到符合条件的题目' }}</p><p class="text-xs text-muted-foreground">{{ error ? '请刷新重试。' : '试试其他关键词，或清除部分筛选条件。' }}</p><Button v-if="activeFilters" variant="outline" @click="resetFilters">清除筛选</Button></div>
        </div>
        <div v-if="filtered.length" class="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, filtered.length) }} / {{ filtered.length }}</span><div class="flex items-center gap-2"><IconButton label="上一页" :disabled="page === 1" @click="page--"><ChevronLeft class="h-4 w-4" /></IconButton><span>{{ page }} / {{ pageCount }}</span><IconButton label="下一页" :disabled="page === pageCount" @click="page++"><ChevronRight class="h-4 w-4" /></IconButton></div></div>
      </section>
    </div>
  </div>
</template>
