<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { AlertCircle, CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-vue-next'
import { ApiError, oauthApi, type OAuthAuthorizeInfo, type OAuthAuthorizeParams } from '../lib/api'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const info = ref<OAuthAuthorizeInfo | null>(null)
const params = ref<OAuthAuthorizeParams | null>(null)

function readParamsFromLocation(): OAuthAuthorizeParams | null {
  const qs = new URLSearchParams(window.location.search)
  const client_id = qs.get('client_id')?.trim() ?? ''
  const redirect_uri = qs.get('redirect_uri')?.trim() ?? ''
  if (!client_id || !redirect_uri) return null
  return {
    client_id,
    redirect_uri,
    response_type: qs.get('response_type')?.trim() || 'code',
    scope: qs.get('scope')?.trim() || undefined,
    state: qs.get('state')?.trim() || undefined,
    code_challenge: qs.get('code_challenge')?.trim() || undefined,
    code_challenge_method: qs.get('code_challenge_method')?.trim() || undefined,
  }
}

onMounted(async () => {
  const parsed = readParamsFromLocation()
  if (!parsed) {
    error.value = '授权链接缺少必要参数（client_id 或 redirect_uri）'
    loading.value = false
    return
  }
  params.value = parsed
  try {
    const res = await oauthApi.authorizeInfo(parsed)
    if (!res.authenticated) {
      const next = `${window.location.pathname}${window.location.search}`
      window.location.replace(`/login?next=${encodeURIComponent(next)}`)
      return
    }
    info.value = res
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '无法加载授权信息，请检查链接是否有效'
  } finally {
    loading.value = false
  }
})

async function decide(approve: boolean) {
  if (!params.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const res = await oauthApi.authorize({ ...params.value, approve })
    window.location.assign(res.redirect_url)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '授权处理失败，请稍后重试'
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
    <Loader2 class="h-4 w-4 animate-spin" />
    正在检查工作坊登录状态与授权请求…
  </div>

  <Card v-else-if="error && !info" class="border-destructive/40">
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-base text-destructive">
        <AlertCircle class="h-4 w-4" />
        授权请求无效
      </CardTitle>
      <p class="text-sm text-muted-foreground">{{ error }}</p>
    </CardHeader>
    <CardContent>
      <a href="/" class="text-sm text-primary hover:underline">返回工作坊首页</a>
    </CardContent>
  </Card>

  <Card v-else-if="info" class="shadow-sm">
    <CardHeader class="space-y-2">
      <div class="inline-flex w-fit items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
        <KeyRound class="h-3.5 w-3.5" />
        工作坊 OAuth 一键认证
      </div>
      <CardTitle class="text-lg">{{ info.client.name }}</CardTitle>
      <p v-if="info.client.description" class="text-sm text-muted-foreground">{{ info.client.description }}</p>
    </CardHeader>

    <CardContent class="space-y-5">
      <div class="rounded-lg border border-border/70 bg-muted/25 px-3.5 py-3 text-sm">
        <div class="text-xs text-muted-foreground">当前登录账号</div>
        <div class="mt-1 flex flex-wrap items-center gap-2 font-medium">
          <span>{{ info.user_display_name }}</span>
          <span class="font-mono text-xs text-muted-foreground">{{ info.user_student_id }}</span>
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">该应用申请获取以下信息：</p>
        <ul class="space-y-2">
          <li
            v-for="scope in info.scopes"
            :key="scope.key"
            class="flex items-start gap-2.5 rounded-md border border-border/60 px-3 py-2.5 text-sm"
          >
            <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <div class="font-medium">{{ scope.label }}</div>
              <div class="text-xs text-muted-foreground">{{ scope.description }}</div>
            </div>
          </li>
        </ul>
      </div>

      <div
        v-if="!info.eligible"
        class="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
      >
        {{ info.ineligible_reason || '当前账号不符合该应用的授权条件' }}
      </div>

      <div
        v-if="error"
        class="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
      >
        {{ error }}
      </div>

      <div class="flex flex-wrap items-center gap-2 pt-1">
        <Button
          v-if="info.eligible"
          class="flex-1"
          :disabled="submitting"
          @click="decide(true)"
        >
          <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
          <ShieldCheck v-else class="mr-2 h-4 w-4" />
          同意并一键认证
        </Button>
        <Button
          variant="outline"
          :class="info.eligible ? '' : 'flex-1'"
          :disabled="submitting"
          @click="decide(false)"
        >
          拒绝
        </Button>
      </div>

      <p class="text-xs leading-relaxed text-muted-foreground">
        授权后将跳转回
        <span class="break-all font-mono">{{ info.redirect_uri }}</span>。工作坊仅校验本次身份，不会泄露你的密码。
      </p>
    </CardContent>
  </Card>
</template>
