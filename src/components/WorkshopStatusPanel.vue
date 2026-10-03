<script setup lang="ts">
import { computed, ref } from 'vue'
import { Clock, RefreshCw } from 'lucide-vue-next'
import {
  formatAge,
  stateDescription,
  stateDotClass,
  stateLabel,
  stateTextClass,
  useWorkshopStatus,
} from '../lib/workshopStatus'

const { data, state, refresh } = useWorkshopStatus()

const busy = ref(false)
const checkedAt = ref<Date | null>(null)

const label = computed(() => stateLabel(state.value))
const description = computed(() => stateDescription(state.value))
const age = computed(() => formatAge(data.value?.age))
const devices = computed(() => data.value?.devices ?? [])

const lastSeenText = computed(() => {
  const ts = data.value?.last_seen
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
})

async function manualRefresh() {
  busy.value = true
  try {
    await refresh()
    checkedAt.value = new Date()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <div class="rounded-lg border border-border/40 bg-card p-6">
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-3">
          <span class="relative flex h-3 w-3">
            <span
              v-if="state === 'open'"
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/50"
            />
            <span class="relative inline-flex h-3 w-3 rounded-full" :class="stateDotClass(state)" />
          </span>
          <div>
            <h1 class="text-2xl font-semibold tracking-tight" :class="stateTextClass(state)">
              {{ label }}
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">{{ description }}</p>
          </div>
        </div>

        <button
          class="inline-flex shrink-0 items-center gap-2 rounded-md border border-border/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          :disabled="busy"
          @click="manualRefresh"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="busy ? 'animate-spin' : ''" />
          刷新
        </button>
      </div>

      <!--
        只留最后心跳。

        判定窗口、数据源、心跳机制都是内部实现，成员不需要知道：他们只
        关心现在能不能过去。数据源域名更不能往外摆。
      -->
      <div class="mt-6 flex items-center gap-2 rounded-md border border-border/40 px-4 py-3">
        <Clock class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="text-xs text-muted-foreground">最后心跳</span>
        <span class="ml-auto text-sm font-medium">{{ age }}</span>
        <span class="text-xs text-muted-foreground/60">{{ lastSeenText }}</span>
      </div>

      <div v-if="devices.length" class="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span
          v-for="device in devices"
          :key="device.id"
          class="inline-flex items-center gap-1.5 rounded-md border border-border/40 px-2 py-1"
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="device.open ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
          />
          <span class="font-medium">{{ device.id }}</span>
          <span class="text-muted-foreground/60">{{ formatAge(device.age) }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
