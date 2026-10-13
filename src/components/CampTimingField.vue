<script setup lang="ts">
/**
 * 集训时间字段的「增量 / 日历」切换。
 *
 * 开放报名和开始显示共用这个模式：默认「开始前 N 天」跟着开始时间走，
 * 管理员调开始时间时它们自动跟着挪；需要精确到几点的时候切到
 * 「指定时间」写绝对时刻。
 */
import { computed } from 'vue'
import { Input } from './ui/input'

defineProps<{ label: string; disabled?: boolean }>()

const mode = defineModel<'relative' | 'absolute'>('mode', { default: 'relative' })
const days = defineModel<number>('days', { default: 3 })
const at = defineModel<string>('at', { default: '' })

const daysText = computed({
  get: () => String(days.value ?? 3),
  set: (v: string) => {
    const n = parseInt(v, 10)
    days.value = Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : 3
  },
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm">{{ label }}</span>
      <div class="flex rounded-md border border-input p-0.5 text-xs">
        <button
          type="button"
          class="min-h-8 rounded px-2.5 transition-colors"
          :class="mode === 'relative' ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground'"
          :disabled="disabled"
          @click="mode = 'relative'"
        >
          开始前
        </button>
        <button
          type="button"
          class="min-h-8 rounded px-2.5 transition-colors"
          :class="mode === 'absolute' ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground'"
          :disabled="disabled"
          @click="mode = 'absolute'"
        >
          指定时间
        </button>
      </div>
    </div>
    <div v-if="mode === 'relative'" class="flex items-center gap-2 text-sm text-muted-foreground">
      <span>开始前</span>
      <Input
        :model-value="daysText"
        type="number"
        min="0"
        max="60"
        class="h-9 w-20 text-center"
        :disabled="disabled"
        @update:model-value="daysText = $event"
      />
      <span>天</span>
    </div>
    <Input
      v-else
      v-model="at"
      type="datetime-local"
      class="min-h-11"
      :disabled="disabled"
    />
  </div>
</template>
