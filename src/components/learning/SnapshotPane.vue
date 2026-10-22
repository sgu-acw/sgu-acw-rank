<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { History, Save, RotateCcw, Trash2 } from 'lucide-vue-next'
import { listSnapshots, recordSnapshot, removeSnapshot, fmtSnapTime, type Snapshot } from '../../lib/learning/snapshots'
import { codeDiff } from '../../lib/learning/diff'
import { verdictStatus } from '../../lib/learning/verdictStyle'
import type { Environment } from '../../lib/learning/types'
import Button from '../ui/button/Button.vue'
import IconButton from '../ui/IconButton.vue'
const props = defineProps<{ bucket: string; environment: Environment; current: string; disabled?: boolean; revision?: number }>()
const emit = defineEmits<{ restore: [string] }>()
const selected = ref<number | null>(null), tick = ref(0)
const items = computed(() => { void tick.value; void props.revision; return listSnapshots(props.bucket, props.environment) })
const currentSnapshot = computed(() => items.value.find(s => s.ts === selected.value))
const diff = computed(() => currentSnapshot.value ? codeDiff(currentSnapshot.value.code, props.current) : null)
watch(() => props.environment, () => { selected.value = null })
function save() { if (!props.disabled) { recordSnapshot(props.bucket, props.environment, props.current, 'run'); tick.value++ } }
function restore(s: Snapshot) {
  if (props.disabled) return
  recordSnapshot(props.bucket, props.environment, props.current, 'run')
  emit('restore', s.code); selected.value = null; tick.value++
}
function remove(s: Snapshot) { if (!props.disabled) { removeSnapshot(props.bucket, props.environment, s.ts); tick.value++ } }
</script>
<template>
  <section class="p-4" aria-label="代码快照">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2"><p class="text-xs leading-5 text-muted-foreground">每次运行自动保存 · 当前语言最近 25 份<br />恢复前会备份当前代码。</p><Button variant="outline" :disabled="disabled || !current.trim()" @click="save"><Save class="mr-2 h-4 w-4" />保存快照</Button></div>
    <div v-if="!items.length" class="flex flex-col items-center gap-3 py-7 text-center"><History class="h-7 w-7 text-muted-foreground/60" stroke-width="1.5" /><p class="text-sm text-muted-foreground">还没有历史，运行代码或保存一份快照。</p></div>
    <div v-else class="divide-y border-y">
      <div v-for="s in items" :key="s.ts">
        <div class="flex min-w-0 items-center gap-2">
          <button type="button" class="flex min-h-14 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-3 text-left" :aria-expanded="selected === s.ts" @click="selected = selected === s.ts ? null : s.ts">
            <span class="text-xs tabular-nums text-muted-foreground">{{ fmtSnapTime(s.ts) }}</span>
            <span v-if="s.verdict" class="text-xs font-medium" :class="verdictStatus(s.verdict).cls">{{ s.verdict }}</span>
            <span class="text-[11px] text-muted-foreground">{{ s.source === 'submit' ? '提交' : s.source === 'test' ? '测试' : '运行 / 保存' }} · {{ s.code.split('\n').length }} 行</span>
            <span class="basis-full truncate font-mono text-xs text-muted-foreground">{{ s.code.split('\n').find(l => l.trim()) }}</span>
          </button>
          <IconButton label="删除这份快照" destructive :disabled="disabled" @click="remove(s)"><Trash2 class="h-4 w-4" /></IconButton>
        </div>
        <div v-if="selected === s.ts" class="pb-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2"><p class="text-xs text-muted-foreground">与当前代码比较 · 红色为历史，绿色为当前</p><Button variant="outline" :disabled="disabled" @click="restore(s)"><RotateCcw class="mr-2 h-4 w-4" />恢复此版本</Button></div>
          <p v-if="!diff?.lines.length" class="text-xs text-muted-foreground">与当前代码一致。</p>
          <div v-else class="max-h-72 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs leading-6">
            <div v-for="(line, i) in diff.lines" :key="i" class="whitespace-pre-wrap break-all" :class="line.kind === 'add' ? 'text-emerald-600 dark:text-emerald-400' : line.kind === 'remove' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'"><span class="mr-3 inline-block w-6 select-none text-right opacity-60">{{ line.kind === 'add' ? line.right : line.left }}</span>{{ line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' ' }} {{ line.text }}</div>
            <p v-if="diff.truncated" class="mt-2 text-muted-foreground">差异较长，预览已截断；恢复会载入完整代码。</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
