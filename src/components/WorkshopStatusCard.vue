<script setup lang="ts">
import { computed } from 'vue'
import { Activity } from 'lucide-vue-next'
import {
  formatAge,
  stateDescription,
  stateDotClass,
  stateLabel,
  stateTextClass,
  useWorkshopStatus,
} from '../lib/workshopStatus'

const { data, state } = useWorkshopStatus()

const label = computed(() => stateLabel(state.value))
const description = computed(() => stateDescription(state.value))
const age = computed(() => formatAge(data.value?.age))
</script>

<template>
  <a
    href="/status"
    class="group block rounded-md border border-border/40 bg-card p-4 transition-colors hover:border-border hover:bg-muted/40"
  >
    <div class="flex items-center justify-between gap-4">
      <span class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Activity class="h-3.5 w-3.5" />
        工作坊开门了吗
      </span>
      <span class="text-xs text-muted-foreground/60 transition-colors group-hover:text-primary">
        详情
      </span>
    </div>

    <div class="mt-3 flex items-center gap-2.5">
      <span class="relative flex h-2.5 w-2.5">
        <span
          v-if="state === 'open'"
          class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/50"
        />
        <span class="relative inline-flex h-2.5 w-2.5 rounded-full" :class="stateDotClass(state)" />
      </span>
      <span class="text-xl font-semibold tracking-tight" :class="stateTextClass(state)">
        {{ label }}
      </span>
    </div>

    <p class="mt-1.5 text-xs text-muted-foreground">{{ description }}</p>
    <p class="mt-0.5 text-xs text-muted-foreground/60">{{ age }}</p>
  </a>
</template>
