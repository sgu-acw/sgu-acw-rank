<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { AlertCircle, CheckCircle2, Loader2, Smartphone } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { ApiError, authApi } from '../lib/api'
import { useAuth } from '../lib/auth'

const { user, ensureLoaded } = useAuth()
const token = new URLSearchParams(window.location.search).get('token') || ''
const checking = ref(true)
const confirming = ref(false)
const confirmed = ref(false)
const error = ref('')
const approval = ref<Awaited<ReturnType<typeof authApi.qrLoginInfo>> | null>(null)

onMounted(async () => {
  await ensureLoaded()
  if (!token) {
    error.value = '二维码无效，请在电脑上重新生成'
  } else if (!user.value) {
    const next = `/qr-login?token=${encodeURIComponent(token)}`
    window.location.replace(`/login?next=${encodeURIComponent(next)}`)
    return
  } else {
    try {
      approval.value = await authApi.qrLoginInfo(token)
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : '无法读取登录请求，请重新扫码'
    }
  }
  checking.value = false
})

async function confirmLogin() {
  if (!approval.value || confirming.value || confirmed.value) return
  confirming.value = true
  error.value = ''
  try {
    await authApi.qrLoginApprove(token)
    confirmed.value = true
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '确认失败，请回到电脑重新生成二维码'
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <Card class="mx-auto w-full max-w-md">
    <CardHeader>
      <CardTitle class="text-lg">{{ approval?.application ? '确认应用登录' : '确认电脑登录' }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div v-if="checking" class="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
        <Loader2 class="h-4 w-4 animate-spin" />正在确认手机登录状态
      </div>
      <div v-else-if="confirmed" class="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4">
        <CheckCircle2 class="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div class="space-y-1">
          <p class="text-sm font-medium">已确认电脑登录</p>
          <p class="text-sm text-muted-foreground">可以回到电脑继续使用工作坊。</p>
        </div>
      </div>
      <template v-else-if="user && approval">
        <div class="flex items-center gap-3 rounded-md border border-border p-4">
          <Smartphone class="h-5 w-5 shrink-0 text-muted-foreground" />
          <p class="text-sm">将以 <strong>{{ user.display_name }}</strong> 的账号登录{{ approval.application || '电脑' }}</p>
        </div>
        <p v-if="approval.scopes?.length" class="text-sm text-muted-foreground">
          应用将读取{{ approval.scopes.join('、') }}。
        </p>
        <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
          <AlertCircle class="h-4 w-4 shrink-0" />
          <span class="text-sm">{{ error }}</span>
        </Alert>
        <Button type="button" class="w-full" :disabled="confirming" @click="confirmLogin">
          <Loader2 v-if="confirming" class="mr-2 h-4 w-4 animate-spin" />
          确认登录
        </Button>
      </template>
      <Alert v-else-if="error" variant="destructive" class="flex items-start gap-2">
        <AlertCircle class="h-4 w-4 shrink-0" />
        <span class="text-sm">{{ error }}</span>
      </Alert>
    </CardContent>
  </Card>
</template>
