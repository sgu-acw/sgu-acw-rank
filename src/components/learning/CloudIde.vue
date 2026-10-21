<script setup lang="ts">
/**
 * 云端 IDE：不绑定具体题目，随便写点代码跑一下。
 *
 * 复用做题页的编辑器与运行器：CodeEditor、LearningEngine、语言服务都走同一套，
 * 所以补全、诊断、语言包管理的行为和做题页完全一致，不会出现两套逻辑。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Download, Play, Square } from 'lucide-vue-next'
import { environments, starter, loadLastEnv, saveLastEnv, type Environment, type JudgeResult, type Progress } from '../../lib/learning/types'
import type { TtyEvent } from '../../lib/learning/engine'
import { useLearningRuntime, runtimeIdOf } from '../../lib/learning/runtime'
import Button from '../ui/button/Button.vue'
import TerminalPane from './TerminalPane.vue'
import CustomTestCases, { type CustomCase } from './CustomTestCases.vue'
import CodeEditor from './CodeEditor.vue'
import ActionNotice from '../ui/ActionNotice.vue'

const environment = ref<Environment>(loadLastEnv() ?? 'cpp')
const source = ref(starter[environment.value])
const busy = ref<'run' | null>(null)
const progress = ref<Progress | null>(null)
const result = ref<JudgeResult | null>(null)
const error = ref(''), notice = ref('')
const customCases = ref<CustomCase[]>([])
let controller: AbortController | undefined

// ---------- 交互终端 ----------
// 真交互：wasm 在等输入时挂起（JSPI），输入逐行喂进去，输出流式回来。
// Java 的 stdin 是 B-JVM 的同步 FFI，挂起不了，先不支持。
// eslint 不认识 WebAssembly.promising（TS DOM 类型里有但 lint env 没声明全局）。
const wasmGlobal = globalThis.WebAssembly as { promising?: unknown } | undefined
const jspi = typeof wasmGlobal?.promising === 'function'
const ttySupported = computed(() => ['c', 'cpp', 'python'].includes(environment.value))
const ttyHint = computed(() => !jspi
  ? '此浏览器不支持交互终端（需要较新的 Chrome 或 Edge）'
  : !ttySupported.value ? 'Java 暂不支持交互终端' : '')
const ttyUsable = computed(() => ready.value && !busy.value && ttySupported.value && jspi && !!engine.value)
// 一个「运行」按钮，当前 tab 决定跑法：自定义输入整段喂，终端开交互会话。
const runTab = ref<'custom' | 'tty'>('custom')
const ttyStarted = ref(false)
const ttyKey = ref(0)
function launchTerminal(onEvent: (e: TtyEvent) => void) {
  return engine.value!.terminal(environment.value, source.value, onEvent)
}
function runActive() {
  if (busy.value) return
  if (runTab.value === 'tty') {
    result.value = null; error.value = ''; notice.value = ''
    ttyStarted.value = true; ttyKey.value += 1
    return
  }
  void run()
}

const runtime = useLearningRuntime({ environment, code: source })
const { engine, catalog, packages, ready, lspPhase, lspReason, completion, diagnostics, retryLsp } = runtime
const current = computed(() => catalog.value?.runtimes.find(r => r.id === runtimeIdOf(environment.value)) || null)
const installed = computed(() => packages.value.find(p => p.id === runtimeIdOf(environment.value))?.ready === true)

function changeEnvironment(event: Event) {
  if (busy.value) return
  environment.value = (event.target as HTMLSelectElement).value as Environment
  saveLastEnv(environment.value)
  source.value = starter[environment.value]
  result.value = null
  ttyStarted.value = false
  void runtime.switchEnvironment()
}

/** 跑一次：用自定义输入，输出只看不判。 */
async function run() {
  if (busy.value || !engine.value || !ready.value) return
  busy.value = 'run'; error.value = ''; notice.value = ''; result.value = null
  controller = new AbortController()
  try {
    result.value = await engine.value.run({
      environment: environment.value, source: source.value,
      cases: customCases.value.map((c, i) => ({ name: `自定义样例 ${i + 1}`, input: c.input, output: c.expected, sample: true })),
      checker: 'tokens', timeMs: 10000, custom: true,
    }, controller.signal, p => { progress.value = p })
  } catch (e) {
    if ((e as Error).name !== 'AbortError') error.value = String(e)
  } finally { busy.value = null; progress.value = null; controller = undefined }
}

// 存草稿：切换页面回来还在，按语言分开存。
const KEY = 'learning-ide:draft:'
function persist() {
  try { localStorage.setItem(KEY + environment.value, source.value) } catch { /* 隐私模式忽略 */ }
}
function restore() {
  try {
    const saved = localStorage.getItem(KEY + environment.value)
    if (saved !== null) source.value = saved
  } catch { /* 隐私模式忽略 */ }
}
let timer: ReturnType<typeof setTimeout> | undefined
watch(source, () => { clearTimeout(timer); timer = setTimeout(persist, 400) })

onMounted(() => { restore(); void runtime.connect() })

</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold">云端 IDE</h1>
        <p class="mt-1 text-sm text-muted-foreground">代码在这里编译运行，不会离开你的浏览器。</p>
      </div>
      <a href="/learn/runtimes" class="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm hover:bg-muted">
        <Download class="h-4 w-4" />管理语言包
      </a>
    </div>

    <ActionNotice :message="error" variant="error" /><ActionNotice :message="notice" variant="info" />

    <div v-if="!current" class="rounded-lg bg-muted p-3 text-sm text-muted-foreground">正在读取语言包信息…</div>
    <div v-else-if="!current.available" class="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{{ current.reason }}</div>
    <div v-else-if="!installed" class="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3">
      <p class="min-w-0 flex-1 text-sm">{{ current?.label || '这个语言' }} 还没装好。</p>
      <a href="/learn/runtimes" class="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Download class="h-4 w-4" />去语言包页面安装</a>
    </div>

    <div class="min-w-0">
      <section class="min-w-0 space-y-4">
        <div class="space-y-3 rounded-xl border p-4 sm:p-5">
          <div class="flex flex-wrap items-center gap-3">
            <label for="ide-language" class="text-sm font-medium">语言</label>
            <select id="ide-language" class="form-select min-w-0 flex-1" :value="environment" :disabled="!!busy" @change="changeEnvironment">
              <option v-for="e in environments" :key="e.id" :value="e.id">{{ e.label }}</option>
            </select>
            <span v-if="lspPhase === 'starting'" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <span class="h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden="true"></span>语言服务启动中…
            </span>
            <span v-else-if="lspPhase === 'ready'" class="text-xs text-emerald-600 dark:text-emerald-400">补全与诊断已开启</span>
            <button v-else-if="lspPhase === 'failed'" type="button" class="text-xs text-amber-600 underline underline-offset-2 hover:text-amber-700 dark:text-amber-400" :title="lspReason" @click="retryLsp">语言服务不可用，点这重试</button>
            <Button class="ml-auto" :disabled="!!busy || !ready || (runTab === 'tty' && !ttyUsable)" @click="runActive">
              <Play v-if="!busy" class="mr-2 h-4 w-4" /><Square v-else class="mr-2 h-4 w-4" />{{ busy ? '运行中' : '运行' }}
            </Button>
            <Button v-if="busy" variant="outline" @click="controller?.abort()">取消</Button>
          </div>
          <div id="ide-code" role="group" aria-label="源码">
            <CodeEditor v-model="source" :environment="environment" :readonly="!!busy" :completion="completion" :diagnostics="diagnostics" />
          </div>
          <p v-if="progress" class="text-xs text-muted-foreground" role="status">{{ progress.phase }}<span v-if="progress.points"> · {{ progress.point }}/{{ progress.points }}</span></p>
        </div>

        <div class="overflow-hidden rounded-xl border">
          <div class="flex border-b" role="tablist" aria-label="运行方式">
            <button type="button" role="tab" :aria-selected="runTab === 'custom'" class="min-h-11 flex-1 px-3 text-sm transition-colors" :class="runTab === 'custom' ? 'border-b-2 border-primary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'" @click="runTab = 'custom'">自定义样例</button>
            <button type="button" role="tab" :aria-selected="runTab === 'tty'" class="min-h-11 flex-1 px-3 text-sm transition-colors" :class="runTab === 'tty' ? 'border-b-2 border-primary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'" @click="runTab = 'tty'">交互终端</button>
          </div>
          <div v-show="runTab === 'custom'" class="p-3">
            <CustomTestCases v-model="customCases" :point="i => result?.points[i]" :busy="!!busy" />
          </div>
          <div v-show="runTab === 'tty'" class="p-3">
            <TerminalPane v-if="ttyStarted && ttyUsable" :key="ttyKey" :launch="launchTerminal" @close="ttyStarted = false" />
            <p v-else class="text-sm text-muted-foreground">{{ ttyStarted ? ttyHint : (ttyUsable ? '逐行输入、实时输出的终端。点「运行」启动会话。' : ttyHint || '语言包就绪后可用。') }}</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
