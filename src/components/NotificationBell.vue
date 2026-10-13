<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Bell } from 'lucide-vue-next'
import { notificationApi } from '../lib/api'
import { useAuth } from '../lib/auth'
const { isAdmin, ensureLoaded } = useAuth()
const unread = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
let pending = false
let disposed = false
async function refresh() {
  if (!isAdmin.value || pending || document.hidden) return
  pending = true
  try { const result = await notificationApi.unread(); if (!disposed) unread.value = result.count }
  catch { /* 旧后端或临时离线时保留上次计数，避免轮询错误遮住主要工作。 */ }
  finally { pending = false }
}
watch(isAdmin, value => { if (value) void refresh(); else unread.value = 0 })
onMounted(async () => {
  await ensureLoaded()
  if (disposed) return
  void refresh(); timer = setInterval(refresh, 60000)
  document.addEventListener('notifications:changed', refresh)
  document.addEventListener('visibilitychange', refresh)
  document.addEventListener('astro:page-load', refresh)
})
onUnmounted(() => {
  disposed = true; clearInterval(timer)
  document.removeEventListener('notifications:changed', refresh)
  document.removeEventListener('visibilitychange', refresh)
  document.removeEventListener('astro:page-load', refresh)
})
</script>

<template>
  <a v-if="isAdmin" href="/notifications" class="relative mr-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" :aria-label="unread ? `站内信，${unread} 条未读` : '站内信'" title="管理员站内信">
    <Bell class="h-4 w-4" />
    <span v-if="unread" class="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">{{ unread > 99 ? '99+' : unread }}</span>
  </a>
</template>
