<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Check, SlidersHorizontal } from 'lucide-vue-next'
import { learningApi } from '../../lib/learning/api'
import { difficulties, environments, type ProblemSummary } from '../../lib/learning/types'
import { useAuth } from '../../lib/auth'
import Input from '../ui/input/Input.vue'
import RefreshButton from '../ui/RefreshButton.vue'
import ActionNotice from '../ui/ActionNotice.vue'

const { user, ensureLoaded } = useAuth()
const rows = ref<ProblemSummary[]>([]), solved = ref<Set<number>>(new Set())
const chapter = ref(''), difficulty = ref(''), tag = ref(''), status = ref<'all' | 'todo' | 'done'>('all')
const keyword = ref(''), filtersOpen = ref(false)
const loading = ref(false), error = ref('')
let serial = 0

const chapters = computed(() => [...new Set(rows.value.map(p => p.chapter))])
const tags = computed(() => [...new Set(rows.value.flatMap(p => p.tags))].sort())
const activeFilters = computed(() => [chapter.value, difficulty.value, tag.value, status.value !== 'all' ? status.value : ''].filter(Boolean).length)

const filtered = computed(() => rows.value.filter(p => {
  if (chapter.value && p.chapter !== chapter.value) return false
  if (difficulty.value && p.difficulty !== difficulty.value) return false
  if (tag.value && !p.tags.includes(tag.value)) return false
  if (status.value === 'done' && !solved.value.has(p.id)) return false
  if (status.value === 'todo' && solved.value.has(p.id)) return false
  const q = keyword.value.trim().toLowerCase()
  if (q && !`${p.id} ${p.title} ${p.tags.join(' ')}`.toLowerCase().includes(q)) return false
  return true
}))

const fullLanguages = environments.length
const showsLanguages = (p: ProblemSummary) => p.environments.length < fullLanguages
const envLabel = (id: string) => environments.find(e => e.id === id)?.label ?? id

function resetFilters() {
  chapter.value = ''; difficulty.value = ''; tag.value = ''; status.value = 'all'
}

async function load() {
  const id = ++serial; loading.value = true; error.value = ''
  try {
    const data = await learningApi.list()
    if (id !== serial) return
    rows.value = data
    await ensureLoaded()
    if (user.value) {
      const runs = await learningApi.runs().catch(() => [])
      if (id !== serial) return
      solved.value = new Set(runs.filter(r => r.verdict === 'AC').map(r => r.problem_id))
    }
  } catch (e) { if (id === serial) error.value = String(e) }
  finally { if (id === serial) loading.value = false }
}
onMounted(load); onUnmounted(() => { serial++ })
</script>
<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="text-2xl font-semibold">题库</h1></div>
      <div class="flex items-center gap-2">
        <a href="/ide" class="text-sm text-muted-foreground hover:text-foreground">云端 IDE</a>
        <a href="/learn/runtimes" class="text-sm text-muted-foreground hover:text-foreground">语言包</a>
        <RefreshButton :busy="loading" @click="load" />
      </div>
    </div>
    <ActionNotice :message="error" variant="error" />

    <div class="flex flex-wrap items-center gap-2">
      <Input v-model="keyword" class="min-w-0 flex-1" type="search" aria-label="搜索题目" placeholder="搜索题名、标签或题号" />
      <button type="button" class="choice-button inline-flex items-center gap-1.5" :aria-pressed="filtersOpen" :aria-expanded="filtersOpen" aria-controls="learn-filters" @click="filtersOpen = !filtersOpen">
        <SlidersHorizontal class="h-4 w-4" />筛选<template v-if="activeFilters"> · {{ activeFilters }}</template>
      </button>
    </div>

    <div v-show="filtersOpen" id="learn-filters" class="space-y-3 rounded-xl border p-4">
      <div v-if="user" class="flex flex-wrap items-center gap-2">
        <span class="w-10 shrink-0 text-xs text-muted-foreground">状态</span>
        <button v-for="o in [['all', '全部'], ['todo', '未完成'], ['done', '已完成']]" :key="o[0]" type="button" class="choice-button" :aria-pressed="status === o[0]" @click="status = o[0] as typeof status">{{ o[1] }}</button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-10 shrink-0 text-xs text-muted-foreground">章节</span>
        <button type="button" class="choice-button" :aria-pressed="!chapter" @click="chapter = ''">全部</button>
        <button v-for="c in chapters" :key="c" type="button" class="choice-button" :aria-pressed="chapter === c" @click="chapter = chapter === c ? '' : c">{{ c }}</button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-10 shrink-0 text-xs text-muted-foreground">难度</span>
        <button type="button" class="choice-button" :aria-pressed="!difficulty" @click="difficulty = ''">全部</button>
        <button v-for="d in difficulties" :key="d" type="button" class="choice-button" :aria-pressed="difficulty === d" @click="difficulty = difficulty === d ? '' : d">{{ d }}</button>
      </div>
      <div v-if="tags.length" class="flex flex-wrap items-center gap-2">
        <span class="w-10 shrink-0 text-xs text-muted-foreground">标签</span>
        <button type="button" class="choice-button" :aria-pressed="!tag" @click="tag = ''">全部</button>
        <button v-for="t in tags" :key="t" type="button" class="choice-button" :aria-pressed="tag === t" @click="tag = tag === t ? '' : t">{{ t }}</button>
      </div>
      <button v-if="activeFilters" type="button" class="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" @click="resetFilters">清除筛选</button>
    </div>

    <p class="text-sm text-muted-foreground">{{ filtered.length }} 题<template v-if="filtered.length !== rows.length">（共 {{ rows.length }} 题）</template></p>

    <div class="divide-y rounded-xl border">
      <a v-for="p in filtered" :key="p.id" :href="`/learn/problem?id=${p.id}`" class="flex min-w-0 items-center gap-3 p-4 hover:bg-muted/40">
        <Check v-if="solved.has(p.id)" class="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="已通过" />
        <span class="w-8 shrink-0 text-sm tabular-nums text-muted-foreground">{{ p.id.toString().padStart(2, '0') }}</span>
        <span class="min-w-0 flex-1 break-words font-medium">{{ p.title }}</span>
        <span v-if="showsLanguages(p)" class="hidden shrink-0 text-xs text-muted-foreground sm:block">{{ p.environments.map(envLabel).join(' / ') }}</span>
        <span class="shrink-0 rounded border border-border/50 px-1.5 py-0.5 text-[11px] text-muted-foreground">{{ p.difficulty }}</span>
      </a>
    </div>
    <p v-if="!filtered.length" class="rounded-xl border p-5 text-sm text-muted-foreground">{{ loading ? '正在加载…' : '没有符合条件的题目' }}</p>
  </div>
</template>
