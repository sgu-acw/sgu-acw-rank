<script setup lang="ts">
import { computed, ref } from 'vue'
import { Activity, Clock, RefreshCw, Router, Server } from 'lucide-vue-next'
import {
  WORKSHOP_STATUS_API,
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

const lastSeenText = computed(() => {
  const ts = data.value?.last_seen
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
})

const ttlText = computed(() => {
  const ttl = data.value?.ttl
  return ttl ? `${ttl} 秒` : '—'
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

      <dl class="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border/40 bg-border/40 sm:grid-cols-3">
        <div class="bg-card p-4">
          <dt class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock class="h-3.5 w-3.5" />
            最后心跳
          </dt>
          <dd class="mt-1.5 text-sm font-medium">{{ age }}</dd>
          <dd class="mt-0.5 text-xs text-muted-foreground/60">{{ lastSeenText }}</dd>
        </div>

        <div class="bg-card p-4">
          <dt class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity class="h-3.5 w-3.5" />
            判定窗口
          </dt>
          <dd class="mt-1.5 text-sm font-medium">{{ ttlText }}</dd>
          <dd class="mt-0.5 text-xs text-muted-foreground/60">超过即视为关门</dd>
        </div>

        <div class="bg-card p-4">
          <dt class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Server class="h-3.5 w-3.5" />
            数据源
          </dt>
          <dd class="mt-1.5 truncate text-sm font-medium" :title="WORKSHOP_STATUS_API">
            {{ WORKSHOP_STATUS_API.replace('https://', '') }}
          </dd>
          <dd class="mt-0.5 text-xs text-muted-foreground/60">每 20 秒自动刷新</dd>
        </div>
      </dl>
    </div>

    <div class="mt-6 rounded-lg border border-border/40 bg-card p-6">
      <h2 class="flex items-center gap-2 text-sm font-medium">
        <Router class="h-4 w-4 text-muted-foreground" />
        这是怎么判断的
      </h2>
      <ol class="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>1. 工作坊里的树莓派每 30 秒向状态服务发一次心跳。</li>
        <li>2. 心跳是一个到服务器的短 SSH 连接,由服务器上的受限命令记录时间戳。</li>
        <li>3. 只要最近一次心跳在 {{ ttlText }} 之内,就认为工作坊开门;否则当作关门。</li>
      </ol>
      <p class="mt-3 text-xs text-muted-foreground/60">
        树莓派断电、断网或还没开机,心跳就会停下,状态自动变成没开门。
      </p>
    </div>
  </div>
</template>
