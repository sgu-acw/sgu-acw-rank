<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ArrowLeft, BookOpen, CircleCheck, Loader2, LogIn, RefreshCw, Settings } from 'lucide-vue-next'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import ActionNotice from './ui/ActionNotice.vue'
import CampLeaderboard from './CampLeaderboard.vue'
import CampResultNotice from './CampResultNotice.vue'
import { ApiError, campApi, PLATFORM_META, platformLabel, type CampDetail } from '../lib/api'
import { useAuth } from '../lib/auth'
import { confirmAction } from '../lib/confirm'
const { user, isAdmin, ensureLoaded } = useAuth()
const camp = ref<CampDetail | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const busy = ref(false)
const notice = ref('')
const now = ref(Date.now())
const id = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
let disposed = false
let lastFetch = 0
let lastBoundary = ''
const countdown = computed(() => {
  if (!camp.value || camp.value.started) return ''
  const minutes = Math.max(0, Math.ceil((Date.parse(camp.value.start_at) - now.value) / 60000))
  return minutes >= 1440 ? `${Math.floor(minutes / 1440)} 天后开始` : minutes >= 60 ? `${Math.floor(minutes / 60)} 小时后开始` : minutes ? `${minutes} 分钟后开始` : '正在开放题目…'
})
const canCancel = computed(() => camp.value?.can_unregister && now.value < Date.parse(camp.value.start_at))
const canRegister = computed(() => camp.value?.can_register && now.value < Date.parse(camp.value.end_at))
function fmt(iso: string) { return new Date(iso).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) }
async function load() {
  if (refreshing.value || !id.value) return
  refreshing.value = true
  try {
    const data = await campApi.detail(id.value)
    if (!disposed) { camp.value = data; error.value = ''; lastFetch = Date.now() }
  } catch (err) { if (!disposed) error.value = err instanceof ApiError ? err.message : '读取失败，请稍后重试' }
  finally { refreshing.value = false; loading.value = false }
}
async function register() {
  if (!camp.value || busy.value || !canRegister.value) return
  busy.value = true; error.value = ''
  try { await campApi.register(camp.value.id); notice.value = '报名成功'; await load() }
  catch (err) { error.value = err instanceof ApiError ? err.message : '报名失败，请重试' }
  finally { busy.value = false }
}
async function unregister() {
  if (!camp.value || busy.value || !canCancel.value || !await confirmAction('取消这次集训的报名？开始前可以重新报名。', '取消报名')) return
  busy.value = true; error.value = ''
  try { await campApi.unregister(camp.value.id); notice.value = '已取消报名'; await load() }
  catch (err) { error.value = err instanceof ApiError ? err.message : '取消失败，请重试' }
  finally { busy.value = false }
}
function tick() {
  now.value = Date.now()
  if (document.hidden || busy.value || !camp.value) return
  const boundary = now.value >= Date.parse(camp.value.end_at) ? 'ended' : now.value >= Date.parse(camp.value.start_at) ? 'started' : 'scheduled'
  if (boundary !== lastBoundary || (camp.value.phase !== 'finalized' && now.value - lastFetch >= 60000)) {
    lastBoundary = boundary; lastFetch = now.value; void load()
  }
}
onMounted(async () => {
  const raw = Number(new URLSearchParams(location.search).get('id'))
  if (!Number.isSafeInteger(raw) || raw <= 0) { error.value = '集训地址不完整，请返回列表选择集训。'; loading.value = false; return }
  id.value = raw
  await ensureLoaded(); await load()
  if (disposed) return
  tick(); timer = setInterval(tick, 1000)
  document.addEventListener('visibilitychange', tick)
})
onUnmounted(() => { disposed = true; clearInterval(timer); document.removeEventListener('visibilitychange', tick) })
</script>

<template>
  <div class="mx-auto w-full min-w-0 max-w-4xl space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <a href="/camps" class="mr-auto inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft class="h-4 w-4" />全部集训</a>
      <a v-if="isAdmin && camp" :href="`/camps/admin?id=${camp.id}`" class="inline-flex min-h-11 items-center gap-1 px-2 text-sm text-muted-foreground hover:text-foreground"><Settings class="h-4 w-4" />管理这场集训</a>
      <Button v-if="id" variant="outline" :disabled="refreshing || busy" @click="load"><RefreshCw class="mr-2 h-4 w-4" :class="refreshing && 'animate-spin'" />刷新</Button>
    </div>
    <div v-if="error" role="alert" class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{{ error }} <button v-if="id" class="ml-2 min-h-11 underline" :disabled="refreshing" @click="load">重试</button></div>
    <ActionNotice :message="notice" />
    <p v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" />正在读取集训…</p>
    <template v-else-if="camp">
      <div class="space-y-2">
        <h1 class="break-words text-xl font-semibold">{{ camp.name }}</h1>
        <p class="text-sm text-muted-foreground">{{ fmt(camp.start_at) }} 开始 · {{ fmt(camp.end_at) }} 截止 <span v-if="countdown">（{{ countdown }}）</span></p>
        <p class="text-xs text-muted-foreground">{{ camp.registration_count }} 人报名 · {{ camp.problem_count }} 道题 · 时间按本地时区显示</p>
        <p v-if="camp.description" class="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{{ camp.description }}</p>
      </div>
      <CampResultNotice :status="camp" />
      <Card v-if="camp.ended && !camp.registered">
        <CardContent class="flex flex-wrap items-center gap-3 py-5">
          <BookOpen class="h-4 w-4 shrink-0 text-muted-foreground" />
          <p class="mr-auto text-sm text-muted-foreground">集训已结束，题单已公开，可以直接查看和练习。</p>
          <a v-if="!user" href="/login" class="inline-flex min-h-11 items-center text-sm text-primary hover:underline">已报名？登录查看成绩</a>
        </CardContent>
      </Card>
      <Card v-else-if="!user"><CardContent class="flex flex-wrap items-center gap-3 py-5"><LogIn class="h-4 w-4 text-muted-foreground" /><p class="mr-auto text-sm text-muted-foreground">登录后可以报名集训。</p><a href="/login" class="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground">登录</a></CardContent></Card>
      <Card v-else-if="!camp.registered">
<CardContent class="space-y-3 py-5">
        <template v-if="!camp.ended">
          <p v-if="camp.platforms.length" class="text-sm">至少绑定并验证一个集训平台的账号：</p>
          <div class="flex flex-wrap gap-2"><span v-for="p in camp.platforms" :key="p" class="rounded-md bg-muted px-2 py-1 text-xs">{{ PLATFORM_META[p]?.label || p }}</span></div>
        </template>
        <p v-if="camp.register_reason" class="text-sm text-muted-foreground">{{ camp.register_reason }}</p>
        <div class="flex flex-wrap gap-2"><Button v-if="canRegister" :disabled="busy || refreshing" @click="register"><Loader2 v-if="busy" class="mr-2 h-4 w-4 animate-spin" />报名集训</Button><a v-if="!camp.ended && camp.platforms.length" href="/me" class="inline-flex min-h-11 items-center px-2 text-sm text-primary hover:underline">管理平台账号 →</a></div>
        <p v-if="isAdmin" class="text-xs text-muted-foreground">管理员在成员页面也需要报名；预览题目请使用上方“管理这场集训”。</p>
      </CardContent>
</Card>
      <Card v-else><CardContent class="flex flex-wrap items-center gap-3 py-5"><CircleCheck class="h-4 w-4 shrink-0 text-emerald-600" /><p class="min-w-0 flex-1 text-sm">{{ !camp.started ? `已报名，题目将在 ${fmt(camp.start_at)} 开放。` : '已报名，成绩定期自动更新。' }}</p><Button v-if="canCancel" variant="outline" :disabled="busy || refreshing" @click="unregister">取消报名</Button></CardContent></Card>
      <template v-if="camp.ended || (camp.registered && camp.started)">
        <Card>
          <CardHeader><CardTitle class="text-sm">题目 · {{ camp.problems.length }}</CardTitle></CardHeader>
          <CardContent class="p-0">
            <p v-if="!camp.problems.length" class="px-6 py-8 text-sm text-muted-foreground">管理员尚未添加题目，请稍后刷新。</p>
            <div class="divide-y divide-border/40 border-t border-border/40">
              <a v-for="p in camp.problems" :key="`${p.platform}:${p.key}`" :href="p.platform === 'learn' ? `${p.url}&from=camp:${camp.id}` : p.url" target="_blank" rel="noreferrer" class="row-action flex min-w-0 min-h-16 items-center gap-3 px-4 py-3" :class="p.done ? 'bg-emerald-500/5' : ''">
                <CircleCheck v-if="camp.registered" class="h-5 w-5 shrink-0" :class="p.done ? 'text-emerald-600 dark:text-emerald-500' : 'text-muted-foreground/30'" :aria-label="p.done ? '已通过' : '未通过'" />
                <BookOpen v-else class="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div class="min-w-0 flex-1"><p class="break-words text-sm font-medium">{{ p.name || p.key }}</p><p class="mt-1 break-all text-xs text-muted-foreground">{{ platformLabel(p.platform) }} · {{ p.key }}</p></div>
                <span class="shrink-0 text-xs text-muted-foreground">做题 ↗</span>
              </a>
            </div>
          </CardContent>
        </Card>
      </template>
      <CampLeaderboard v-if="camp.registered && camp.started" :entries="camp.leaderboard" :problems="camp.problems" />
    </template>
  </div>
</template>
