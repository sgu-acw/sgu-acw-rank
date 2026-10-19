<script setup lang="ts">
/**
 * 测试点状态点阵：一排方格表示每个测试点，整体给出通过/不通过。
 *
 * 色盲友好是硬约束，所以判定不靠色相单独承载：
 * - 每格都带独立图形（对勾 / 叉 / 时钟 / 感叹号 / 横线），灰度下也能分辨；
 * - 通过是实心格，未通过是描边 + 叉，形状和填充都不一样；
 * - 文案同时给出「通过 / 未通过」和 N/M，读屏也能拿到结论；
 * - 颜色仍用绿/红，但绿偏深、红偏亮，亮度差在灰度下也有对比。
 */
import { computed } from 'vue'
import { Check, X, Clock, AlertTriangle, Ban, Wrench } from 'lucide-vue-next'
import { verdictLabels, type PointResult, type Verdict } from '../../lib/learning/types'

const props = defineProps<{ points: PointResult[]; label?: string }>()

const META: Record<string, { dot: string; chip: string; Icon: unknown; text: string }> = {
  AC: {
    dot: 'bg-emerald-600 text-white ring-1 ring-inset ring-emerald-800/40 dark:bg-emerald-500 dark:text-emerald-950',
    chip: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    Icon: Check,
    text: '通过',
  },
  WA: {
    dot: 'bg-rose-500 text-white ring-1 ring-inset ring-rose-800/40 dark:bg-rose-400 dark:text-rose-950',
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    Icon: X,
    text: '答案错误',
  },
  TLE: {
    dot: 'bg-amber-400 text-amber-950 ring-1 ring-inset ring-amber-700/40 dark:bg-amber-300',
    chip: 'border-amber-500/40 bg-amber-400/10 text-amber-700 dark:text-amber-300',
    Icon: Clock,
    text: '超时',
  },
  RE: {
    dot: 'bg-violet-500 text-white ring-1 ring-inset ring-violet-800/40 dark:bg-violet-400 dark:text-violet-950',
    chip: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    Icon: AlertTriangle,
    text: '运行错误',
  },
  OLE: {
    dot: 'bg-orange-500 text-white ring-1 ring-inset ring-orange-800/40 dark:bg-orange-400 dark:text-orange-950',
    chip: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    Icon: Ban,
    text: '输出超限',
  },
  CE: {
    dot: 'bg-sky-600 text-white ring-1 ring-inset ring-sky-900/40 dark:bg-sky-400 dark:text-sky-950',
    chip: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    Icon: Wrench,
    text: '编译错误',
  },
  ENVIRONMENT_ERROR: {
    dot: 'bg-slate-500 text-white ring-1 ring-inset ring-slate-800/40 dark:bg-slate-400 dark:text-slate-950',
    chip: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    Icon: AlertTriangle,
    text: '环境错误',
  },
}
const FALLBACK = META.ENVIRONMENT_ERROR
const meta = (verdict: Verdict) => META[verdict] ?? FALLBACK

const passed = computed(() => props.points.filter(p => p.verdict === 'AC').length)
const allPassed = computed(() => props.points.length > 0 && passed.value === props.points.length)
const used = computed(() => [...new Set(props.points.map(p => p.verdict))].filter(v => v !== 'AC'))
</script>
<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2.5">
      <span
        class="inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold"
        :class="allPassed ? META.AC.chip : META.WA.chip"
      >
        <component :is="allPassed ? META.AC.Icon : META.WA.Icon" class="h-4 w-4" aria-hidden="true" stroke-width="3" />
        {{ allPassed ? '通过' : '未通过' }}
      </span>
      <span class="text-sm text-muted-foreground">{{ passed }}/{{ points.length }} 测试点通过</span>
    </div>

    <div
      class="flex flex-wrap gap-1.5"
      role="list"
      :aria-label="`${label || '测试点'}：共 ${points.length} 个，${passed} 个通过`"
    >
      <span
        v-for="(point, index) in points"
        :key="index"
        role="listitem"
        class="verdict-dot inline-flex h-5 w-5 items-center justify-center rounded-[4px]"
        :class="meta(point.verdict).dot"
        :style="{ animationDelay: `${Math.min(index, 60) * 14}ms` }"
        :title="`${point.name}：${verdictLabels[point.verdict]}`"
        :aria-label="`${point.name}：${verdictLabels[point.verdict]}`"
      >
        <component :is="meta(point.verdict).Icon" class="h-3 w-3" aria-hidden="true" stroke-width="3.5" />
      </span>
    </div>

    <!-- 图例只用实际出现的状态，避免每次都列一排用不到的颜色。 -->
    <ul v-if="used.length" class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      <li class="inline-flex items-center gap-1.5">
        <span class="inline-flex h-4 w-4 items-center justify-center rounded-[3px]" :class="META.AC.dot"><component :is="META.AC.Icon" class="h-2.5 w-2.5" aria-hidden="true" stroke-width="3.5" /></span>
        通过
      </li>
      <li v-for="verdict in used" :key="verdict" class="inline-flex items-center gap-1.5">
        <span class="inline-flex h-4 w-4 items-center justify-center rounded-[3px]" :class="meta(verdict).dot"><component :is="meta(verdict).Icon" class="h-2.5 w-2.5" aria-hidden="true" stroke-width="3.5" /></span>
        {{ verdictLabels[verdict] }}
      </li>
    </ul>
  </div>
</template>
<style scoped>
.verdict-dot {
  animation: verdict-pop 220ms var(--ease-out) both;
}
@keyframes verdict-pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
/* 高对比模式下不靠半透明描边区分，直接给实心边框。 */
@media (forced-colors: active) {
  .verdict-dot {
    border: 1px solid CanvasText;
  }
}
@media (prefers-reduced-motion: reduce) {
  .verdict-dot {
    animation: none;
  }
}
</style>
