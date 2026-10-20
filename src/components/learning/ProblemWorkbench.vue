<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowLeft, Play, Square, Download, Plus, Trash2, Columns2, Rows2 } from 'lucide-vue-next'
import { useAuth } from '../../lib/auth'
import { learningApi } from '../../lib/learning/api'
import { LearningEngine } from '../../lib/learning/engine'
import { environments, size, starter, verdictLabels, type Environment, type JudgeResult, type Manifest, type PackageState, type Problem, type Progress } from '../../lib/learning/types'
import Button from '../ui/button/Button.vue'
import IconButton from '../ui/IconButton.vue'
import VerdictDots from './VerdictDots.vue'
import CodeEditor from './CodeEditor.vue'
import { lspExtension, serviceFor } from '../../lib/learning/lsp'
import type { LspId } from '../../lib/learning/types'
import ActionNotice from '../ui/ActionNotice.vue'
const { user, ensureLoaded } = useAuth()
const problem = ref<Problem | null>(null), environment = ref<Environment>('cpp'), source = ref('')
interface CustomCase { id: number; input: string; expected: string }
let customSeq = 0
const customCases = ref<CustomCase[]>([{ id: ++customSeq, input: '20 22\n', expected: '' }])
const addCase = () => { if (customCases.value.length < 20) customCases.value.push({ id: ++customSeq, input: '', expected: '' }) }
const removeCase = (id: number) => { if (customCases.value.length > 1) customCases.value = customCases.value.filter(c => c.id !== id) }
const catalog = ref<Manifest | null>(null), packages = ref<PackageState[]>([]), error = ref(''), notice = ref('')
// 补全与诊断随语言包安装，装好后自动可用；没装时编辑器照常能写能跑。
const lsp = ref<{ clangd: string | null, pyright: string | null }>({ clangd: null, pyright: null })
let lastService: LspId | null = null
const lspUnavailable = ref('')
const activeService = computed(() => serviceFor(environment.value))
const lspInstalled = computed(() => !!activeService.value && !!lsp.value[activeService.value])
// 语言服务器跑在运行器 origin，页面侧只持有 RPC 句柄。
const lspBinding = computed(() => lspExtension(() =>
  lspClientActive.value && engine && activeService.value ? { engine, service: activeService.value } : null))
const lspClientActive = ref(false)
// 用 computed 包一层：引用必须随 lspInstalled 变化，否则 CodeEditor 的
// watch 看不到更新，Compartment 不会重配，补全就永远挂不上。
const completionSource = computed(() => lspInstalled.value
  ? (context: import('@codemirror/autocomplete').CompletionContext) => lspBinding.value.completionSource(context)
  : undefined)
const diagnosticsExtension = computed(() => lspBinding.value.extension)

async function refreshLsp() {
  if (!engine) return
  try { lsp.value = await engine.lspStatus() } catch { /* 忽略 */ }
}
/** 启动语言服务器；切语言时先关旧的。 */
async function startLsp() {
  lspClientActive.value = false
  const service = activeService.value
  if (!service || !engine || !lsp.value[service]) return
  try {
    if (lastService && lastService !== service) await engine.lspStop(lastService).catch(() => undefined)
    await engine.lspStart(service, environment.value, source.value)
    if (!alive) return
    lastService = service
    lspClientActive.value = true
  } catch (e) {
    // 装好了但起不来（例如 clangd 需要 JSPI）——明确告诉用户不可用。
    lspUnavailable.value = String(e)
    notice.value = `语言服务启动失败：${String(e)}`
  }
}
const busy = ref<'run' | 'install' | null>(null), progress = ref<Progress | null>(null), result = ref<JudgeResult | null>(null)
const resultSource = ref(''), resultMode = ref(''), saving = ref(false), saved = ref(false), mobilePanel = ref('statement')
// 默认单列（题面在上、编辑器在下），切到双栏后记住选择。
const LAYOUT_KEY = 'learning-layout:split'
const split = ref(false)
function toggleSplit() {
  split.value = !split.value
  try { localStorage.setItem(LAYOUT_KEY, split.value ? '1' : '0') } catch { /* 隐私模式忽略 */ }
}
let engine: LearningEngine | undefined, controller: AbortController | undefined, alive = true, persistTimer: ReturnType<typeof setTimeout> | undefined
let pendingRecord: Parameters<typeof learningApi.record>[0] | undefined
const selected = computed(() => environments.find(e => e.id === environment.value)!)
// 通过之后只显示“通过”，不回退成运行完成之类的措辞。
// 自定义测试的结果就地显示在对应测试点里（输入/期望/实际在一起）。
const customPoint = (index: number) => resultMode.value === 'custom' ? result.value?.points[index] : undefined
const runtime = computed(() => catalog.value?.runtimes.find(r => r.id === selected.value.runtime))
const ready = computed(() => !!packages.value.find(p => p.id === selected.value.runtime)?.ready)
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
  void startLsp()
}
async function refreshPackages() {
  if (!engine) return
  const [m, s] = await Promise.all([engine.manifest(), engine.status()])
  if (alive) { catalog.value = m; packages.value = s }
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
    engine = new LearningEngine(); await refreshPackages(); await refreshLsp(); await startLsp()
    await ensureLoaded()
  } catch (e) { if (alive) error.value = String(e) }
})
onUnmounted(() => {
  persist(); alive = false; clearTimeout(persistTimer); controller?.abort()
  if (lastService) void engine?.lspStop(lastService).catch(() => undefined)
  engine?.dispose(); document.removeEventListener('visibilitychange', interruptBackground)
})
async function install() {
  if (busy.value || !engine || !runtime.value?.available) return
  busy.value = 'install'; error.value = ''; controller = new AbortController()
  try {
    await engine.install(selected.value.runtime, controller.signal, p => { progress.value = p })
    await refreshPackages()
    // 语言包装好后补全与诊断自动生效，不用再点一次。
    await refreshLsp(); await startLsp()
    notice.value = '环境已安装，可以运行代码。'
  }
  catch (e) { if ((e as Error).name !== 'AbortError') error.value = String(e); else notice.value = '下载已取消，草稿已保留。' }
  finally { busy.value = null; progress.value = null; controller = undefined }
}
async function run(mode: 'samples' | 'all' | 'custom') {
  if (busy.value || !engine || !problem.value || !ready.value) return
  persist(); busy.value = 'run'; error.value = ''; notice.value = ''; saved.value = false; pendingRecord = undefined
  controller = new AbortController()
  const snapshot = { source: source.value, environment: environment.value, version_id: problem.value.version_id }
  const content = problem.value.content
  const cases = mode === 'custom'
    ? customCases.value.map((c, i) => ({ name: `测试点 ${i + 1}`, input: c.input, output: c.expected, sample: true }))
    : content.tests.filter(t => mode === 'all' || t.sample)
  result.value = null; resultMode.value = mode; resultSource.value = snapshot.source; mobilePanel.value = 'editor'
  try {
    const judged = await engine.run({ environment: snapshot.environment, source: snapshot.source, cases,
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
            <div v-if="!runtime?.available" class="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{{ runtime?.reason || '正在读取运行包信息…' }}</div>
            <div v-else-if="!ready" class="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3"><p class="min-w-0 flex-1 text-sm">首次使用需下载约 {{ size(runtime.assets.reduce((n, a) => n + a.transferBytes, 0)) }}。</p><Button :disabled="!!busy" @click="install"><Download class="mr-2 h-4 w-4" />下载此环境</Button></div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium">源码</span>
              <span v-if="environment.startsWith('java')" class="text-sm text-muted-foreground">Main.java</span>
              <span v-if="lspInstalled && !lspUnavailable" class="text-xs text-emerald-600 dark:text-emerald-400">补全与诊断已开启</span>
              <span v-else-if="lspUnavailable" class="text-xs text-muted-foreground">该语言服务在当前浏览器不可用</span>
              <Button class="ml-auto" :disabled="!!busy || !ready" @click="run('all')"><Play class="mr-2 h-4 w-4" />提交</Button>
            </div>
            <div id="learning-code" role="group" aria-label="源码">
              <CodeEditor v-model="source" :environment="environment" :readonly="!!busy" :completion="completionSource" :diagnostics="diagnosticsExtension" />
            </div>
            <div class="flex flex-wrap gap-2"><Button variant="outline" :disabled="!!busy || !ready" @click="run('samples')">运行样例</Button><Button v-if="busy && !saving" variant="outline" @click="controller?.abort()"><Square class="mr-2 h-4 w-4" />取消{{ busy === 'run' ? '评测' : '下载' }}</Button></div>
            <p v-if="progress" class="text-sm text-muted-foreground" role="status">{{ progress.phase }}<span v-if="progress.points"> · {{ progress.point }}/{{ progress.points }}</span><span v-if="progress.total"> · {{ size(progress.done || 0) }}/{{ size(progress.total) }}（解码后）</span></p>
            <details class="rounded-lg border p-3" open>
              <summary class="cursor-pointer text-sm font-medium">自定义测试<span class="ml-2 font-normal text-muted-foreground">{{ customCases.length }} 个测试点</span></summary>
              <div class="mt-3 space-y-3">
                <div v-for="(c, i) in customCases" :key="c.id" class="space-y-2 rounded-lg border p-3">
                  <div class="flex items-center gap-2"><span class="mr-auto text-sm font-medium">测试点 {{ i + 1 }}</span><IconButton :label="`删除测试点 ${i + 1}`" destructive :disabled="!!busy || customCases.length <= 1" @click="removeCase(c.id)"><Trash2 class="h-4 w-4" /></IconButton></div>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <div><label :for="`custom-input-${c.id}`" class="text-xs text-muted-foreground">输入</label><textarea :id="`custom-input-${c.id}`" v-model="c.input" class="form-textarea mt-1 w-full font-mono text-xs" :disabled="!!busy" /></div>
                    <div><label :for="`custom-expected-${c.id}`" class="text-xs text-muted-foreground">期望输出（留空则只运行）</label><textarea :id="`custom-expected-${c.id}`" v-model="c.expected" class="form-textarea mt-1 w-full font-mono text-xs" :disabled="!!busy" /></div>
                  </div>
                  <div v-if="customPoint(i)" class="space-y-1 rounded-md bg-muted/60 p-2">
                    <VerdictDots :points="[customPoint(i)!]" :label="`测试点 ${i + 1}`" />
                    <pre class="max-h-40 overflow-auto whitespace-pre rounded bg-background/60 p-2 text-xs">{{ customPoint(i)!.stdout || '（空）' }}</pre>
                    <pre v-if="customPoint(i)!.stderr" class="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 text-xs text-destructive">{{ customPoint(i)!.stderr }}</pre>
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Button variant="outline" :disabled="!!busy || customCases.length >= 20" @click="addCase"><Plus class="mr-2 h-4 w-4" />添加测试点</Button>
                  <Button :disabled="!!busy || !ready" @click="run('custom')"><Play class="mr-2 h-4 w-4" />运行自定义测试</Button>
                </div>
              </div>
            </details>
          </div>
          <section v-if="result" class="min-w-0 space-y-3 rounded-xl border p-5" aria-label="评测结果" aria-live="polite">
            <VerdictDots :points="result.points" :label="resultMode === 'all' ? '提交结果' : '运行结果'" />
            <p v-if="resultSource !== source" class="text-xs text-muted-foreground">源码已修改，以下结果对应本次评测开始时的代码。</p>
            <!-- 提交只看判定；运行样例才展开输入输出。 -->
            <details v-for="(point, index) in resultMode === 'samples' ? result.points : []" :key="index" :open="point.verdict !== 'AC'" class="min-w-0 rounded-lg border p-3">
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
