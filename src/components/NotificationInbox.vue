<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Bell, CheckCheck, ChevronLeft, ChevronRight, Mail, RefreshCw } from 'lucide-vue-next'
import { Button } from './ui/button'
import { ApiError, notificationApi, type AdminNotification } from '../lib/api'
import { useAuth } from '../lib/auth'
const { user, isAdmin, ensureLoaded } = useAuth()
const items = ref<AdminNotification[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const total = ref(0)
const unread = ref(0)
const page = ref(1)
const unreadOnly = ref(false)
let disposed = false
let requestId = 0
function changed() { document.dispatchEvent(new Event('notifications:changed')) }
function fmt(iso: string) { return new Date(iso).toLocaleString('zh-CN', { hour12: false }) }
async function load() {
  if (!isAdmin.value) { loading.value = false; return }
  const token = ++requestId
  loading.value = true; error.value = ''
  try {
    const result = await notificationApi.list(page.value, unreadOnly.value)
    if (disposed || token !== requestId) return
    if (page.value > 1 && (page.value - 1) * 20 >= result.total) { page.value = Math.max(1, Math.ceil(result.total / 20)); return }
    items.value = result.items; total.value = result.total; unread.value = result.unread_count
  } catch (err) { if (!disposed && token === requestId) error.value = err instanceof ApiError ? err.message : '站内信读取失败' }
  finally { if (token === requestId) loading.value = false }
}
async function markRead(id?: number) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    if (id) await notificationApi.read(id); else await notificationApi.readAll()
    changed(); await load()
  } catch (err) { error.value = err instanceof ApiError ? err.message : '已读操作失败，请重试' }
  finally { busy.value = false }
}
function safeHref(href: string) { return href.startsWith('/') && !href.startsWith('//') ? href : '/admin' }
watch(page, () => void load())
watch(unreadOnly, () => { if (page.value === 1) void load(); else page.value = 1 })
onMounted(async () => { await ensureLoaded(); if (!disposed) await load() })
onUnmounted(() => { disposed = true; ++requestId })
</script>

<template>
  <div class="mx-auto w-full max-w-4xl space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="mr-auto flex items-center gap-2 text-lg font-semibold"><Bell class="h-5 w-5" />管理员站内信 <span class="text-sm font-normal text-muted-foreground">{{ unread }} 条未读</span></h1>
      <Button variant="outline" :disabled="loading || busy || !isAdmin" @click="load"><RefreshCw class="mr-2 h-4 w-4" :class="loading && 'animate-spin'" />刷新</Button>
      <Button variant="outline" :disabled="loading || busy || !unread" @click="markRead()"><CheckCheck class="mr-2 h-4 w-4" />全部已读</Button>
    </div>
    <p v-if="!loading && !isAdmin" class="py-10 text-sm text-muted-foreground">{{ user ? '需要管理员权限才能查看故障站内信。' : '请先登录管理员账号。' }} <a v-if="!user" href="/login" class="underline">前往登录</a></p>
    <template v-else>
      <label class="flex min-h-11 w-fit items-center gap-2 text-sm"><input v-model="unreadOnly" type="checkbox" :disabled="busy" class="h-4 w-4 accent-primary" />仅未读</label>
      <div v-if="error" role="alert" class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{{ error }} <button class="ml-2 min-h-11 underline" @click="load">重试</button></div>
      <div v-if="loading && !items.length" class="space-y-3" aria-label="正在读取站内信"><div v-for="i in 3" :key="i" class="h-32 animate-pulse rounded-lg bg-muted" /></div>
      <div v-else-if="!items.length && !error" class="flex flex-col items-center gap-3 border-y border-border/50 py-16 text-muted-foreground"><Mail class="h-7 w-7 opacity-50" /><p class="text-sm">{{ unreadOnly ? '没有未读站内信' : '暂无故障通知' }}</p></div>
      <div v-else class="divide-y divide-border/50 border-y border-border/50" :aria-busy="loading">
        <article v-for="item in items" :key="item.id" class="space-y-3 py-5" :class="loading && 'opacity-60'">
          <div class="flex items-start gap-3"><span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :class="item.read ? 'bg-muted' : 'bg-rose-600'" /><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h2 class="break-words text-sm font-semibold">{{ item.title }}</h2><span class="rounded-md px-2 py-1 text-xs" :class="item.resolved_at ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'">{{ item.resolved_at ? '已恢复' : '待处理' }}</span></div><p class="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{{ item.body }}</p><p class="mt-2 text-xs text-muted-foreground">{{ fmt(item.updated_at) }} · 累计 {{ item.occurrences }} 次<span v-if="item.resolved_at"> · 恢复于 {{ fmt(item.resolved_at) }}</span></p></div></div>
          <div class="flex flex-wrap items-center gap-2 pl-5"><a :href="safeHref(item.href)" class="inline-flex min-h-11 items-center px-2 text-sm text-primary hover:underline">查看相关页面 →</a><Button v-if="!item.read" variant="ghost" :disabled="busy || loading" @click="markRead(item.id)"><CheckCheck class="mr-2 h-4 w-4" />标为已读</Button></div>
        </article>
      </div>
      <div v-if="total > 20" class="flex items-center justify-between gap-3"><Button variant="outline" :disabled="page <= 1 || loading || busy" @click="page--"><ChevronLeft class="mr-1 h-4 w-4" />上一页</Button><span class="text-xs text-muted-foreground">{{ page }} / {{ Math.ceil(total / 20) }}</span><Button variant="outline" :disabled="page * 20 >= total || loading || busy" @click="page++">下一页<ChevronRight class="ml-1 h-4 w-4" /></Button></div>
    </template>
  </div>
</template>
