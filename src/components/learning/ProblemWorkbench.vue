<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ArrowLeft, Columns2, Rows2, ChevronLeft, ChevronRight, BookOpen, Code2 } from 'lucide-vue-next'
import { learningApi } from '../../lib/learning/api'
import type { Problem, ProblemSummary } from '../../lib/learning/types'
import { dragHorizontal, loadSplit, saveSplit } from '../../lib/learning/resize'
import CodingWorkspace from './CodingWorkspace.vue'
import ProblemStatement from './ProblemStatement.vue'
import ActionNotice from '../ui/ActionNotice.vue'
import Button from '../ui/button/Button.vue'
import IconButton from '../ui/IconButton.vue'
const problem = ref<Problem | null>(null), rows = ref<ProblemSummary[]>([])
const error = ref(''), loading = ref(false), mobilePanel = ref('statement'), split = ref(true)
const fraction = ref(loadSplit('workbench', 0.42)), backFrom = ref('')
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
  void load()
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
        <section class="statement-panel" :class="{ 'mobile-panel-hidden': mobilePanel !== 'statement' }"><div class="panel-heading"><BookOpen class="h-4 w-4" />题目详情</div><ProblemStatement :problem="problem" /></section>
        <div v-if="split" role="separator" tabindex="0" aria-label="调整题目与代码栏宽" aria-orientation="vertical" aria-valuemin="28" aria-valuemax="65" :aria-valuenow="Math.round(fraction * 100)" class="problem-resize" @pointerdown="resize" @keydown="resizeKey"><span /></div>
        <div class="min-w-0" :class="{ 'mobile-panel-hidden': mobilePanel !== 'editor' }"><CodingWorkspace :key="problem.version_id" :problem="problem" /></div>
      </div>
    </template>
  </div>
</template>
