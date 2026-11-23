<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ArrowLeft, Columns2, Rows2, ChevronLeft, ChevronRight, BookOpen, Code2, History, Copy, Check, Loader2 } from 'lucide-vue-next'
import { learningApi, type LearningRunDetail, type LearningRunSummary } from '../../lib/learning/api'
import { environments, verdictLabels, type Problem, type ProblemSummary } from '../../lib/learning/types'
import { dragHorizontal, loadSplit, saveSplit } from '../../lib/learning/resize'
import { useAuth } from '../../lib/auth'
import CodingWorkspace from './CodingWorkspace.vue'
import ProblemStatement from './ProblemStatement.vue'
import ActionNotice from '../ui/ActionNotice.vue'
import Button from '../ui/button/Button.vue'
import IconButton from '../ui/IconButton.vue'

const { user, ensureLoaded } = useAuth()
const problem = ref<Problem | null>(null), rows = ref<ProblemSummary[]>([])
const error = ref(''), loading = ref(false), mobilePanel = ref('statement'), split = ref(true)
const statementTab = ref<'statement' | 'runs'>('statement')
const runs = ref<LearningRunSummary[]>([])
const runsLoading = ref(false)
const runsError = ref('')
const expandedRunId = ref<number | null>(null)
const runDetails = ref<Record<number, LearningRunDetail>>({})
const loadingRunId = ref<number | null>(null)
const copiedRunId = ref<number | null>(null)
const fraction = ref(loadSplit('workbench', 0.42)), backFrom = ref('')

const envLabel = (env: string) => environments.find(e => e.id === env)?.label ?? env

async function loadRuns() {
  if (!problem.value || !user.value) return
  runsLoading.value = true
  runsError.value = ''
  try {
    runs.value = await learningApi.runs(problem.value.id)
  } catch (e) {
    runsError.value = e instanceof Error ? e.message : String(e)
  } finally {
    runsLoading.value = false
  }
}

function openRunsTab() {
  statementTab.value = 'runs'
  void loadRuns()
}

async function toggleRunDetail(id: number) {
  if (expandedRunId.value === id) {
    expandedRunId.value = null
    return
  }
  expandedRunId.value = id
  if (runDetails.value[id]) return
  loadingRunId.value = id
  try {
    runDetails.value[id] = await learningApi.runDetail(id)
  } catch (e) {
    runsError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (loadingRunId.value === id) loadingRunId.value = null
  }
}

async function copyRunSource(id: number) {
  const src = runDetails.value[id]?.source
  if (!src) return
  try {
    await navigator.clipboard.writeText(src)
    copiedRunId.value = id
    window.setTimeout(() => {
      if (copiedRunId.value === id) copiedRunId.value = null
    }, 2000)
  } catch { /* ignore */ }
}

function fmtRunTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
const splitStyle = computed(() => ({ '--statement-width': `${fraction.value * 100}%` }))
let serial = 0
const back = computed(() => {
  const camp = /^camp:(\d+)$/.exec(backFrom.value), list = /^list:(\d+)$/.exec(backFrom.value)
  return camp ? { href: `/camp?id=${camp[1]}`, label: '返回集训' } : list ? { href: `/problems/view?id=${list[1]}`, label: '返回题单' } : { href: '/learn', label: '返回题库' }
})
const position = computed(() => rows.value.findIndex(p => p.id === problem.value?.id))
const previous = computed(() => position.value > 0 ? rows.value[position.value - 1] : null)
const next = computed(() => position.value >= 0 ? rows.value[position.value + 1] : null)
const problemHref = (id: number) => `/learn/problem?id=${id}${backFrom.value ? `&from=${encodeURIComponent(backFrom.value)}` : ''}`
function toggleSplit() { split.value = !split.value; try { localStorage.setItem('learning-layout:split', split.value ? '1' : '0') } catch { /* 忽略 */ } }
function resize(event: PointerEvent) {
  const host = (event.currentTarget as HTMLElement).parentElement
  if (host) dragHorizontal(event, host, value => { fraction.value = Math.max(0.28, Math.min(0.65, value)) }, () => saveSplit('workbench', fraction.value))
}
function resizeKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault(); fraction.value = Math.max(0.28, Math.min(0.65, fraction.value + (event.key === 'ArrowLeft' ? -0.03 : 0.03))); saveSplit('workbench', fraction.value)
}
async function load() {
  const request = ++serial; loading.value = true; error.value = ''
  try {
    const id = Number(new URLSearchParams(location.search).get('id'))
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('题目 ID 无效')
    const p = await learningApi.get(id)
    if (request !== serial) return
    problem.value = p
    try { localStorage.setItem('learning:last-problem', String(p.id)) } catch { /* 忽略 */ }
    const list = await learningApi.list().catch(() => [])
    if (request === serial) rows.value = list
  } catch (e) { if (request === serial) error.value = e instanceof Error ? e.message : String(e) }
  finally { if (request === serial) loading.value = false }
}
onMounted(() => {
  backFrom.value = new URLSearchParams(location.search).get('from') || ''
  try { split.value = localStorage.getItem('learning-layout:split') !== '0' } catch { /* 默认双栏 */ }
  void Promise.all([ensureLoaded(), load()])
})
onUnmounted(() => { serial++ })
</script>
<template>
  <div class="learning-page">
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <a :href="back.href" class="learning-text-link"><ArrowLeft class="h-4 w-4" />{{ back.label }}</a>
      <div v-if="problem && !backFrom" class="flex items-center gap-1 text-xs text-muted-foreground"><a v-if="previous" :href="problemHref(previous.id)" class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-muted" :aria-label="`上一题：${previous.title}`"><ChevronLeft class="h-4 w-4" /></a><span v-if="rows.length">{{ position + 1 }} / {{ rows.length }}</span><a v-if="next" :href="problemHref(next.id)" class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-muted" :aria-label="`下一题：${next.title}`"><ChevronRight class="h-4 w-4" /></a></div>
    </div>
    <ActionNotice :message="error" variant="error" />
    <div v-if="!problem && loading" class="space-y-5 py-4" role="status" aria-label="正在加载题目"><div class="h-7 w-48 animate-pulse rounded bg-muted" /><div class="grid gap-4 lg:grid-cols-2"><div v-for="n in 2" :key="n" class="h-[480px] animate-pulse rounded-xl bg-muted/50" /></div></div>
    <Button v-if="error && !problem" variant="outline" :disabled="loading" @click="load">重新加载题目</Button>
    <template v-if="problem">
      <header class="learning-page-heading !mt-2 !mb-5"><div class="min-w-0"><p class="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span class="font-mono">#{{ problem.id.toString().padStart(3, '0') }}</span><span>·</span><span>{{ problem.content.chapter }}</span><span class="learning-difficulty" :data-level="problem.content.difficulty">{{ problem.content.difficulty }}</span></p><h1 class="break-words text-2xl font-semibold tracking-tight">{{ problem.content.title }}</h1></div><div class="hidden lg:block"><IconButton :label="split ? '切换到单列布局' : '切换到双栏布局'" :aria-pressed="split" @click="toggleSplit"><Rows2 v-if="split" class="h-4 w-4" /><Columns2 v-else class="h-4 w-4" /></IconButton></div></header>
      <div class="problem-mobile-tabs" role="group" aria-label="做题面板"><button type="button" :aria-pressed="mobilePanel === 'statement'" @click="mobilePanel = 'statement'"><BookOpen class="h-4 w-4" />题目</button><button type="button" :aria-pressed="mobilePanel === 'editor'" @click="mobilePanel = 'editor'"><Code2 class="h-4 w-4" />代码与测试</button></div>
      <div class="problem-panels" :class="{ 'is-split': split }" :style="splitStyle">
        <section class="statement-panel" :class="{ 'mobile-panel-hidden': mobilePanel !== 'statement' }">
          <div class="panel-heading flex items-center justify-between gap-2">
            <div class="flex items-center gap-1" role="tablist" aria-label="题目面板标签">
              <button
                type="button"
                role="tab"
                :aria-selected="statementTab === 'statement'"
                class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors"
                :class="statementTab === 'statement' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'"
                @click="statementTab = 'statement'"
              >
                <BookOpen class="h-3.5 w-3.5" />
                题目详情
              </button>
              <button
                v-if="user"
                type="button"
                role="tab"
                :aria-selected="statementTab === 'runs'"
                class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors"
                :class="statementTab === 'runs' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'"
                @click="openRunsTab"
              >
                <History class="h-3.5 w-3.5" />
                提交记录
              </button>
            </div>
            <button
              v-if="statementTab === 'runs' && user"
              type="button"
              class="text-xs text-muted-foreground hover:text-foreground"
              :disabled="runsLoading"
              @click="loadRuns"
            >
              刷新
            </button>
          </div>
          <ProblemStatement v-if="statementTab === 'statement'" :problem="problem" />
          <div v-else class="space-y-2.5 p-4 text-sm">
            <ActionNotice :message="runsError" variant="error" />
            <p v-if="runsLoading && !runs.length" class="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 class="h-3.5 w-3.5 animate-spin" />正在加载提交记录…
            </p>
            <p v-else-if="!runs.length" class="py-8 text-center text-xs text-muted-foreground">
              这道题还没有提交记录，在右侧点击「提交」后会保存在这里。
            </p>
            <div v-else class="space-y-2">
              <div v-for="run in runs" :key="run.id" class="overflow-hidden rounded-lg border border-border/60">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                  @click="toggleRunDetail(run.id)"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span
                        class="font-mono text-xs font-semibold"
                        :class="run.verdict === 'AC' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'"
                      >
                        {{ verdictLabels[run.verdict as keyof typeof verdictLabels] ?? run.verdict }}
                      </span>
                      <span class="font-mono text-xs text-muted-foreground">
                        {{ run.passed }}/{{ run.total }}
                      </span>
                      <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {{ envLabel(run.environment) }}
                      </span>
                    </div>
                    <p class="mt-0.5 text-[11px] text-muted-foreground">
                      {{ fmtRunTime(run.created_at) }}
                      <template v-if="run.elapsed_ms > 0"> · {{ Math.round(run.elapsed_ms) }} ms</template>
                    </p>
                  </div>
                  <span class="text-xs text-muted-foreground">{{ expandedRunId === run.id ? '收起' : '看代码' }}</span>
                </button>
                <div v-if="expandedRunId === run.id" class="border-t border-border/50 bg-muted/20 p-3">
                  <p v-if="loadingRunId === run.id" class="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 class="h-3.5 w-3.5 animate-spin" />正在读取代码…
                  </p>
                  <template v-else-if="runDetails[run.id]">
                    <div class="mb-2 flex items-center justify-between">
                      <span class="text-[11px] text-muted-foreground">提交 #{{ run.id }}</span>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        @click="copyRunSource(run.id)"
                      >
                        <Check v-if="copiedRunId === run.id" class="h-3 w-3 text-emerald-600" />
                        <Copy v-else class="h-3 w-3" />
                        {{ copiedRunId === run.id ? '已复制' : '复制代码' }}
                      </button>
                    </div>
                    <pre class="max-h-72 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{{ runDetails[run.id].source }}</pre>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div v-if="split" role="separator" tabindex="0" aria-label="调整题目与代码栏宽" aria-orientation="vertical" aria-valuemin="28" aria-valuemax="65" :aria-valuenow="Math.round(fraction * 100)" class="problem-resize" @pointerdown="resize" @keydown="resizeKey"><span /></div>
        <div class="min-w-0" :class="{ 'mobile-panel-hidden': mobilePanel !== 'editor' }"><CodingWorkspace :key="problem.version_id" :problem="problem" /></div>
      </div>
    </template>
  </div>
</template>
