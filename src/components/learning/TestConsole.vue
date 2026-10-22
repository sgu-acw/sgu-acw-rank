<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus, Copy, Trash2, Play, FlaskConical } from 'lucide-vue-next'
import Button from '../ui/button/Button.vue'
import IconButton from '../ui/IconButton.vue'
import TestDataView from './TestDataView.vue'
import { verdictStatus } from '../../lib/learning/verdictStyle'
import { firstDiffOffset, outputPosition, visibleWhitespace } from '../../lib/learning/diff'
import { caseSignature, clipText, type CustomCase, type WorkspaceCase, type CaseResult } from '../../lib/learning/workspace'
import type { TestCase } from '../../lib/learning/types'
const props = defineProps<{
  modelValue: CustomCase[]; samples: TestCase[]; results: Record<string, CaseResult>
  busy: boolean; runnable: boolean; stale: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [CustomCase[]]; run: [WorkspaceCase]; change: [] }>()
const active = ref('')
const all = computed<WorkspaceCase[]>(() => [
  ...props.samples.map((s, i) => ({ ...s, id: `s:${i}`, name: s.name || `样例 ${i + 1}`, editable: false })),
  ...props.modelValue.map((c, i) => ({ id: `c:${c.id}`, name: `自定义 ${i + 1}`, input: c.input, output: c.expected, sample: true, editable: true })),
])
const selected = computed(() => all.value.find(t => t.id === active.value) || all.value[0])
watch(all, tests => { if (!tests.some(t => t.id === active.value)) active.value = tests[0]?.id || '' }, { immediate: true })
const pointFor = (test: WorkspaceCase) => {
  const r = props.results[test.id]
  return r?.signature === caseSignature(test) ? r.point : undefined
}
const point = computed(() => selected.value ? pointFor(selected.value) : undefined)
const status = computed(() => point.value ? verdictStatus(point.value.verdict === 'AC' && selected.value?.editable && !selected.value.output ? 'OK' : point.value.verdict) : null)
const diff = computed(() => {
  if (point.value?.verdict !== 'WA' || !selected.value) return null
  const offset = firstDiffOffset(point.value.stdout, selected.value.output)
  const pos = outputPosition(point.value.stdout, offset)
  return { ...pos, actual: visibleWhitespace(point.value.stdout.split('\n')[pos.line - 1] || ''),
    expected: visibleWhitespace(selected.value.output.split('\n')[outputPosition(selected.value.output, offset).line - 1] || '') }
})
function add(test?: WorkspaceCase) {
  if (props.busy || props.modelValue.length >= 20) return
  const id = Math.max(0, ...props.modelValue.map(c => c.id)) + 1
  emit('update:modelValue', [...props.modelValue, { id, input: test?.input || '', expected: test?.output || '' }])
  active.value = `c:${id}`; emit('change')
}
function remove() {
  if (props.busy || !selected.value?.editable) return
  emit('update:modelValue', props.modelValue.filter(c => `c:${c.id}` !== selected.value!.id)); emit('change')
}
function edit(field: 'input' | 'expected', event: Event) {
  if (props.busy || !selected.value?.editable) return
  emit('update:modelValue', props.modelValue.map(c => `c:${c.id}` === selected.value!.id
    ? { ...c, [field]: (event.target as HTMLTextAreaElement).value } : c))
  emit('change')
}
function navigate(event: KeyboardEvent) {
  const index = all.value.findIndex(t => t.id === selected.value?.id)
  const next = event.key === 'ArrowRight' ? (index + 1) % all.value.length : event.key === 'ArrowLeft' ? (index + all.value.length - 1) % all.value.length : event.key === 'Home' ? 0 : event.key === 'End' ? all.value.length - 1 : -1
  if (next < 0 || !all.value[next]) return
  event.preventDefault(); active.value = all.value[next]!.id
  ;(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus()
}
defineExpose({ add: () => add() })
</script>
<template>
  <div class="test-console">
    <div class="flex min-w-0 items-center border-b bg-muted/20 px-2">
      <div class="min-w-0 flex-1 overflow-x-auto" role="tablist" aria-label="测试点" @keydown="navigate">
        <div class="flex w-max gap-1">
          <button v-for="test in all" :id="`case-tab-${test.id}`" :key="test.id" type="button" role="tab" :aria-selected="selected?.id === test.id" :aria-controls="`case-panel-${test.id}`" :tabindex="selected?.id === test.id ? 0 : -1" class="case-tab" @click="active = test.id">
            {{ test.name }}<span v-if="pointFor(test)" class="text-[10px] font-semibold" :class="verdictStatus(pointFor(test)!.verdict).cls">{{ test.editable && !test.output && pointFor(test)!.verdict === 'AC' ? 'OK' : pointFor(test)!.verdict }}</span>
          </button>
        </div>
      </div>
      <IconButton label="添加自定义样例" :disabled="busy || modelValue.length >= 20" @click="add()"><Plus class="h-4 w-4" /></IconButton>
    </div>
    <div v-if="selected" :id="`case-panel-${selected.id}`" role="tabpanel" :aria-labelledby="`case-tab-${selected.id}`" class="min-w-0 p-4">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span class="text-xs font-medium">{{ selected.name }}</span>
        <span v-if="status" class="text-xs font-medium" :class="status.cls">{{ status.text }}</span>
        <span v-if="point?.elapsedMs !== undefined" class="text-xs tabular-nums text-muted-foreground">{{ Math.round(point.elapsedMs) }} ms</span>
        <span class="flex-1" />
        <IconButton :label="`运行${selected.name}`" :disabled="busy || !runnable" @click="emit('run', selected)"><Play class="h-4 w-4" /></IconButton>
        <IconButton :label="selected.editable ? '复制此样例' : '复制为自定义样例'" :disabled="busy || modelValue.length >= 20" @click="add(selected)"><Copy class="h-4 w-4" /></IconButton>
        <IconButton v-if="selected.editable" label="删除此样例" destructive :disabled="busy" @click="remove"><Trash2 class="h-4 w-4" /></IconButton>
      </div>
      <p v-if="point && stale" class="mb-3 text-xs text-amber-600 dark:text-amber-400">代码或运行设置已修改，请重新运行以更新结果。</p>
      <div class="grid min-w-0 gap-4 sm:grid-cols-2">
        <template v-if="selected.editable">
          <div class="min-w-0"><label for="test-input" class="flex min-h-11 items-center text-xs font-medium text-muted-foreground">标准输入</label><textarea id="test-input" :value="selected.input" :disabled="busy" class="form-textarea test-field" spellcheck="false" placeholder="程序需要读取的数据；无输入可留空" @input="edit('input', $event)" /></div>
          <div class="min-w-0"><label for="test-expected" class="flex min-h-11 items-center text-xs font-medium text-muted-foreground">期望输出 · 可选</label><textarea id="test-expected" :value="selected.output" :disabled="busy" class="form-textarea test-field" spellcheck="false" placeholder="留空时只运行；填写后比较答案" @input="edit('expected', $event)" /></div>
        </template>
        <template v-else><TestDataView :text="selected.input" label="标准输入" /><TestDataView :text="selected.output" label="期望输出" /></template>
      </div>
      <div v-if="point" class="mt-4 border-t pt-2">
        <div v-if="diff" class="mb-2 break-words text-xs leading-6 text-rose-600 dark:text-rose-400">
          <p>第一处不同在第 {{ diff.line }} 行第 {{ diff.column }} 列附近</p>
          <p class="font-mono">期望：{{ clipText(diff.expected, 160) || '（已结束）' }}<br />实际：{{ clipText(diff.actual, 160) || '（已结束）' }}</p>
          <p class="text-muted-foreground">· 空格 / → Tab / ↵ 换行</p>
        </div>
        <TestDataView :text="point.stdout" label="实际输出" />
        <TestDataView v-if="point.stderr" :text="point.stderr" :label="point.verdict === 'CE' ? '编译信息' : '标准错误'" />
        <p v-if="point.error" class="mt-2 break-words text-xs text-destructive">{{ point.error }}</p>
      </div>
    </div>
    <div v-else class="flex flex-col items-center gap-3 px-5 py-9 text-center">
      <FlaskConical class="h-7 w-7 text-muted-foreground/60" stroke-width="1.5" />
      <div><p class="text-sm font-medium">暂无测试样例</p><p class="mt-1 text-xs leading-6 text-muted-foreground">添加测试样例后运行代码，或在交互终端中逐行输入数据。</p></div>
      <Button variant="outline" :disabled="busy" @click="add()"><Plus class="mr-2 h-4 w-4" />添加样例</Button>
    </div>
  </div>
</template>
