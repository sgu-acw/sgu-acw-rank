<script setup lang="ts">
/**
 * 工作坊开没开门。
 *
 * 这是首页上最有时效性的一条信息——「现在能不能过去」。所以它不按普通卡片
 * 做，而是一个横条：状态用大字号加颜色直接说结论，补充说明退到次要位置。
 *
 * 开门时圆点会呼吸。这是页面上唯一持续动的元素，用来传递「这是活的」；
 * 其余地方都保持静止，免得抢注意力。
 */
import { computed } from 'vue'
import { Activity, ArrowUpRight } from 'lucide-vue-next'
import { formatAge, stateDescription, useWorkshopStatus } from '../lib/workshopStatus'

const { data, state } = useWorkshopStatus()

/** 三种状态的呈现。集中在一处，免得散在模板里到处判断。 */
const LOOK = {
  open: {
    label: '开门中',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-500/20',
    surface: 'bg-emerald-500/[0.06]',
  },
  closed: {
    label: '没开门',
    dot: 'bg-muted-foreground/40',
    text: 'text-muted-foreground',
    ring: 'ring-transparent',
    surface: '',
  },
  error: {
    label: '状态未知',
    dot: 'bg-amber-500/70',
    text: 'text-amber-600 dark:text-amber-500',
    ring: 'ring-amber-500/20',
    surface: 'bg-amber-500/[0.06]',
  },
  loading: {
    label: '检测中',
    dot: 'bg-muted-foreground/30',
    text: 'text-muted-foreground',
    ring: 'ring-transparent',
    surface: '',
  },
} as const

const look = computed(() => LOOK[state.value])
const description = computed(() => stateDescription(state.value))
const age = computed(() => formatAge(data.value?.age))
</script>

<template>
  <a
    href="/status"
    class="group flex items-center gap-4 rounded-lg border border-border/50 px-4 py-3.5 transition-colors duration-150 hover:border-border"
    :class="look.surface"
  >
    <!-- 状态圆点。开门时外面套一圈呼吸的光晕。 -->
    <span class="relative flex h-2.5 w-2.5 shrink-0">
      <span
        v-if="state === 'open'"
        class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/40"
      />
      <span class="relative inline-flex h-2.5 w-2.5 rounded-full" :class="look.dot" />
    </span>

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <!-- 状态词不折行。「没开门」拆成「没开/门」很难读。 -->
        <span class="whitespace-nowrap text-base font-semibold tracking-tight" :class="look.text">
          {{ look.label }}
        </span>
        <span class="text-xs text-muted-foreground">{{ description }}</span>
      </div>
      <p v-if="age" class="mt-0.5 text-[11px] text-muted-foreground/60">{{ age }}</p>
    </div>

    <span
      class="hidden shrink-0 items-center gap-0.5 text-xs text-muted-foreground/50 transition-colors group-hover:text-foreground sm:flex"
    >
      详情
      <ArrowUpRight class="h-3 w-3 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </span>
  </a>
</template>
