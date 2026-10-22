<script setup lang="ts">
/**
 * 代码快照面板：查看历史版本、对比差异、恢复。
 * 恢复前先把当前代码也存一份，防止手滑丢稿。
 */
import { computed, ref, watch } from 'vue'
import { Clock, RotateCcw, X, ChevronDown } from 'lucide-vue-next'
import { listSnapshots, recordSnapshot, removeSnapshot, fmtSnapTime, type Snapshot } from '../../lib/learning/snapshots'
import { codeDiff } from '../../lib/learning/diff'
import { verdictStatusClass } from '../../lib/learning/verdictStyle'
import type { Environment } from '../../lib/learning/types'

const props = defineProps<{
  /** 快照桶：题目用 problemId，IDE 用 'ide'。 */
  bucket: string
  environment: Environment
  /** 当前编辑器代码，恢复时先备份它。 */
  current: string
  disabled?: boolean
}>()
const emit = defineEmits<{ restore: [string] }>()

const open = ref(false), expanded = ref<number | null>(null), tick = ref(0)
const items = computed(() => (tick.value, listSnapshots(props.bucket, props.environment)))
watch(() => props.environment, () => { expanded.value = null })

function diffOf(s: Snapshot) {
  return codeDiff(s.code, props.current)
}
function restore(s: Snapshot) {
  // 先备份当前内容再覆盖，防误恢复丢稿。
  recordSnapshot(props.bucket, props.environment, props.current, 'run')
  emit('restore', s.code)
  open.value = false
}
function remove(s: Snapshot) {
  removeSnapshot(props.bucket, props.environment, s.ts)
  tick.value++
}
// 外面记录了新快照（运行/提交）时，面板开着就刷新一下。
defineExpose({ refresh: () => { tick.value++ } })
</script>

<template>
  <div class="relative">
    <button
      type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      :class="open ? 'bg-muted text-foreground' : ''" :disabled="disabled"
      aria-label="代码快照" title="代码快照：每次运行自动存档" @click="open = !open; tick++"
    >
<Clock class="h-4 w-4" />
</button>
    <div v-if="open" class="absolute right-0 z-30 mt-2 w-[min(92vw,480px)] rounded-xl border bg-popover p-3 shadow-lg">
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium">代码快照<span class="ml-2 text-xs font-normal text-muted-foreground">每次运行自动保存，最多 25 份</span></p>
        <button type="button" class="min-h-8 min-w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="关闭" @click="open = false"><X class="mx-auto h-4 w-4" /></button>
      </div>
      <p v-if="!items.length" class="mt-3 text-sm text-muted-foreground">还没有快照——跑一次测试或提交就会自动存档。</p>
      <ul v-else class="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
        <li v-for="s in items" :key="s.ts" class="rounded-lg border">
          <button type="button" class="flex w-full min-h-11 items-center gap-2 px-3 py-2 text-left" @click="expanded = expanded === s.ts ? null : s.ts">
            <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ s.code.split('\n').find(l => l.trim()) || '（空代码）' }}</span>
            <span v-if="s.verdict" class="text-xs font-medium" :class="verdictStatusClass(s.verdict)">{{ s.verdict }}</span>
            <span class="text-xs text-muted-foreground">{{ fmtSnapTime(s.ts) }}</span>
            <ChevronDown class="h-3.5 w-3.5 text-muted-foreground transition-transform" :class="expanded === s.ts ? 'rotate-180' : ''" />
          </button>
          <div v-if="expanded === s.ts" class="border-t px-3 py-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs text-muted-foreground">与当前代码的差异</p>
              <button type="button" class="inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 text-xs hover:bg-muted" @click="restore(s)"><RotateCcw class="h-3.5 w-3.5" />恢复到这份</button>
            </div>
            <div v-if="!diffOf(s).lines.length" class="mt-2 text-xs text-muted-foreground">与当前代码一致。</div>
            <div v-else class="mt-2 max-h-52 overflow-auto rounded bg-muted/60 p-2 font-mono text-[11px] leading-5">
              <div v-for="(l, i) in diffOf(s).lines" :key="i" class="whitespace-pre-wrap break-all" :class="l.kind === 'add' ? 'text-emerald-600 dark:text-emerald-400' : l.kind === 'remove' ? 'text-red-500 line-through' : 'text-muted-foreground'"><span class="mr-2 inline-block w-6 select-none text-right text-muted-foreground/60">{{ l.kind === 'add' ? l.right : l.left }}</span>{{ l.kind === 'add' ? '+' : l.kind === 'remove' ? '-' : ' ' }}{{ l.text }}</div>
            </div>
            <button type="button" class="mt-2 text-xs text-muted-foreground hover:text-destructive" @click="remove(s)">删除这份快照</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
