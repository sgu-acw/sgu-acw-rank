<script setup lang="ts">
/**
 * 个人中心的活跃登录会话管理。
 *
 * 允许成员查看所有尚未过期的登录设备、单独下线陌生会话，或一键下线除当前设备
 * 之外的所有设备。
 */
import { computed, onMounted, ref } from 'vue'
import { Loader2, LogOut, MonitorSmartphone, Trash2 } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import ActionNotice from './ui/ActionNotice.vue'
import IconButton from './ui/IconButton.vue'
import { ApiError, authApi, type SessionEntry } from '../lib/api'
import { confirmAction } from '../lib/confirm'

const sessions = ref<SessionEntry[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')

const otherCount = computed(() => sessions.value.filter((s) => !s.is_current).length)

async function load() {
  loading.value = true
  error.value = ''
  try {
    sessions.value = await authApi.sessions()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '读取登录设备失败'
  } finally {
    loading.value = false
  }
}

async function revokeOne(entry: SessionEntry) {
  if (busy.value || entry.is_current) return
  if (!(await confirmAction(`下线「${entry.device_label}」？该设备需要重新登录。`))) return
  busy.value = true
  error.value = ''
  try {
    await authApi.revokeSession(entry.id)
    sessions.value = sessions.value.filter((s) => s.id !== entry.id)
    notice.value = '已下线该设备'
    window.setTimeout(() => {
      if (notice.value === '已下线该设备') notice.value = ''
    }, 3000)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '操作失败'
  } finally {
    busy.value = false
  }
}

async function revokeOthers() {
  if (busy.value || otherCount.value === 0) return
  if (!(await confirmAction(`确定下线其他 ${otherCount.value} 台设备？`))) return
  busy.value = true
  error.value = ''
  try {
    const res = await authApi.revokeOtherSessions()
    sessions.value = sessions.value.filter((s) => s.is_current)
    notice.value = `已下线 ${res.revoked} 台其他设备`
    window.setTimeout(() => {
      if (notice.value.startsWith('已下线 ')) notice.value = ''
    }, 3000)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '操作失败'
  } finally {
    busy.value = false
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  void load()
})
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
      <CardTitle class="flex items-center gap-2 text-sm">
        <MonitorSmartphone class="h-4 w-4" />
        登录设备与会话
      </CardTitle>
      <Button
        v-if="otherCount > 0"
        size="sm"
        variant="outline"
        :disabled="busy"
        @click="revokeOthers"
      >
        <Loader2 v-if="busy" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
        <LogOut v-else class="mr-1.5 h-3.5 w-3.5" />
        下线其他设备
      </Button>
    </CardHeader>
    <CardContent class="space-y-3">
      <ActionNotice :message="notice" />
      <Alert v-if="error" variant="destructive" class="text-sm">{{ error }}</Alert>

      <p v-if="loading" class="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 class="h-3.5 w-3.5 animate-spin" />
        读取登录设备…
      </p>

      <div v-else-if="sessions.length === 0" class="text-xs text-muted-foreground">
        暂无活跃会话
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="s in sessions"
          :key="s.id"
          class="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2.5"
        >
          <MonitorSmartphone class="h-4 w-4 shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate text-sm font-medium">{{ s.device_label }}</p>
              <span
                v-if="s.is_current"
                class="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
              >
                当前设备
              </span>
            </div>
            <p class="text-xs text-muted-foreground">
              <span v-if="s.ip" class="font-mono">{{ s.ip }}</span>
              <span v-if="s.ip"> · </span>
              最近活跃 {{ fmtTime(s.last_seen_at) }} · 登录于 {{ fmtTime(s.created_at) }}
            </p>
          </div>
          <IconButton
            v-if="!s.is_current"
            label="下线该设备"
            destructive
            :disabled="busy"
            @click="revokeOne(s)"
          >
            <Trash2 class="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
