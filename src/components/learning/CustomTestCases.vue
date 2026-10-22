<script setup lang="ts">
/**
 * 自定义样例列表：做题页与云端 IDE 共用。
 * 每条用例 = 输入 + 期望输出（留空则只看运行结果），最多 20 条。
 *
 * 布局上不再卡片套卡片：用例之间用分隔线，判定文字在标题行，
 * 程序输出跟在用例正下方。
 */
import { Plus, Trash2 } from 'lucide-vue-next'
import IconButton from '../ui/IconButton.vue'
import Button from '../ui/button/Button.vue'
import { verdictStatus } from '../../lib/learning/verdictStyle'
import { firstDiffOffset, outputPosition, visibleWhitespace } from '../../lib/learning/diff'
import type { PointResult } from '../../lib/learning/types'

export interface CustomCase { id: number; input: string; expected: string }

const props = defineProps<{
  modelValue: CustomCase[]
  /** 每个用例最近一次运行的判定；没跑过为 undefined。 */
  point?: (index: number) => PointResult | undefined
  busy?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [CustomCase[]] }>()

const statusOf = (i: number) => {
  const p = props.point?.(i)
  return p ? verdictStatus(p.verdict) : null
}

let seq = 0
const add = () => {
  if (props.modelValue.length < 20) {
    seq = Math.max(seq, ...props.modelValue.map(c => c.id)) + 1
    emit('update:modelValue', [...props.modelValue, { id: seq, input: '', expected: '' }])
  }
}
const remove = (id: number) => {
  emit('update:modelValue', props.modelValue.filter(c => c.id !== id))
}
/** WA 的第一处不同定位：行/列 + 空白字符可见化（·空格 →Tab ↵换行）。 */
function diffHint(c: CustomCase, actual: string) {
  const off = firstDiffOffset(actual, c.expected)
  const pos = outputPosition(actual, off)
  const aLine = visibleWhitespace(actual.split('\n')[pos.line - 1] ?? '')
  const eLine = visibleWhitespace(c.expected.split('\n')[outputPosition(c.expected, off).line - 1] ?? '')
  return `第一处不同在第 ${pos.line} 行第 ${pos.column} 列附近（·=空格 →=Tab ↵=换行）`
    + `\n  你的: ${aLine.slice(0, 80) || '（已结束）'}\n  期望: ${eLine.slice(0, 80) || '（已结束）'}`
}
</script>

<template>
  <div class="space-y-4">
    <section v-for="(c, i) in modelValue" :key="c.id" class="space-y-2 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
      <div class="flex items-baseline gap-2">
        <span class="text-sm font-medium">自定义样例 {{ i + 1 }}</span>
        <span v-if="statusOf(i)" class="text-xs font-medium" :class="statusOf(i)!.cls">{{ statusOf(i)!.text }}</span>
        <span v-if="point?.(i)?.elapsedMs !== undefined" class="text-xs text-muted-foreground">{{ Math.round(point(i)!.elapsedMs!) }} ms</span>
        <IconButton :label="`删除自定义样例 ${i + 1}`" destructive :disabled="busy" @click="remove(c.id)" class="ml-auto"><Trash2 class="h-4 w-4" /></IconButton>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label :for="`case-input-${c.id}`" class="text-xs text-muted-foreground">输入</label>
          <textarea :id="`case-input-${c.id}`" v-model="c.input" class="form-textarea mt-1 w-full font-mono text-xs" :disabled="busy" />
        </div>
        <div>
          <label :for="`case-expected-${c.id}`" class="text-xs text-muted-foreground">期望输出（留空则只运行）</label>
          <textarea :id="`case-expected-${c.id}`" v-model="c.expected" class="form-textarea mt-1 w-full font-mono text-xs" :disabled="busy" />
        </div>
      </div>
      <!-- 输出就在用例下面。自定义样例是用户自己出的数据，WA 也照常
           显示输出 + 期望并标注第一处不同——不存在泄露测试数据的问题。 -->
      <div v-if="point?.(i)" class="space-y-1">
        <template v-if="point(i)!.verdict === 'WA' && c.expected">
          <p class="whitespace-pre-line text-xs text-destructive">{{ diffHint(c, point(i)!.stdout) }}</p>
          <div class="grid gap-1 sm:grid-cols-2">
            <div><p class="text-xs text-muted-foreground">期望输出</p><pre class="mt-1 max-h-40 overflow-auto whitespace-pre rounded bg-muted/60 p-2 text-xs">{{ c.expected || '（空）' }}</pre></div>
            <div><p class="text-xs text-muted-foreground">实际输出</p><pre class="mt-1 max-h-40 overflow-auto whitespace-pre rounded bg-muted/60 p-2 text-xs">{{ point(i)!.stdout || '（空）' }}</pre></div>
          </div>
        </template>
        <template v-else>
          <pre class="max-h-40 overflow-auto whitespace-pre rounded bg-muted/60 p-2 text-xs">{{ point(i)!.stdout || '（空）' }}</pre>
        </template>
        <pre v-if="point(i)!.stderr" class="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 text-xs text-destructive">{{ point(i)!.stderr }}</pre>
        <p v-if="point(i)!.error" class="break-words text-xs text-destructive">{{ point(i)!.error }}</p>
      </div>
    </section>
    <p v-if="!modelValue.length" class="text-xs text-muted-foreground">还没有自定义样例。</p>
    <div><Button variant="outline" :disabled="busy || modelValue.length >= 20" @click="add"><Plus class="mr-2 h-4 w-4" />添加样例</Button></div>
  </div>
</template>
