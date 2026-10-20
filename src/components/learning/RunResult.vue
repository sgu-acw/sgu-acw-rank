<script setup lang="ts">
/**
 * 单次运行的输出面板。
 *
 * 和 VerdictDots 的区别：那个是「N 个测试点的判定」，而 IDE 只有一次运行、
 * 没有测试点、也没有标准答案，所以不能说「1/1 测试点通过」。这里只报运行状态
 * （正常结束 / 超时 / 运行错误 / 编译错误）和耗时。
 */
import { computed } from 'vue'
import { AlertTriangle, Check, Clock, Ban, Wrench } from 'lucide-vue-next'
import type { PointResult } from '../../lib/learning/types'

const props = defineProps<{ point: PointResult | undefined; running?: boolean }>()

/** 运行状态文案。没有标准答案可比，所以不出现「答案错误」。 */
const STATUS: Record<string, { text: string; chip: string; Icon: unknown }> = {
  AC: { text: '运行完成', chip: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', Icon: Check },
  TLE: { text: '运行超时', chip: 'border-amber-500/40 bg-amber-400/10 text-amber-700 dark:text-amber-300', Icon: Clock },
  RE: { text: '运行错误', chip: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300', Icon: AlertTriangle },
  CE: { text: '编译错误', chip: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300', Icon: Wrench },
  OLE: { text: '输出超限', chip: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300', Icon: Ban },
  ENVIRONMENT_ERROR: { text: '环境错误', chip: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300', Icon: AlertTriangle },
  CANCELLED: { text: '已取消', chip: 'border-slate-500/40 bg-muted text-muted-foreground', Icon: Ban },
}
const FALLBACK = STATUS.ENVIRONMENT_ERROR
const status = computed(() => (props.point ? STATUS[props.point.verdict] ?? FALLBACK : null))
const elapsed = computed(() => props.point?.elapsedMs ? `${Math.round(props.point.elapsedMs)} ms` : null)
</script>

<template>
  <div class="space-y-3">
    <div v-if="running" class="inline-flex min-h-9 items-center gap-2 text-sm text-muted-foreground" role="status">
      <span class="h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden="true"></span>运行中…
    </div>
    <div v-else-if="status" class="flex flex-wrap items-center gap-2.5">
      <span class="inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold" :class="status.chip">
        <component :is="status.Icon" class="h-4 w-4" aria-hidden="true" stroke-width="3" />{{ status.text }}
      </span>
      <span v-if="elapsed" class="text-sm text-muted-foreground">{{ elapsed }}</span>
    </div>
    <p v-else class="text-sm text-muted-foreground">还没有运行过。</p>
  </div>
</template>
