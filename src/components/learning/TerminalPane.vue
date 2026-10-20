<script setup lang="ts">
/**
 * 交互终端面板：程序真实运行期间逐行喂输入、流式看输出。
 *
 * 通信链路：页面 → LearningEngine.terminal() → 运行器 origin 的 host → worker。
 * worker 里 wasm 用 JSPI 挂起等输入，事件循环不受阻塞。
 * 不支持 JSPI 的浏览器和 Java（B-JVM 同步 FFI）在更外层就被挡掉。
 */
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Send, Square, X } from 'lucide-vue-next'
import type { TtyEvent, TtySession } from '../../lib/learning/engine'
import IconButton from '../ui/IconButton.vue'

const props = defineProps<{
  /** 由父组件注入：把当前语言和源码打包成一个会话启动函数。 */
  launch: (onEvent: (e: TtyEvent) => void) => TtySession
}>()
const emit = defineEmits<{ close: [] }>()

interface Line { kind: 'out' | 'err' | 'in' | 'sys'; text: string }
const lines = ref<Line[]>([])
const status = ref('正在启动…')
const exited = ref(false)
const inputEnabled = ref(false)
const input = ref('')
const output = ref<HTMLElement | null>(null)
const inputBox = ref<HTMLInputElement | null>(null)
let session: TtySession | undefined

/** 把程序输出拼到最后一条同类行上；按字符追加，保持连续文本不碎成一格一条。 */
function append(kind: Line['kind'], text: string) {
  if (!text) return
  const last = lines.value[lines.value.length - 1]
  if (last && last.kind === kind && (kind === 'out' || kind === 'err')) last.text += text
  else lines.value.push({ kind, text })
  // 上限防止长会话把 DOM 堆爆。
  if (lines.value.length > 3000) lines.value.splice(0, lines.value.length - 3000)
  void nextTick(() => { output.value?.scrollTo({ top: output.value.scrollHeight }) })
}

function onEvent(e: TtyEvent) {
  switch (e.event) {
    case 'status': status.value = e.data || '处理中…'; break
    case 'ready':
      status.value = '等待输入'
      inputEnabled.value = true
      void nextTick(() => inputBox.value?.focus())
      break
    case 'out': append('out', e.data || ''); break
    case 'err': append('err', e.data || ''); break
    case 'error': append('sys', `✗ ${e.data || '出错'}`); break
    case 'exit':
      exited.value = true; inputEnabled.value = false
      status.value = e.verdict === 'CANCELLED' ? '已结束' : e.verdict === 'OK' ? `程序已退出${e.elapsedMs ? `，用时 ${Math.round(e.elapsedMs)} ms` : ''}` : `异常结束（${e.verdict}${e.error ? `：${e.error}` : ''}）`
      append('sys', `── ${status.value} ──`)
      break
  }
}

function send() {
  const line = input.value
  if (!inputEnabled.value) return
  session?.send(line + '\n')
  append('in', `> ${line}`)
  input.value = ''
}

function endInput() { session?.eof(); inputEnabled.value = false; append('sys', '── 输入流已关闭 ──') }
function close() { session?.close(); emit('close') }

onMounted(() => { session = props.launch(onEvent) })
onUnmounted(() => session?.close())
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100">
    <div class="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-400">
      <span>交互终端 · {{ status }}</span>
      <IconButton label="关闭终端" class="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" @click="close"><X class="h-4 w-4" /></IconButton>
    </div>
    <div ref="output" class="max-h-80 min-h-40 overflow-y-auto px-3 py-2 font-mono text-[13px] leading-relaxed" aria-live="off">
      <template v-for="(line, i) in lines" :key="i"><span v-if="line.kind === 'err'" class="whitespace-pre-wrap break-all text-red-400">{{ line.text }}</span><span v-else-if="line.kind === 'in'" class="whitespace-pre-wrap break-all text-cyan-300">{{ line.text }}{{ '\n' }}</span><span v-else-if="line.kind === 'sys'" class="whitespace-pre-wrap text-zinc-500">{{ line.text }}{{ '\n' }}</span><span v-else class="whitespace-pre-wrap break-all">{{ line.text }}</span></template>
      <p v-if="!lines.length" class="text-zinc-500">程序输出会出现在这里。</p>
    </div>
    <form class="flex items-center gap-2 border-t border-zinc-800 px-3 py-2" @submit.prevent="send">
      <span class="font-mono text-xs text-zinc-500" aria-hidden="true">&gt;</span>
      <input
        ref="inputBox"
        v-model="input"
        type="text"
        class="min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
        :placeholder="exited ? '程序已退出' : inputEnabled ? '输入一行，回车发送' : '程序还没在等输入'"
        :disabled="!inputEnabled"
        :aria-label="'终端输入'"
      />
      <IconButton label="发送" class="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" :disabled="!inputEnabled" @click="send"><Send class="h-4 w-4" /></IconButton>
      <IconButton label="发送 EOF（表示输入结束）" class="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" :disabled="!inputEnabled" @click="endInput"><Square class="h-3.5 w-3.5" /></IconButton>
    </form>
  </div>
</template>
