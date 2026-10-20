<script setup lang="ts">
/**
 * 交互终端：行为按真终端来，不模拟聊天框。
 *
 * 关键点：程序的输出流末尾如果停在行中间（比如 `say> ` 没有 endl），
 * 输入就从那里接着敲——提示符不会自己换行。`❯` 只出现在行首（没有未
 * 完成的行时），否则光标直接跟在上次输出后面，跟真终端一致。
 *
 * 通信链路：页面 → LearningEngine.terminal() → 运行器 origin 的 host → worker。
 * worker 里 wasm 用 JSPI 挂起等输入，事件循环不受阻塞。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Square, X } from 'lucide-vue-next'
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

/** 输出按字符拼进最后一条同类块，避免一个字符一行。 */
function append(kind: Line['kind'], text: string) {
  if (!text) return
  const last = lines.value[lines.value.length - 1]
  if (last && last.kind === kind && (kind === 'out' || kind === 'err')) last.text += text
  else lines.value.push({ kind, text })
  if (lines.value.length > 3000) lines.value.splice(0, lines.value.length - 3000)
  scrollDown()
}
const scrollDown = () => void nextTick(() => output.value?.scrollTo({ top: output.value.scrollHeight }))
/** 上一行是否完整结束（换行符收尾或还没有输出）——决定提示符是否出现在行首。 */
const atLineStart = computed(() => {
  const last = lines.value[lines.value.length - 1]
  return !last || last.text.endsWith('\n')
})

function onEvent(e: TtyEvent) {
  switch (e.event) {
    case 'status': status.value = e.data || '处理中…'; break
    case 'ready':
      status.value = '运行中'
      inputEnabled.value = true
      scrollDown(); void nextTick(() => inputBox.value?.focus())
      break
    case 'out': append('out', e.data || ''); break
    case 'err': append('err', e.data || ''); break
    case 'error': append('sys', `✗ ${e.data || '出错'}\n`); break
    case 'exit':
      exited.value = true; inputEnabled.value = false
      status.value = e.verdict === 'CANCELLED' ? '已结束' : e.verdict === 'OK' ? `已退出${e.elapsedMs ? ` · ${Math.round(e.elapsedMs)} ms` : ''}` : `异常结束（${e.verdict}${e.error ? `：${e.error}` : ''}）`
      append('sys', `\n[process exited: ${e.verdict || 'unknown'}${e.error ? ` — ${e.error}` : ''}]\n`)
      break
  }
}

function send() {
  const line = input.value
  if (!inputEnabled.value) return
  session?.send(line + '\n')
  // 回显：提示符在什么位置出现，历史里就怎么留——行首带 ❯，行中间直接续。
  append('in', (atLineStart.value ? '❯ ' : '') + line + '\n')
  input.value = ''
  void nextTick(() => inputBox.value?.focus())
}
/** 点终端任意位置把焦点送回输入行，跟真终端一样。 */
function focusInput() { if (inputEnabled.value) inputBox.value?.focus() }

function endInput() { session?.eof(); inputEnabled.value = false; append('sys', '[stdin closed]\n') }
function close() { session?.close(); emit('close') }

onMounted(() => { session = props.launch(onEvent) })
onUnmounted(() => session?.close())
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-inner">
    <div class="flex items-center gap-2 border-b border-zinc-800/80 px-3 py-1 text-[11px] text-zinc-500">
      <span class="flex gap-1.5" aria-hidden="true">
        <span class="h-2.5 w-2.5 rounded-full bg-zinc-700"></span>
        <span class="h-2.5 w-2.5 rounded-full bg-zinc-700"></span>
        <span class="h-2.5 w-2.5 rounded-full bg-zinc-700"></span>
      </span>
      <span class="min-w-0 flex-1 truncate font-mono">term — {{ status }}</span>
      <IconButton label="发送 EOF（结束输入）" class="!h-8 !w-8 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" :disabled="!inputEnabled" @click="endInput"><Square class="h-3 w-3" /></IconButton>
      <IconButton label="关闭终端" class="!h-8 !w-8 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" @click="close"><X class="h-4 w-4" /></IconButton>
    </div>
    <!-- 输出流与输入行在同一文本流里：程序行没换行，输入就接在后面。 -->
    <div ref="output" class="max-h-96 min-h-52 cursor-text overflow-y-auto px-3 py-2 font-mono text-[13px] leading-relaxed" role="log" aria-live="off" @click="focusInput">
      <template v-for="(line, i) in lines" :key="i"><span v-if="line.kind === 'err'" class="whitespace-pre-wrap break-all text-red-400">{{ line.text }}</span><span v-else-if="line.kind === 'in'" class="whitespace-pre-wrap break-all text-cyan-300">{{ line.text }}</span><span v-else-if="line.kind === 'sys'" class="whitespace-pre-wrap text-zinc-500">{{ line.text }}</span><span v-else class="whitespace-pre-wrap break-all">{{ line.text }}</span></template>
      <p v-if="!lines.length" class="text-zinc-600">$ 程序输出会出现在这里…</p>
      <!-- 行首才有提示符；行中间程序未换行时，光标直接接在输出后。 -->
      <form v-if="inputEnabled" class="inline" @submit.prevent="send">
        <span v-if="atLineStart" class="select-none text-cyan-400" aria-hidden="true">❯ </span><input
          ref="inputBox"
          v-model="input"
          type="text"
          :size="Math.max(2, input.length)"
          class="border-none bg-transparent p-0 font-mono text-[13px] text-cyan-100 caret-emerald-400 outline-none placeholder:text-zinc-600"
          aria-label="终端输入"
          autocomplete="off" spellcheck="false" autocapitalize="off"
        />
      </form>
    </div>
  </div>
</template>
