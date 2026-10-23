<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Play, Square, Settings2, Maximize2, Minimize2, FileCode2, Download, Upload, Copy, RotateCcw, Terminal, FlaskConical, History, CheckCircle2, LoaderCircle, Send, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'radix-vue'
import { environments, starter, loadLastEnv, saveLastEnv, type Environment, type JudgeResult, type Progress, type Problem } from '../../lib/learning/types'
import { useLearningRuntime } from '../../lib/learning/runtime'
import { learningApi } from '../../lib/learning/api'
import { useAuth } from '../../lib/auth'
import { confirmAction } from '../../lib/confirm'
import { recordSnapshot } from '../../lib/learning/snapshots'
import { makePendingSubmission, storePendingSubmission, loadPendingSubmissions, removePendingSubmission, type PendingSubmission } from '../../lib/learning/submissions'
import { caseSignature, filenameOf, loadCases, loadPreferences, saveLocal, downloadText, clipText, type CustomCase, type WorkspaceCase, type CaseResult } from '../../lib/learning/workspace'
import { dragVertical, loadSplit, saveSplit } from '../../lib/learning/resize'
import { verdictStatus } from '../../lib/learning/verdictStyle'
import type { TtyEvent } from '../../lib/learning/engine'
import Button from '../ui/button/Button.vue'
import IconButton from '../ui/IconButton.vue'
import ActionNotice from '../ui/ActionNotice.vue'
import CodeEditor from './CodeEditor.vue'
import TestConsole from './TestConsole.vue'
import TerminalPane from './TerminalPane.vue'
import SnapshotPane from './SnapshotPane.vue'
import ScreenshotButton from './ScreenshotButton.vue'
import WorkspaceDialog from './WorkspaceDialog.vue'

const props = defineProps<{ problem?: Problem }>()
const emit = defineEmits<{ passed: [] }>()
const bucket = props.problem ? String(props.problem.id) : 'ide'
const allowed = computed(() => environments.filter(e => !props.problem || props.problem.content.environments.includes(e.id)))
const environment = ref<Environment>(allowed.value.find(e => e.id === 'cpp')?.id || allowed.value[0]!.id)
const source = ref(starter[environment.value])
const preferences = ref(loadPreferences())
const customCases = ref<CustomCase[]>([])
const samples = computed(() => props.problem?.content.tests.filter(t => t.sample) || [])
const tests = computed<WorkspaceCase[]>(() => [
  ...samples.value.map((t, i) => ({ ...t, id: `s:${i}`, editable: false })),
  ...customCases.value.map((t, i) => ({ id: `c:${t.id}`, name: `自定义 ${i + 1}`, input: t.input, output: t.expected, sample: true, editable: true })),
])
const runtime = useLearningRuntime({ environment, code: source })
const { engine, ready, catalog, lspPhase, lspReason, completion, diagnostics } = runtime
const runtimePackage = computed(() => catalog.value?.runtimes.find(r => r.id === environments.find(e => e.id === environment.value)?.runtime))
const busy = ref<'test' | 'submit' | 'tty' | null>(null), progress = ref<Progress | null>(null)
const error = ref(''), notice = ref(''), saveState = ref('草稿已保存')
const caseResults = ref<Record<string, CaseResult>>({}), testCode = ref(''), testOptions = ref('')
const submitted = ref<{ verdict: JudgeResult['verdict']; passed: number; total: number; diagnostic?: string } | null>(null), submittedCode = ref(''), submittedEnv = ref<Environment>('cpp')
const dockTab = ref('tests'), dockCollapsed = ref(false), historyRevision = ref(0)
const settingsOpen = ref(false), expanded = ref(false)
const timeMs = ref(10000), checker = ref<'tokens' | 'exact'>('tokens')
const testConsole = ref<InstanceType<typeof TestConsole> | null>(null)
const editor = ref<InstanceType<typeof CodeEditor> | null>(null)
const terminal = ref<InstanceType<typeof TerminalPane> | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const editorHost = ref<HTMLElement | null>(null)
const editorHeight = ref(loadSplit('editor-height', 380))
const ttyStarted = ref(false), ttyKey = ref(0)
const { user, ensureLoaded, ready: authReady } = useAuth()
let initialized = false, alive = true, controller: AbortController | undefined
let persistTimer: ReturnType<typeof setTimeout> | undefined
const pendingRecord = ref<PendingSubmission | null>(null), pendingSaved = ref(true), syncLoginRequired = ref(false)
const syncing = ref(false), synced = ref(false)
const draftKey = (env: Environment) => bucket === 'ide' ? `learning-ide:draft:${env}` : `learning-draft:${bucket}:${env}`
const optionsSignature = computed(() => JSON.stringify([timeMs.value, checker.value, environment.value]))
const stale = computed(() => source.value !== testCode.value || optionsSignature.value !== testOptions.value)
const jspi = typeof (globalThis.WebAssembly as { promising?: unknown } | undefined)?.promising === 'function'
const ttyReason = computed(() => !jspi ? '交互终端需要支持 JSPI 的新版 Chrome 或 Edge，可使用测试样例运行。'
  : environment.value.startsWith('java') ? 'Java 暂不支持逐行交互，请在测试台填写标准输入运行。' : '')
const canRun = computed(() => ready.value && !busy.value && !syncing.value && !!engine.value)
const canSubmit = computed(() => canRun.value && authReady.value && !pendingRecord.value)
const canRunActive = computed(() => canRun.value && (dockTab.value === 'tty' ? !ttyReason.value : tests.value.length > 0))
const runDisabledReason = computed(() => busy.value ? '请等待当前运行结束' : !ready.value ? '请先安装当前语言包' : dockTab.value === 'tty' ? ttyReason.value : !tests.value.length ? '添加一个测试样例后即可运行' : '')
const selectedLanguage = computed(() => environments.find(e => e.id === environment.value)!.label)
const submissionStatus = computed(() => submitted.value ? verdictStatus(submitted.value.verdict) : null)
const passed = computed(() => submitted.value?.passed || 0)
const cursor = ref({ line: 1, column: 1 })

function persist() {
  if (!initialized) return
  try { localStorage.setItem(draftKey(environment.value), source.value); saveState.value = '草稿已保存' }
  catch { saveState.value = '草稿保存失败'; notice.value = '浏览器无法保存草稿，请下载源码后再离开。' }
}
function readDraft(env: Environment) {
  try { return localStorage.getItem(draftKey(env)) ?? starter[env] } catch { return starter[env] }
}
watch(source, () => {
  if (!initialized) return
  saveState.value = '正在保存…'; clearTimeout(persistTimer); persistTimer = setTimeout(persist, 250)
})
watch(customCases, value => {
  if (initialized && !saveLocal(`learning:cases:${bucket}`, value)) notice.value = '测试数据保存失败，请复制保留。'
}, { deep: true })
watch(preferences, value => { if (initialized) saveLocal('learning:editor-preferences', value) }, { deep: true })
watch([timeMs, checker], () => { if (initialized) saveLocal('learning:run-options', { timeMs: timeMs.value, checker: checker.value }) })
watch(expanded, value => { document.body.style.overflow = value ? 'hidden' : oldOverflow })
let oldOverflow = ''
function changeEnvironment(event: Event) {
  if (busy.value) return
  persist(); clearTimeout(persistTimer)
  environment.value = (event.target as HTMLSelectElement).value as Environment
  saveLastEnv(environment.value); source.value = readDraft(environment.value)
  caseResults.value = {}; ttyStarted.value = false; persist()
  void runtime.switchEnvironment()
}
function restoreSource(code: string) { if (!busy.value) { source.value = code; persist(); dockTab.value = 'tests'; void nextTick(() => editor.value?.focus()) } }
function resize(event: PointerEvent) {
  const top = editorHost.value?.getBoundingClientRect().top ?? event.clientY
  dragVertical(event, y => { editorHeight.value = Math.max(220, Math.min(800, Math.round(y - top))) }, () => saveSplit('editor-height', editorHeight.value))
}
function resizeKey(event: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault(); editorHeight.value = event.key === 'Home' ? 220 : event.key === 'End' ? 800 : Math.max(220, Math.min(800, editorHeight.value + (event.key === 'ArrowDown' ? 40 : -40)))
  saveSplit('editor-height', editorHeight.value)
}
function restorePending(skipId?: string): boolean {
  if (!props.problem || !user.value || !alive) return false
  if (pendingRecord.value) return true
  const pending = loadPendingSubmissions(user.value, props.problem.id).find(p => p.record.id !== skipId)
  if (!pending) return false
  pendingRecord.value = pending; pendingSaved.value = true; synced.value = false
  submitted.value = { verdict: pending.record.verdict as JudgeResult['verdict'], passed: pending.passed, total: pending.total }
  submittedCode.value = pending.record.source; submittedEnv.value = pending.record.environment
  dockTab.value = 'submission'; dockCollapsed.value = false
  notice.value = '上次提交尚未同步，成功同步后才计入练习记录和集训成绩。'
  return true
}
watch(() => user.value?.id, () => {
  pendingRecord.value = null; syncLoginRequired.value = false; synced.value = false
  submitted.value = null
  if (initialized) restorePending()
})
async function syncRecord() {
  const pending = pendingRecord.value
  if (!pending || syncing.value || synced.value || !user.value || pending.owner.id !== user.value.id || pending.owner.student_id !== user.value.student_id) return
  syncing.value = true; syncLoginRequired.value = false
  try {
    await learningApi.record(pending.record)
    removePendingSubmission(pending)
    if (alive && pendingRecord.value?.record.id === pending.record.id && user.value?.id === pending.owner.id) {
      pendingRecord.value = null; synced.value = true; notice.value = ''
      if (pending.record.verdict === 'AC') emit('passed')
      restorePending(pending.record.id)
    }
  } catch (e) {
    if (alive && pendingRecord.value?.record.id === pending.record.id) {
      syncLoginRequired.value = [401, 403].includes((e as { status?: number }).status || 0)
      notice.value = syncLoginRequired.value ? '登录状态已变化，请重新登录原账号后同步。'
        : pendingSaved.value ? '评测已完成，记录同步失败。待同步记录已保存，刷新后可继续重试。'
          : '记录同步失败，浏览器也无法保存待同步记录。请保持页面打开并重试同步。'
    }
  } finally { if (alive) syncing.value = false }
}
function codeWithinLimit() {
  if (new Blob([source.value]).size <= 256000) return true
  error.value = '源码不能超过 256,000 字节，请缩减内容后重试。'
  return false
}
async function execute(mode: 'test' | 'submit', single?: WorkspaceCase) {
  if (!canRun.value || !engine.value || !codeWithinLimit()) return
  const selected = single ? [single] : tests.value
  if (mode === 'test' && !selected.length) return
  if (mode === 'submit' && (!props.problem || !canSubmit.value || restorePending())) return
  busy.value = mode; error.value = ''; notice.value = ''; dockCollapsed.value = false
  dockTab.value = mode === 'submit' ? 'submission' : 'tests'
  controller = new AbortController(); persist()
  const owner = user.value ? { id: user.value.id, student_id: user.value.student_id } : null
  const code = source.value, env = environment.value, signature = optionsSignature.value
  const snapshotSource = mode === 'submit' ? 'submit' : 'test'
  recordSnapshot(bucket, env, code, snapshotSource); historyRevision.value++
  try {
    if (mode === 'submit') {
      submitted.value = null; synced.value = false; syncLoginRequired.value = false
      const content = props.problem!.content
      const judged = await engine.value.run({ source: code, environment: env, cases: content.tests,
        checker: content.checker, checkerSource: content.checker_source, timeMs: content.time_ms }, controller.signal, p => { if (alive) progress.value = p })
      if (!alive) return
      submitted.value = { verdict: judged.verdict, passed: judged.points.filter(p => p.verdict === 'AC').length, total: judged.points.length,
        diagnostic: judged.verdict === 'CE' ? clipText(judged.points[0]?.stderr || judged.points[0]?.error || '请检查编译诊断。') : undefined }
      submittedCode.value = code; submittedEnv.value = env
      recordSnapshot(bucket, env, code, snapshotSource, judged.verdict)
      if (owner && !['ENVIRONMENT_ERROR', 'CANCELLED'].includes(judged.verdict)) {
        const pending = makePendingSubmission(owner, props.problem!.id,
          { source: code, environment: env, version_id: props.problem!.version_id, id: judged.id, runtime_version: judged.runtimeVersion, verdict: judged.verdict }, judged)
        const saved = storePendingSubmission(pending)
        if (user.value?.id === owner.id && user.value.student_id === owner.student_id) {
          pendingRecord.value = pending; pendingSaved.value = saved
          await syncRecord()
        } else notice.value = '登录账号已变化，请使用原账号恢复待同步记录。'
      }
    } else {
      // 按是否自定义分批：题目样例严格比较空输出，自定义空期望只执行。
      // 两批共用编译缓存；每个结果用测试 ID + 当时数据关联，删除/修改后不会错位。
      if (code !== testCode.value || signature !== testOptions.value) caseResults.value = {}
      testCode.value = code; testOptions.value = signature
      for (const t of selected) delete caseResults.value[t.id]
      const groups = [selected.filter(t => !t.editable), selected.filter(t => t.editable)].filter(g => g.length)
      let completed = 0
      const verdicts: JudgeResult['verdict'][] = []
      for (const group of groups) {
        const custom = group[0]!.editable
        const content = props.problem?.content
        const compareWith = content ? (custom && content.checker === 'spj' ? 'tokens' : content.checker) : checker.value
        const judged = await engine.value.run({ source: code, environment: env, cases: group.map(t => ({ name: t.name, input: t.input, output: t.output, sample: true })), custom,
          checker: compareWith,
          checkerSource: !custom ? content?.checker_source : undefined, timeMs: content?.time_ms || timeMs.value }, controller.signal,
          p => { if (alive) progress.value = { ...p, point: p.point ? p.point + completed : undefined, points: selected.length } })
        if (!alive) return
        judged.points.forEach((point, i) => { const t = group[i]; if (t) caseResults.value[t.id] = { signature: caseSignature(t), point } })
        verdicts.push(judged.verdict); completed += group.length
      }
      recordSnapshot(bucket, env, code, snapshotSource, verdicts.find(v => v !== 'AC') || 'AC')
    }
    historyRevision.value++
  } catch (e) {
    if (alive) {
      if (mode === 'submit' && !submitted.value) dockTab.value = 'tests'
      if ((e as Error).name === 'AbortError') notice.value ||= '运行已停止，代码和测试数据已保留。'
      else error.value = e instanceof Error ? e.message : String(e)
    }
  } finally { if (alive) { busy.value = null; controller = undefined; progress.value = null } }
}
function launchTerminal(onEvent: (e: TtyEvent) => void) {
  const code = source.value, env = environment.value, sessionKey = ttyKey.value
  recordSnapshot(bucket, env, code, 'run'); historyRevision.value++
  return engine.value!.terminal(env, code, e => {
    onEvent(e)
    if (e.event === 'exit' && alive && busy.value === 'tty' && ttyKey.value === sessionKey) { busy.value = null; progress.value = null }
  })
}
function runActive() {
  if (!canRunActive.value) return
  if (dockTab.value === 'tty') { if (!codeWithinLimit()) return; error.value = ''; busy.value = 'tty'; ttyStarted.value = true; ttyKey.value++; dockCollapsed.value = false }
  else void execute('test')
}
function closeTerminal() {
  ttyStarted.value = false
  if (busy.value === 'tty') { busy.value = null; progress.value = null }
}
function stop() { if (busy.value === 'tty') terminal.value?.stop(); else controller?.abort() }
function shortcut(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !document.querySelector('[role="dialog"]')) {
    event.preventDefault(); persist(); recordSnapshot(bucket, environment.value, source.value, 'run'); historyRevision.value++; notice.value = '代码快照已保存。'; return
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    if (settingsOpen.value || document.querySelector('[role="dialog"]')) return
    if (event.shiftKey && props.problem) void execute('submit'); else runActive()
  }
  if (event.key === 'Escape' && expanded.value && !document.querySelector('[role="dialog"]')) expanded.value = false
}
async function resetCode() {
  if (busy.value) return
  const env = environment.value
  if (!await confirmAction('当前代码会先保存为快照，再恢复为当前语言的起始模板。', '重置代码')) return
  if (!alive || busy.value || environment.value !== env) return
  recordSnapshot(bucket, env, source.value, 'run'); historyRevision.value++; source.value = starter[env]; persist()
}
async function copyCode() {
  try { await navigator.clipboard.writeText(source.value); notice.value = '源码已复制。' }
  catch { error.value = '复制失败，请下载源码或在编辑器内复制。' }
}
async function importCode(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = ''
  if (!file || busy.value) return
  if (file.size > 256000) { error.value = '源码文件不能超过 256,000 字节。'; return }
  const env = environment.value
  try {
    const code = await file.text()
    if (!alive || busy.value || env !== environment.value) return
    if (!await confirmAction(`将导入 ${file.name}。当前代码会先保存为快照。`, '导入源码')) return
    if (!alive || busy.value || env !== environment.value) return
    recordSnapshot(bucket, env, source.value, 'run'); historyRevision.value++; source.value = code; persist(); settingsOpen.value = false
  } catch { error.value = '无法读取这个文件。' }
}
function beforeUnload(event: BeforeUnloadEvent) { if (pendingRecord.value && !pendingSaved.value) event.preventDefault() }
function visibility() {
  if (document.hidden) { persist(); if (busy.value && busy.value !== 'tty') { controller?.abort(); notice.value = '页面进入后台，评测已中断；代码已保留。' } }
  else if (!busy.value) void runtime.refreshPackages().catch(() => undefined)
}
onMounted(() => {
  oldOverflow = document.body.style.overflow
  const last = loadLastEnv(); if (last && allowed.value.some(e => e.id === last)) environment.value = last
  source.value = readDraft(environment.value); customCases.value = loadCases(bucket)
  try {
    const options = JSON.parse(localStorage.getItem('learning:run-options') || '{}')
    if ([1000, 3000, 5000, 10000, 30000].includes(options.timeMs)) timeMs.value = options.timeMs
    if (options.checker === 'exact' || options.checker === 'tokens') checker.value = options.checker
  } catch { /* 使用默认值 */ }
  initialized = true
  void runtime.connect(); void ensureLoaded().then(() => { if (alive) restorePending() })
  window.addEventListener('beforeunload', beforeUnload)
  window.addEventListener('keydown', shortcut); document.addEventListener('visibilitychange', visibility)
})
onUnmounted(() => {
  persist(); alive = false; clearTimeout(persistTimer); controller?.abort(); document.body.style.overflow = oldOverflow
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('keydown', shortcut); document.removeEventListener('visibilitychange', visibility)
})
</script>
<template>
  <section class="coding-workspace notranslate" :class="{ 'workspace-expanded': expanded }" translate="no" aria-label="编程工作区">
    <div class="workspace-toolbar">
      <div class="flex min-w-0 items-center gap-2">
        <FileCode2 class="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <span class="hidden font-mono text-xs sm:inline">{{ filenameOf(environment) }}</span>
        <label class="sr-only" :for="`language-${bucket}`">编程语言</label>
        <select :id="`language-${bucket}`" :value="environment" class="form-select workspace-language" :disabled="!!busy" @change="changeEnvironment"><option v-for="e in allowed" :key="e.id" :value="e.id">{{ e.label }}</option></select>
      </div>
      <div class="flex items-center gap-0.5">
        <ScreenshotButton :code="source" :environment="environment" />
        <IconButton label="编辑器设置与文件" @click="settingsOpen = true"><Settings2 class="h-4 w-4" /></IconButton>
        <IconButton :label="expanded ? '退出专注模式' : '专注模式'" :aria-pressed="expanded" @click="expanded = !expanded"><Minimize2 v-if="expanded" class="h-4 w-4" /><Maximize2 v-else class="h-4 w-4" /></IconButton>
      </div>
    </div>
    <div v-if="runtime.error.value" class="workspace-notice"><ActionNotice :message="runtime.error.value" variant="error" /><Button variant="outline" :disabled="!!busy" @click="runtime.connect">重新连接</Button></div>
    <div v-else-if="!ready" class="workspace-runtime">
      <LoaderCircle v-if="!catalog" class="h-4 w-4 shrink-0 animate-spin" /><Download v-else class="h-4 w-4 shrink-0" />
      <span class="min-w-0 flex-1">{{ !catalog ? '正在连接运行环境…' : !runtimePackage?.available ? runtimePackage?.reason || '当前语言暂不可用' : `${selectedLanguage} 语言包尚未安装，代码仍可编辑。` }}</span>
      <a v-if="catalog && runtimePackage?.available" href="/learn/runtimes" class="min-h-11 shrink-0 content-center font-medium underline underline-offset-4">安装语言包</a>
    </div>
    <div ref="editorHost" class="workspace-code" :style="{ height: `${editorHeight}px` }">
      <!-- 每种语言重建编辑状态，撤销不得恢复另一种语言的草稿。 -->
      <CodeEditor :key="environment" ref="editor" v-model="source" :environment="environment" :completion="completion" :diagnostics="diagnostics" :font-size="preferences.fontSize" :tab-size="preferences.tabSize" :wrap="preferences.wrap" @cursor="cursor = $event" />
    </div>
    <div class="workspace-status">
      <span class="inline-flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full" :class="saveState === '草稿已保存' ? 'bg-emerald-500' : 'bg-amber-500'" />{{ saveState }}</span>
      <span class="ml-auto hidden sm:inline">Ln {{ cursor.line }}, Col {{ cursor.column }}</span>
      <button v-if="lspPhase === 'failed'" type="button" class="min-h-11 text-amber-600 underline dark:text-amber-400" :title="lspReason" @click="runtime.retryLsp">补全不可用 · 重试</button>
      <span v-else>{{ lspPhase === 'starting' ? '补全启动中…' : lspPhase === 'ready' ? '智能补全已就绪' : '代码片段补全' }}</span>
    </div>
    <div role="separator" tabindex="0" aria-orientation="horizontal" aria-label="调整编辑器高度" aria-valuemin="220" aria-valuemax="800" :aria-valuenow="editorHeight" class="workspace-resize" @pointerdown="resize" @keydown="resizeKey"><span /></div>
    <div class="workspace-notice" v-if="error || notice"><ActionNotice :message="error" variant="error" /><ActionNotice :message="notice" variant="info" /></div>
    <TabsRoot v-model="dockTab" class="min-w-0" activation-mode="automatic" @update:model-value="dockCollapsed = false">
      <div class="workspace-dockbar">
        <TabsList class="workspace-tabs" aria-label="运行与历史">
          <TabsTrigger value="tests" class="workspace-tab"><FlaskConical class="h-4 w-4" /><span>测试</span><span class="tab-count">{{ tests.length }}</span></TabsTrigger>
          <TabsTrigger value="tty" class="workspace-tab"><Terminal class="h-4 w-4" /><span>终端</span></TabsTrigger>
          <TabsTrigger value="history" class="workspace-tab" aria-label="代码快照"><History class="h-4 w-4" /><span>历史</span></TabsTrigger>
          <TabsTrigger v-if="submitted || busy === 'submit'" value="submission" class="workspace-tab"><CheckCircle2 class="h-4 w-4" /><span>提交结果</span></TabsTrigger>
        </TabsList>
        <IconButton :label="dockCollapsed ? '展开测试台' : '收起测试台'" :aria-expanded="!dockCollapsed" @click="dockCollapsed = !dockCollapsed"><ChevronDown v-if="dockCollapsed" class="h-4 w-4" /><ChevronUp v-else class="h-4 w-4" /></IconButton>
      </div>
      <div v-show="!dockCollapsed" class="workspace-dock-content">
        <TabsContent value="tests" class="outline-none" force-mount :hidden="dockTab !== 'tests'">
          <TestConsole ref="testConsole" v-model="customCases" :samples="samples" :results="caseResults" :busy="!!busy" :runnable="ready" :stale="stale" @run="execute('test', $event)" />
          <p v-if="problem?.content.checker === 'spj'" class="px-4 pb-3 text-xs text-muted-foreground">题目样例使用 Special Judge；自定义样例按期望输出比较，留空则只运行。</p>
        </TabsContent>
        <TabsContent value="tty" class="outline-none" force-mount :hidden="dockTab !== 'tty'">
          <TerminalPane v-if="ttyStarted" :key="ttyKey" ref="terminal" :launch="launchTerminal" @close="closeTerminal" />
          <div v-else class="flex flex-col items-center gap-3 px-5 py-9 text-center"><Terminal class="h-7 w-7 text-muted-foreground/60" stroke-width="1.5" /><p class="text-sm font-medium">交互终端</p><p class="max-w-md text-xs leading-6 text-muted-foreground">{{ ttyReason || '点击运行后，程序输出会实时显示。输入数据并按 Enter 发送，Ctrl+D 结束输入，Ctrl+C 停止程序。' }}</p></div>
        </TabsContent>
        <TabsContent value="history" class="outline-none"><SnapshotPane :bucket="bucket" :environment="environment" :current="source" :disabled="!!busy" :revision="historyRevision" @restore="restoreSource" /></TabsContent>
        <TabsContent v-if="submitted || busy === 'submit'" value="submission" class="outline-none">
          <section class="space-y-3 p-5" aria-label="提交结果" aria-live="polite">
            <div v-if="busy === 'submit'" class="flex items-center gap-2 py-4 text-sm text-muted-foreground"><LoaderCircle class="h-4 w-4 animate-spin" />正在评测…</div>
            <template v-else-if="submitted && submissionStatus">
              <div class="flex flex-wrap items-center gap-3"><CheckCircle2 v-if="submitted.verdict === 'AC'" class="h-6 w-6 text-emerald-500" /><p class="text-lg font-semibold" :class="submissionStatus.cls">{{ submissionStatus.text }}</p><span class="text-xs text-muted-foreground">{{ passed }} / {{ submitted.total }} 测试点通过</span></div>
              <p v-if="source !== submittedCode || environment !== submittedEnv" class="text-xs text-amber-600 dark:text-amber-400">代码或语言已修改，此结果对应上次提交。</p>
              <pre v-if="submitted.verdict === 'CE'" class="test-data text-destructive">{{ submitted.diagnostic || '请检查编译诊断。' }}</pre>
              <p class="text-xs text-muted-foreground">{{ synced ? '本次提交已同步到练习记录。' : !user ? '登录后重新提交，可保存练习记录。' : pendingRecord ? '本次提交尚未同步，暂未计入练习记录和集训成绩。' : '' }}</p>
              <Button v-if="pendingRecord && !synced && user" variant="outline" :disabled="syncing" @click="syncRecord">{{ syncing ? '同步中…' : '重试同步记录' }}</Button>
              <a v-if="(!user && submitted) || syncLoginRequired" href="/login" class="inline-flex min-h-11 items-center text-sm underline underline-offset-4">前往登录</a>
            </template>
          </section>
        </TabsContent>
      </div>
    </TabsRoot>
    <div class="workspace-actions">
      <p v-if="progress" class="min-w-0 flex-1 text-xs text-muted-foreground" role="status">{{ progress.phase }}<span v-if="progress.points"> · {{ progress.point || 0 }} / {{ progress.points }}</span></p>
      <span v-else class="hidden min-w-0 flex-1 text-xs text-muted-foreground sm:block">{{ dockTab === 'tty' ? '交互输入 · 实时输出' : problem ? `每点 ${problem.content.time_ms} ms` : `${timeMs / 1000}s 时限 · ${checker === 'tokens' ? '忽略空白比较' : '逐字比较'}` }}</span>
      <Button v-if="busy" variant="outline" class="ml-auto" @click="stop"><Square class="mr-2 h-3.5 w-3.5" />停止</Button>
      <Button v-else variant="outline" :disabled="!canRunActive" :title="runDisabledReason || 'Ctrl / ⌘ + Enter'" class="ml-auto" @click="runActive"><Play class="mr-2 h-3.5 w-3.5" />{{ dockTab === 'tty' ? '运行终端' : '运行测试' }}<kbd aria-hidden="true" class="ml-3 hidden text-[10px] opacity-50 lg:inline">⌘ ↵</kbd></Button>
      <Button v-if="problem" :disabled="!canSubmit" :title="pendingRecord ? '请先同步上次提交记录' : 'Ctrl / ⌘ + Shift + Enter'" @click="execute('submit')"><Send class="mr-2 h-3.5 w-3.5" />提交代码</Button>
    </div>
    <WorkspaceDialog v-model:open="settingsOpen" title="编辑器设置与文件" description="设置自动保存在此浏览器，对云端 IDE 和做题页同时生效。">
      <div class="space-y-6">
        <ActionNotice :message="notice" variant="info" /><ActionNotice :message="error" variant="error" />
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label for="editor-font" class="mb-2 block text-sm">字体大小</label><select id="editor-font" v-model="preferences.fontSize" class="form-select w-full"><option v-for="n in [12, 13, 14, 16, 18]" :key="n" :value="n">{{ n }} px</option></select></div>
          <div><label for="editor-indent" class="mb-2 block text-sm">缩进宽度</label><select id="editor-indent" v-model="preferences.tabSize" class="form-select w-full"><option v-for="n in [2, 4, 8]" :key="n" :value="n">{{ n }} 个空格</option></select></div>
          <label class="flex min-h-11 items-center gap-3 text-sm"><input v-model="preferences.wrap" type="checkbox" class="h-4 w-4 accent-current" />自动折行</label>
        </div>
        <div v-if="!problem" class="grid gap-4 border-t pt-5 sm:grid-cols-2"><div><label for="run-time" class="mb-2 block text-sm">每点运行时限</label><select id="run-time" v-model="timeMs" :disabled="!!busy" class="form-select w-full"><option v-for="n in [1000, 3000, 5000, 10000, 30000]" :key="n" :value="n">{{ n / 1000 }} 秒</option></select></div><div><label for="run-checker" class="mb-2 block text-sm">答案比较</label><select id="run-checker" v-model="checker" :disabled="!!busy" class="form-select w-full"><option value="tokens">忽略空白</option><option value="exact">逐字比较</option></select></div></div>
        <div class="border-t pt-5"><p class="mb-3 text-sm font-medium">源码文件</p><input ref="fileInput" type="file" accept=".c,.cpp,.cc,.cxx,.h,.py,.java,.txt" class="hidden" aria-label="导入源码文件" @change="importCode" /><div class="flex flex-wrap gap-2"><Button variant="outline" :disabled="!!busy" @click="fileInput?.click()"><Upload class="mr-2 h-4 w-4" />导入源码</Button><Button variant="outline" @click="downloadText(source, filenameOf(environment))"><Download class="mr-2 h-4 w-4" />下载源码</Button><Button variant="outline" @click="copyCode"><Copy class="mr-2 h-4 w-4" />复制源码</Button><Button variant="outline" :disabled="!!busy" @click="resetCode"><RotateCcw class="mr-2 h-4 w-4" />重置模板</Button></div></div>
        <div class="border-t pt-5 text-xs leading-7 text-muted-foreground"><p>运行测试：Ctrl / ⌘ + Enter<span v-if="problem"> · 提交：Ctrl / ⌘ + Shift + Enter</span></p><p>编辑器搜索：Ctrl / ⌘ + F · 撤销：Ctrl / ⌘ + Z</p><p>代码和自定义测试保存在当前浏览器。清理浏览器数据前请下载源码。</p><a href="/learn/runtimes" class="inline-flex min-h-11 items-center gap-2 text-foreground underline underline-offset-4"><Download class="h-3.5 w-3.5" />管理语言包</a></div>
      </div>
    </WorkspaceDialog>
  </section>
</template>
