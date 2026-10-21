<script setup lang="ts">
/**
 * 自定义样例列表：做题页与云端 IDE 共用。
 * 每条用例 = 输入 + 期望输出（留空则只看运行结果），最多 20 条。
 *
 * 判定不铺大徽标：状态塞在用例标题行里，正文区域只留程序输出。
 */
import { Plus, Trash2 } from 'lucide-vue-next'
import IconButton from '../ui/IconButton.vue'
import Button from '../ui/button/Button.vue'
import { verdictLabels, type PointResult, type Verdict } from '../../lib/learning/types'

export interface CustomCase { id: number; input: string; expected: string }

const props = defineProps<{
  modelValue: CustomCase[]
  /** 每个用例最近一次运行的判定；没跑过为 undefined。 */
  point?: (index: number) => PointResult | undefined
  busy?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [CustomCase[]] }>()

/** 标题行里的判定文字颜色。 */
const statusClass: Record<Verdict | 'OK', string> = {
  AC: 'text-emerald-600 dark:text-emerald-400',
  WA: 'text-rose-600 dark:text-rose-400',
  TLE: 'text-amber-600 dark:text-amber-400',
  RE: 'text-violet-600 dark:text-violet-400',
  CE: 'text-sky-600 dark:text-sky-400',
  OLE: 'text-orange-600 dark:text-orange-400',
  OK: 'text-emerald-600 dark:text-emerald-400',
  CANCELLED: 'text-muted-foreground',
  ENVIRONMENT_ERROR: 'text-muted-foreground',
}
const statusOf = (i: number) => {
  const p = props.point?.(i)
  return p ? { text: verdictLabels[p.verdict] || p.verdict, cls: statusClass[p.verdict] || 'text-muted-foreground' } : null
}

let seq = 0
const add = () => {
  if (props.modelValue.length < 20) {
    seq = Math.max(seq, ...props.modelValue.map(c => c.id)) + 1
    emit('update:modelValue', [...props.modelValue, { id: seq, input: '', expected: '' }])
  }
}
const remove = (id: number) => {
  if (props.modelValue.length > 1) emit('update:modelValue', props.modelValue.filter(c => c.id !== id))
}
</script>

<template>
  <div class="space-y-3">
    <div v-for="(c, i) in modelValue" :key="c.id" class="space-y-2 rounded-lg border p-3">
      <div class="flex items-baseline gap-2">
        <span class="text-sm font-medium">自定义样例 {{ i + 1 }}</span>
        <!-- 状态只在标题行，不铺整行徽标。 -->
        <span v-if="statusOf(i)" class="text-xs font-medium" :class="statusOf(i)!.cls">{{ statusOf(i)!.text }}</span>
        <span v-if="point?.(i)?.elapsedMs !== undefined" class="text-xs text-muted-foreground">{{ Math.round(point(i)!.elapsedMs!) }} ms</span>
        <IconButton :label="`删除自定义样例 ${i + 1}`" destructive :disabled="busy || modelValue.length <= 1" @click="remove(c.id)" class="ml-auto"><Trash2 class="h-4 w-4" /></IconButton>
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
      <!-- 只留输出，判定在标题行。 -->
      <div v-if="point?.(i)" class="space-y-1">
        <pre class="max-h-40 overflow-auto whitespace-pre rounded bg-muted/60 p-2 text-xs">{{ point(i)!.stdout || '（空）' }}</pre>
        <pre v-if="point(i)!.stderr" class="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 text-xs text-destructive">{{ point(i)!.stderr }}</pre>
        <p v-if="point(i)!.error" class="break-words text-xs text-destructive">{{ point(i)!.error }}</p>
      </div>
    </div>
    <div><Button variant="outline" :disabled="busy || modelValue.length >= 20" @click="add"><Plus class="mr-2 h-4 w-4" />添加样例</Button></div>
  </div>
</template>
