<script setup lang="ts">
/**
 * 云端 IDE：不绑定具体题目，随便写点代码跑一下。
 *
 * 复用做题页的编辑器与运行器：CodeEditor、LearningEngine、语言服务都走同一套，
 * 所以补全、诊断、语言包管理的行为和做题页完全一致，不会出现两套逻辑。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Download, Play, Square } from 'lucide-vue-next'
import { environments, starter, type Environment, type JudgeResult, type Progress } from '../../lib/learning/types'
import { useLearningRuntime, runtimeIdOf } from '../../lib/learning/runtime'
import Button from '../ui/button/Button.vue'
import VerdictDots from './VerdictDots.vue'
import CodeEditor from './CodeEditor.vue'
import ActionNotice from '../ui/ActionNotice.vue'

const environment = ref<Environment>('cpp')
const source = ref(starter.cpp)
const busy = ref<'run' | null>(null)
const progress = ref<Progress | null>(null)
const result = ref<JudgeResult | null>(null)
const error = ref(''), notice = ref('')
const stdin = ref('')
let controller: AbortController | undefined

const runtime = useLearningRuntime({ environment, code: source })
const { engine, catalog, packages, ready, lspPhase, lspReason, completion, diagnostics } = runtime
const current = computed(() => catalog.value?.runtimes.find(r => r.id === runtimeIdOf(environment.value)) || null)
const installed = computed(() => packages.value.find(p => p.id === runtimeIdOf(environment.value))?.ready === true)

function changeEnvironment(event: Event) {
  if (busy.value) return
  environment.value = (event.target as HTMLSelectElement).value as Environment
  source.value = starter[environment.value]
  result.value = null
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
      cases: [{ name: '运行', input: stdin.value, output: '', sample: true }],
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

const stdout = computed(() => result.value?.points[0]?.stdout ?? '')
const stderr = computed(() => result.value?.points[0]?.stderr ?? '')
const failed = computed(() => result.value?.points[0]?.error || '')
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

    <div class="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
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
            <span v-else-if="lspPhase === 'failed'" class="text-xs text-amber-600 dark:text-amber-400" :title="lspReason">语言服务不可用</span>
            <Button class="ml-auto" :disabled="!!busy || !ready" @click="run">
              <Play v-if="!busy" class="mr-2 h-4 w-4" /><Square v-else class="mr-2 h-4 w-4" />{{ busy ? '运行中' : '运行' }}
            </Button>
            <Button v-if="busy" variant="outline" @click="controller?.abort()">取消</Button>
          </div>
          <div id="ide-code" role="group" aria-label="源码">
            <CodeEditor v-model="source" :environment="environment" :readonly="!!busy" :completion="completion" :diagnostics="diagnostics" />
          </div>
          <p v-if="progress" class="text-xs text-muted-foreground" role="status">{{ progress.phase }}<span v-if="progress.points"> · {{ progress.point }}/{{ progress.points }}</span></p>
        </div>

        <div class="space-y-3 rounded-xl border p-4 sm:p-5">
          <label for="ide-stdin" class="text-sm font-medium">标准输入</label>
          <textarea id="ide-stdin" v-model="stdin" rows="4" class="w-full rounded-md border border-border bg-background/40 p-3 font-mono text-sm" placeholder="程序运行时读到的内容"></textarea>
        </div>
      </section>

      <section class="min-w-0 space-y-4">
        <div class="rounded-xl border p-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-medium">运行结果</h2>
            <span v-if="result" class="text-xs text-muted-foreground">{{ Math.round(result.points[0]?.elapsedMs || 0) }} ms</span>
          </div>
          <template v-if="result">
            <div class="mt-3"><VerdictDots :points="result.points" label="运行结果" /></div>
            <pre v-if="stdout" class="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{{ stdout }}</pre>
            <pre v-if="stderr" class="mt-2 max-h-40 overflow-auto rounded-md bg-destructive/10 p-3 text-xs text-destructive">{{ stderr }}</pre>
            <p v-if="failed" class="mt-2 break-words text-xs text-destructive">{{ failed }}</p>
            <p v-if="!stdout && !stderr && !failed" class="mt-3 text-xs text-muted-foreground">程序没有输出。</p>
          </template>
          <p v-else class="mt-3 text-sm text-muted-foreground">点「运行」看输出。</p>
        </div>
      </section>
    </div>
  </div>
</template>
