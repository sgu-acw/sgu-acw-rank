<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowLeft, Play, Square, Download, Columns2, Rows2 } from 'lucide-vue-next'
import { useAuth } from '../../lib/auth'
import { learningApi } from '../../lib/learning/api'
import { environments, starter, verdictLabels, type Environment, type JudgeResult, type Problem, type Progress } from '../../lib/learning/types'
import Button from '../ui/button/Button.vue'
import VerdictDots from './VerdictDots.vue'
import CodeEditor from './CodeEditor.vue'
import TerminalPane from './TerminalPane.vue'
import CustomTestCases from './CustomTestCases.vue'
import type { TtyEvent } from '../../lib/learning/engine'
import { useLearningRuntime } from '../../lib/learning/runtime'
import ActionNotice from '../ui/ActionNotice.vue'
const { user, ensureLoaded } = useAuth()
const problem = ref<Problem | null>(null), environment = ref<Environment>('cpp'), source = ref('')
interface CustomCase { id: number; input: string; expected: string }
let customSeq = 0
const customCases = ref<CustomCase[]>([{ id: ++customSeq, input: '20 22\n', expected: '' }])
const error = ref(''), notice = ref('')
// 运行器与语言服务统一走 useLearningRuntime，和云端 IDE 共用同一套逻辑。
const shared = useLearningRuntime({ environment, code: source })
const { engine, catalog, ready, lspPhase, lspReason, completion, diagnostics } = shared
const completionSource = completion
const diagnosticsExtension = diagnostics
const lspUnavailable = lspReason
const lspInstalled = computed(() => lspPhase.value === 'ready' || lspPhase.value === 'starting')

const busy = ref<'run' | null>(null), progress = ref<Progress | null>(null), result = ref<JudgeResult | null>(null)

// ---------- 运行方式 tabs ----------
// 一个「运行」按钮，当前在哪个 tab 就在哪个模式里跑：
// 样例 = 题目自带测试点；自定义 = 用户填的用例；终端 = 真交互会话。
const runTab = ref<'test' | 'tty'>('test')
const ttyStarted = ref(false)
const ttyKey = ref(0)
const wasmGlobal = globalThis.WebAssembly as { promising?: unknown } | undefined
const jspi = typeof wasmGlobal?.promising === 'function'
const ttyUsable = computed(() => jspi && ['c', 'cpp', 'python'].includes(environment.value) && ready.value && !!engine.value)
const ttyReason = computed(() => !jspi
  ? '此浏览器不支持交互终端（需要较新的 Chrome 或 Edge）'
  : !['c', 'cpp', 'python'].includes(environment.value) ? 'Java 暂不支持交互终端' : '')
const sampleCount = computed(() => problem.value?.content.tests.filter(t => t.sample).length ?? 0)
const sampleCases = computed(() => problem.value?.content.tests.filter(t => t.sample) ?? [])
function launchTty(onEvent: (e: TtyEvent) => void) {
  return engine.value!.terminal(environment.value, source.value, onEvent)
}
function runActive() {
  if (busy.value || !ready.value) return
  if (runTab.value === 'tty') { ttyStarted.value = true; ttyKey.value += 1; return }
  void run('test')
}
const resultSource = ref(''), resultMode = ref(''), saving = ref(false), saved = ref(false), mobilePanel = ref('statement')
// 默认单列（题面在上、编辑器在下），切到双栏后记住选择。
const LAYOUT_KEY = 'learning-layout:split'
const split = ref(false)
function toggleSplit() {
  split.value = !split.value
  try { localStorage.setItem(LAYOUT_KEY, split.value ? '1' : '0') } catch { /* 隐私模式忽略 */ }
}
let controller: AbortController | undefined, alive = true, persistTimer: ReturnType<typeof setTimeout> | undefined
let pendingRecord: Parameters<typeof learningApi.record>[0] | undefined
const selected = computed(() => environments.find(e => e.id === environment.value)!)
// 通过之后只显示“通过”，不回退成运行完成之类的措辞。
// 自定义测试的结果就地显示在对应测试点里（输入/期望/实际在一起）。
const customPoint = (index: number) => resultMode.value === 'custom' ? result.value?.points[index]
  : resultMode.value === 'test' ? result.value?.points[sampleCount.value + index] : undefined
const runtimePackage = computed(() => catalog.value?.runtimes.find(r => r.id === selected.value.runtime))
const allowed = computed(() => environments.filter(e => problem.value?.content.environments.includes(e.id)))
const key = (env: Environment) => `learning-draft:${problem.value?.id}:${env}`
function persist(env = environment.value, code = source.value) {
  if (!problem.value) return
  try { localStorage.setItem(key(env), code) } catch { notice.value = '浏览器无法保存草稿，请在离开前复制源码。' }
}
function readDraft(env: Environment) {
  try { return localStorage.getItem(key(env)) ?? starter[env] } catch { return starter[env] }
}
watch(source, code => {
  clearTimeout(persistTimer)
  const env = environment.value
  persistTimer = setTimeout(() => persist(env, code), 200)
})
function changeEnvironment(event: Event) {
  if (busy.value) return
  persist(); clearTimeout(persistTimer)
  environment.value = (event.target as HTMLSelectElement).value as Environment
  source.value = readDraft(environment.value)
  // 换语言要换语言服务器；同类语言（C/C++）沿用同一个。
  void shared.switchEnvironment()
}
function interruptBackground() { if (document.hidden && busy.value === 'run') { controller?.abort(); notice.value = '页面进入后台，评测已中断；源码已保留。' } }
onMounted(async () => {
  document.addEventListener('visibilitychange', interruptBackground)
  try { split.value = localStorage.getItem(LAYOUT_KEY) === '1' } catch { /* 隐私模式忽略 */ }
  try {
    const id = Number(new URLSearchParams(location.search).get('id'))
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('题目 ID 无效')
    const p = await learningApi.get(id)
    if (!alive) return
    problem.value = p
    environment.value = p.content.environments.includes('cpp') ? 'cpp' : p.content.environments[0]!
    source.value = readDraft(environment.value)
    customCases.value = [{ id: ++customSeq, input: p.content.tests.find(t => t.sample)?.input || '', expected: '' }]
    await shared.connect()
    await ensureLoaded()
  } catch (e) { if (alive) error.value = String(e) }
})
onUnmounted(() => {
  persist(); alive = false; clearTimeout(persistTimer); controller?.abort()
  document.removeEventListener('visibilitychange', interruptBackground)
})
async function run(mode: 'samples' | 'all' | 'custom' | 'test') {
  if (busy.value || !engine.value || !problem.value || !ready.value) return
  persist(); busy.value = 'run'; error.value = ''; notice.value = ''; saved.value = false; pendingRecord = undefined
  controller = new AbortController()
  const snapshot = { source: source.value, environment: environment.value, version_id: problem.value.version_id }
  const content = problem.value.content
  const cases = mode === 'custom'
    ? customCases.value.map((c, i) => ({ name: `测试点 ${i + 1}`, input: c.input, output: c.expected, sample: true }))
    : mode === 'test'
      ? [...content.tests.filter(t => t.sample),
         ...customCases.value.map((c, i) => ({ name: `自定义 ${i + 1}`, input: c.input, output: c.expected, sample: true }))]
      : content.tests.filter(t => mode === 'all' || t.sample)
  result.value = null; resultMode.value = mode; resultSource.value = snapshot.source; mobilePanel.value = 'editor'
  try {
    const judged = await engine.value.run({ environment: snapshot.environment, source: snapshot.source, cases,
      checker: content.checker, timeMs: content.time_ms, custom: mode === 'custom' }, controller.signal, p => { if (alive) progress.value = p })
    if (!alive) return
    result.value = judged
    if (mode === 'all' && !['ENVIRONMENT_ERROR', 'CANCELLED'].includes(judged.verdict)) {
      pendingRecord = { ...snapshot, id: judged.id, runtime_version: judged.runtimeVersion, verdict: judged.verdict }
      if (user.value) await saveRecord()
    }
  } catch (e) { if (alive) { if ((e as Error).name !== 'AbortError') error.value = String(e); else if (!notice.value) notice.value = '评测已取消，源码已保留。' } }
  finally { if (alive) { busy.value = null; progress.value = null; controller = undefined } }
}
async function saveRecord() {
  if (!pendingRecord || saving.value || saved.value || !user.value) return
  saving.value = true
  try { await learningApi.record(pendingRecord); saved.value = true }
  catch { notice.value = '评测已完成，记录尚未同步。可使用同一评测 ID 重试同步。' }
  finally { saving.value = false }
}
</script>
<template>
  <div class="space-y-5">
    <a href="/learn" class="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft class="h-4 w-4" />返回题库</a>
    <ActionNotice :message="error" variant="error" /><ActionNotice :message="notice" variant="info" />
    <template v-if="problem">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0"><p class="text-sm text-muted-foreground">{{ problem.content.chapter }} · {{ problem.content.difficulty }} · 版本 {{ problem.revision }}</p><h1 class="mt-2 text-2xl font-semibold">{{ problem.content.title }}</h1></div>
        <div class="flex shrink-0 items-center gap-2">
          <Button variant="outline" :disabled="!!busy" :aria-pressed="split" :title="split ? '切换到单列' : '切换到双栏'" @click="toggleSplit">
            <Columns2 v-if="!split" class="h-4 w-4" /><Rows2 v-else class="h-4 w-4" />
            <span class="ml-2 hidden sm:inline">{{ split ? '单列' : '双栏' }}</span>
          </Button>
        </div>
      </div>
      <div class="flex gap-2 lg:hidden"><button type="button" class="choice-button" :aria-pressed="mobilePanel === 'statement'" @click="mobilePanel = 'statement'">题面</button><button type="button" class="choice-button" :aria-pressed="mobilePanel === 'editor'" @click="mobilePanel = 'editor'">代码与结果</button></div>
      <div class="grid min-w-0 gap-5" :class="split ? 'lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]' : ''">
        <section class="min-w-0 space-y-5 rounded-xl border p-5" :class="[mobilePanel !== 'statement' && 'hidden lg:block', split && 'lg:max-h-[70vh] lg:overflow-auto']">
          <h2 class="font-semibold">题目描述</h2><p class="whitespace-pre-wrap break-words text-sm leading-7">{{ problem.content.statement }}</p>
          <p class="text-xs text-muted-foreground">每点时限 {{ problem.content.time_ms }} ms · {{ problem.content.checker === 'tokens' ? '忽略空白比较' : '逐字比较' }}</p>
          <div v-for="(test, index) in problem.content.tests.filter(t => t.sample)" :key="index" class="min-w-0 space-y-2">
            <h3 class="text-sm font-medium">样例 {{ index + 1 }}</h3><p class="text-xs text-muted-foreground">输入</p><pre class="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-sm">{{ test.input }}</pre><p class="text-xs text-muted-foreground">输出</p><pre class="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-sm">{{ test.output }}</pre>
          </div>
        </section>
        <section class="min-w-0 space-y-4" :class="mobilePanel !== 'editor' && 'hidden lg:block'">
          <div class="space-y-4 rounded-xl border p-4 sm:p-5">
            <div class="flex flex-wrap items-center gap-3"><label for="learning-language" class="text-sm font-medium">语言</label><select id="learning-language" class="form-select min-w-0 flex-1" :value="environment" :disabled="!!busy" @change="changeEnvironment"><option v-for="e in allowed" :key="e.id" :value="e.id">{{ e.label }}</option></select><a href="/learn/runtimes" class="inline-flex min-h-11 items-center text-sm text-primary hover:underline">管理语言包</a></div>
            <div v-if="!runtimePackage?.available" class="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{{ runtimePackage?.reason || '正在读取运行包信息…' }}</div>
            <div v-else-if="!ready" class="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3">
              <p class="min-w-0 flex-1 text-sm">{{ runtimePackage.label }} 还没装好。</p>
              <a href="/learn/runtimes" class="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Download class="h-4 w-4" />去语言包页面安装</a>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium">源码</span>
              <span v-if="environment.startsWith('java')" class="text-sm text-muted-foreground">Main.java</span>
              <span v-if="lspPhase === 'starting'" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                <span class="h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden="true"></span>语言服务启动中…
              </span>
              <span v-else-if="lspPhase === 'ready'" class="text-xs text-emerald-600 dark:text-emerald-400">补全与诊断已开启</span>
              <button v-else-if="lspPhase === 'failed'" type="button" class="text-xs text-amber-600 underline underline-offset-2 hover:text-amber-700 dark:text-amber-400" :title="lspUnavailable" @click="shared.retryLsp()">语言服务不可用，点这重试</button>
              <span v-else-if="lspInstalled" class="text-xs text-muted-foreground">语言服务待启动</span>
              <Button class="ml-auto" :disabled="!!busy || !ready" @click="run('all')"><Play class="mr-2 h-4 w-4" />提交</Button>
            </div>
            <div id="learning-code" role="group" aria-label="源码">
              <CodeEditor v-model="source" :environment="environment" :readonly="!!busy" :completion="completionSource" :diagnostics="diagnosticsExtension" />
            </div>
            <div class="overflow-hidden rounded-lg border">
              <div class="flex border-b" role="tablist" aria-label="测试方式">
                <button v-for="t in ([{ id: 'test', label: '测试' }, { id: 'tty', label: '交互终端' }] as const)" :key="t.id" type="button" role="tab" :aria-selected="runTab === t.id" class="min-h-11 flex-1 px-3 text-sm transition-colors" :class="runTab === t.id ? 'border-b-2 border-primary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'" @click="runTab = t.id">{{ t.label }}</button>
              </div>
              <div v-show="runTab === 'test'" class="space-y-3 p-3">
                <!-- 样例只读展示；自定义样例可多写，「运行」一次全跑。 -->
                <div v-for="(t, i) in sampleCases" :key="`sample-${i}`" class="space-y-2 rounded-lg border p-3">
                  <span class="text-sm font-medium">{{ t.name }}</span>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <div><p class="text-xs text-muted-foreground">输入</p><pre class="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/60 p-2 font-mono text-xs">{{ t.input }}</pre></div>
                    <div><p class="text-xs text-muted-foreground">期望输出</p><pre class="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/60 p-2 font-mono text-xs">{{ t.output }}</pre></div>
                  </div>
                </div>
                <CustomTestCases v-model="customCases" :point="customPoint" :busy="!!busy" />
              </div>
              <div v-show="runTab === 'tty'" class="p-3">
                <TerminalPane v-if="ttyStarted && ttyUsable" :key="ttyKey" :launch="launchTty" @close="ttyStarted = false" />
                <p v-else class="text-sm text-muted-foreground">{{ ttyStarted ? ttyReason : (ttyUsable ? '逐行输入、实时输出的终端。点「运行」启动会话。' : ttyReason || '语言包就绪后可用。') }}</p>
              </div>
              <div class="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                <Button :disabled="!!busy || !ready || (runTab === 'tty' && !ttyUsable)" @click="runActive"><Play class="mr-2 h-4 w-4" />{{ busy ? '运行中' : '运行' }}</Button>
                <Button v-if="busy && !saving" variant="outline" @click="controller?.abort()"><Square class="mr-2 h-4 w-4" />取消</Button>
                <span v-if="progress" class="text-xs text-muted-foreground" role="status">{{ progress.phase }}<span v-if="progress.points"> · {{ progress.point }}/{{ progress.points }}</span></span>
              </div>
            </div>
          </div>
          <section v-if="result && runTab === 'test'" class="min-w-0 space-y-3 rounded-xl border p-5" aria-label="评测结果" aria-live="polite">
            <VerdictDots :points="result.points" :label="resultMode === 'all' ? '提交结果' : '运行结果'" />
            <p v-if="resultSource !== source" class="text-xs text-muted-foreground">源码已修改，以下结果对应本次评测开始时的代码。</p>
            <!-- 提交只看判定；运行样例才展开输入输出。 -->
            <details v-for="(point, index) in resultMode === 'samples' ? result.points : (resultMode === 'test' ? result.points.slice(0, sampleCount) : [])" :key="index" :open="point.verdict !== 'AC'" class="min-w-0 rounded-lg border p-3">
              <summary class="cursor-pointer text-sm">{{ point.name }} · {{ verdictLabels[point.verdict] }}<span v-if="point.elapsedMs !== undefined" class="ml-2 text-xs text-muted-foreground">{{ Math.round(point.elapsedMs) }} ms（本机）</span></summary>
              <p v-if="point.error" class="mt-3 break-words text-sm text-destructive">{{ point.error }}</p><p class="mt-3 text-xs text-muted-foreground">标准输出</p><pre class="mt-1 max-h-64 max-w-full overflow-auto whitespace-pre rounded-md bg-muted p-3 text-xs">{{ point.stdout || '（空）' }}</pre>
              <template v-if="point.verdict === 'WA'"><p class="mt-3 text-xs text-muted-foreground">期望输出</p><pre class="mt-1 max-h-64 max-w-full overflow-auto rounded-md bg-muted p-3 text-xs">{{ point.expected }}</pre></template>
              <pre v-if="point.stderr" class="mt-3 max-h-64 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{{ point.stderr }}</pre>
            </details>
            <Button v-if="!saved && pendingRecord && user && !error" variant="outline" :disabled="saving" @click="saveRecord">{{ saving ? '同步中…' : '同步本次记录' }}</Button>
          </section>
        </section>
      </div>
    </template>
  </div>
</template>
