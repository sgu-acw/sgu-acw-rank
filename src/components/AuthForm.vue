<script setup lang="ts">
/**
 * 登录 / 注册表单。
 *
 * 登录支持校内 11 位学号或校外用户名；注册提供两条清晰通道：
 * - 校内成员：邀请码 + 学号 + 真实姓名 + 密码（开通全部校内功能）
 * - 校外人员：自定义用户名 + 昵称 + 密码（免邀请码，仅开放学习与公开功能）
 */
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, Fingerprint, GraduationCap, Loader2, UserPlus } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import {
  ApiError,
  authApi,
  isExternalUsernameShaped,
  isStudentIdShaped,
  normalizeExternalUsername,
  normalizeLoginIdentifier,
  normalizeStudentId,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { getPasskey, passkeySupported } from '../lib/webauthn'

const props = withDefaults(
  defineProps<{
    /** 初始模式 */
    initialMode?: 'login' | 'register'
    /** 成功后做什么。默认整页跳到 /me */
    redirectTo?: string
  }>(),
  { initialMode: 'login', redirectTo: '/me' },
)

const {
  login,
  register,
  registerExternal,
  finishTotpLogin,
  loginWithPasskey,
  user,
  ensureLoaded,
} = useAuth()

const mode = ref<'login' | 'register'>(props.initialMode)
const registerChannel = ref<'campus' | 'external'>('campus')
const submitting = ref(false)
const error = ref('')
/** 还在确认登录态。确认完之前不渲染表单，免得已登录的人先看一眼空表单。 */
const checking = ref(true)

const identifier = ref('')
const externalUsername = ref('')

// 两步验证第二步的状态：密码过了，差一个 TOTP 码。
const totpTicket = ref('')
const totpCode = ref('')
const canPasskey = ref(false)
const password = ref('')
const displayName = ref('')
const inviteCode = ref('')

const isExternalRegister = computed(
  () => mode.value === 'register' && registerChannel.value === 'external',
)

const studentIdLooksWrong = computed(
  () =>
    mode.value === 'register' &&
    registerChannel.value === 'campus' &&
    identifier.value.trim() !== '' &&
    !isStudentIdShaped(identifier.value),
)

const externalUsernameLooksWrong = computed(
  () =>
    isExternalRegister.value &&
    externalUsername.value.trim() !== '' &&
    !isExternalUsernameShaped(externalUsername.value),
)

const canSubmit = computed(() => {
  if (submitting.value) return false
  if (mode.value === 'login') {
    return Boolean(identifier.value.trim() && password.value)
  }
  if (!displayName.value.trim() || password.value.length < 8) return false
  if (registerChannel.value === 'external') {
    return isExternalUsernameShaped(externalUsername.value)
  }
  return Boolean(inviteCode.value.trim() && isStudentIdShaped(identifier.value))
})

// 按钮为何不可点。光把按钮置灰而不说明原因，用户只能猜。
const blockedReason = computed(() => {
  if (submitting.value) return ''
  if (mode.value === 'login') {
    if (!identifier.value.trim()) return '请填写学号或校外用户名'
    if (!password.value) return '请填写密码'
    return ''
  }
  if (registerChannel.value === 'external') {
    if (!externalUsername.value.trim()) return '请填写校外用户名'
    if (!isExternalUsernameShaped(externalUsername.value)) {
      return '用户名需以字母开头，3-16 位，仅含字母、数字、_ 或 -'
    }
    if (!displayName.value.trim()) return '请填写昵称'
    if (!password.value) return '请填写密码'
    if (password.value.length < 8) return '密码至少 8 位'
    return ''
  }
  if (!inviteCode.value.trim()) return '请填写邀请码'
  if (!identifier.value.trim()) return '请填写学号'
  if (!isStudentIdShaped(identifier.value)) return '学号格式不对，应为 11 位数字'
  if (!displayName.value.trim()) return '请填写姓名'
  if (!password.value) return '请填写密码'
  if (password.value.length < 8) return '密码至少 8 位'
  return ''
})

function switchMode(next: 'login' | 'register') {
  mode.value = next
  error.value = ''
}

function switchChannel(next: 'campus' | 'external') {
  registerChannel.value = next
  error.value = ''
}

const redirectTarget = ref(props.redirectTo)

function resolveSafeNext(raw: string | null): string {
  if (!raw) return props.redirectTo
  const trimmed = raw.trim()
  // 仅允许站内相对路径，拦截 //evil.com 或协议跳转，防止开放重定向。
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\r') && !trimmed.includes('\n')) {
    return trimmed
  }
  return props.redirectTo
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  redirectTarget.value = resolveSafeNext(params.get('next'))
  const code = params.get('code')
  const channel = params.get('channel')
  if (code) {
    mode.value = 'register'
    registerChannel.value = 'campus'
    inviteCode.value = code.trim().toUpperCase()
  } else if (channel === 'external') {
    mode.value = 'register'
    registerChannel.value = 'external'
  }

  try {
    await ensureLoaded()
    if (user.value) {
      window.location.replace(redirectTarget.value)
      return
    }
  } finally {
    checking.value = false
  }
  canPasskey.value = passkeySupported()
})

async function submit() {
  if (!canSubmit.value) return

  submitting.value = true
  error.value = ''

  try {
    if (mode.value === 'login') {
      const r = await login(normalizeLoginIdentifier(identifier.value), password.value)
      if (typeof r === 'object' && 'totpRequired' in r && r.totpRequired) {
        totpTicket.value = r.ticket
        totpCode.value = ''
        submitting.value = false
        return
      }
      window.location.href = redirectTarget.value
      return
    }

    if (registerChannel.value === 'external') {
      await registerExternal({
        username: normalizeExternalUsername(externalUsername.value),
        display_name: displayName.value.trim(),
        password: password.value,
      })
      window.location.href = redirectTarget.value === props.redirectTo ? '/' : redirectTarget.value
      return
    }

    await register({
      invite_code: inviteCode.value.trim().toUpperCase(),
      student_id: normalizeStudentId(identifier.value),
      display_name: displayName.value.trim(),
      password: password.value,
    })
    window.location.href = redirectTarget.value
  } catch (err) {
    if (err instanceof ApiError) {
      error.value = err.message
    } else {
      error.value = '出了点问题，请稍后重试'
    }
    submitting.value = false
  }
}

async function submitTotp() {
  if (!totpTicket.value || !totpCode.value.trim() || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await finishTotpLogin(totpTicket.value, totpCode.value.trim())
    window.location.href = redirectTarget.value
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '出了点问题，请稍后重试'
    submitting.value = false
    if (err instanceof ApiError && err.message.includes('票据')) {
      totpTicket.value = ''
      totpCode.value = ''
    }
  }
}

async function usePasskey() {
  if (!canPasskey.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const { options } = await authApi.passkeyLoginBegin()
    const credential = await getPasskey(options)
    await loginWithPasskey(String((options as Record<string, unknown>).challenge), credential)
    window.location.href = redirectTarget.value
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : (err as Error).message || '出了点问题，请稍后重试'
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="checking" class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
    <Loader2 class="h-4 w-4 animate-spin" />
    正在确认登录状态
  </div>

  <Card v-else class="mx-auto w-full max-w-md">
    <CardHeader class="space-y-3 pb-4">
      <div class="flex items-center justify-between gap-2">
        <CardTitle class="text-lg">{{ mode === 'login' ? '登录' : '注册账号' }}</CardTitle>
        <div class="segment-tabs" role="tablist" aria-label="登录或注册">
          <button
            v-for="tab in [
              { key: 'login' as const, label: '登录' },
              { key: 'register' as const, label: '注册' },
            ]"
            :key="tab.key"
            type="button"
            role="tab"
            :aria-selected="mode === tab.key"
            class="segment-tab"
            @click="switchMode(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- 注册通道切换：校内成员 vs 校外人员 -->
      <div
        v-if="mode === 'register' && !totpTicket"
        class="grid grid-cols-2 gap-2 pt-1"
        role="radiogroup"
        aria-label="选择注册身份"
      >
        <button
          type="button"
          :aria-pressed="registerChannel === 'campus'"
          class="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
          :class="
            registerChannel === 'campus'
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground'
          "
          @click="switchChannel('campus')"
        >
          <GraduationCap class="h-3.5 w-3.5 shrink-0" />
          校内成员
        </button>
        <button
          type="button"
          :aria-pressed="registerChannel === 'external'"
          class="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
          :class="
            registerChannel === 'external'
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground'
          "
          @click="switchChannel('external')"
        >
          <UserPlus class="h-3.5 w-3.5 shrink-0" />
          校外人员
        </button>
      </div>
    </CardHeader>

    <CardContent class="space-y-4">
      <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
        <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
        <span class="text-sm">{{ error }}</span>
      </Alert>

      <!-- 第二步：两步验证码 -->
      <form v-if="totpTicket" class="space-y-4" @submit.prevent="submitTotp">
        <div class="space-y-1.5">
          <label for="totp-code" class="text-sm font-medium">两步验证码</label>
          <Input
            id="totp-code"
            v-model="totpCode"
            placeholder="认证器里的 6 位数字"
            autocomplete="one-time-code"
            inputmode="numeric"
            maxlength="8"
            class="font-mono tracking-widest"
          />
          <p class="text-xs text-muted-foreground">密码已通过，还差验证器上的动态码</p>
        </div>
        <Button type="submit" class="w-full" :disabled="!totpCode.trim()">
          <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
          验证并登录
        </Button>
        <button
          type="button"
          class="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          @click="totpTicket = ''; totpCode = ''; error = ''"
        >
          返回重新输入密码
        </button>
      </form>

      <form v-else class="space-y-4" @submit.prevent="submit">
        <!-- 校外通道说明 -->
        <div
          v-if="isExternalRegister"
          class="rounded-lg border border-border/60 bg-muted/35 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
        >
          无需邀请码与学号。校外账号可使用在线题库、云端 IDE、每日一题与公开题单并保存个人刷题记录；校内榜单、集训与内部活动仅对校内成员开放。
        </div>

        <!-- 校内注册：邀请码 -->
        <div v-if="mode === 'register' && registerChannel === 'campus'" class="space-y-1.5">
          <label for="invite" class="text-sm font-medium">邀请码</label>
          <Input
            id="invite"
            v-model="inviteCode"
            placeholder="群里的邀请码"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            class="font-mono uppercase"
          />
        </div>

        <!-- 校外注册：用户名 -->
        <div v-if="isExternalRegister" class="space-y-1.5">
          <label for="external-username" class="text-sm font-medium">用户名</label>
          <Input
            id="external-username"
            v-model="externalUsername"
            placeholder="字母开头，3-16 位（如 alice_acm）"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            maxlength="16"
            class="font-mono"
          />
          <p v-if="externalUsernameLooksWrong" class="text-xs text-destructive">
            需以英文字母开头，3-16 位，仅允许字母、数字、下划线或连字符
          </p>
          <p v-else class="text-xs text-muted-foreground">
            作为登录账号使用，自动统一为小写
          </p>
        </div>

        <!-- 登录或校内注册：学号 / 用户名 -->
        <div v-else class="space-y-1.5">
          <label for="student-id" class="text-sm font-medium">
            {{ mode === 'login' ? '学号 / 用户名' : '学号' }}
          </label>
          <Input
            id="student-id"
            v-model="identifier"
            :placeholder="mode === 'login' ? '校内 11 位学号，或校外用户名' : '11 位学号'"
            autocomplete="username"
            :inputmode="mode === 'register' ? 'numeric' : 'text'"
            spellcheck="false"
            class="font-mono"
          />
          <p v-if="studentIdLooksWrong" class="text-xs text-destructive">
            学号格式看起来不对，应为 11 位数字
          </p>
          <p v-else-if="mode === 'register'" class="text-xs text-muted-foreground">
            入学年份、学院、专业会从学号自动识别
          </p>
        </div>

        <!-- 注册时的姓名 / 昵称 -->
        <div v-if="mode === 'register'" class="space-y-1.5">
          <label for="display-name" class="text-sm font-medium">
            {{ isExternalRegister ? '昵称' : '姓名' }}
          </label>
          <Input
            id="display-name"
            v-model="displayName"
            :placeholder="isExternalRegister ? '用于站内显示的称呼' : '真实姓名'"
            :autocomplete="isExternalRegister ? 'nickname' : 'name'"
            maxlength="32"
          />
        </div>

        <div class="space-y-1.5">
          <label for="password" class="text-sm font-medium">密码</label>
          <Input
            id="password"
            v-model="password"
            type="password"
            :placeholder="mode === 'register' ? '至少 8 位' : ''"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          />
        </div>

        <Button type="submit" class="w-full" :disabled="!canSubmit">
          <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
          {{
            mode === 'login'
              ? '登录'
              : isExternalRegister
                ? '创建校外账号'
                : '注册并登录'
          }}
        </Button>

        <Button
          v-if="mode === 'login' && canPasskey"
          type="button"
          variant="outline"
          class="w-full"
          :disabled="submitting"
          @click="usePasskey"
        >
          <Fingerprint class="mr-2 h-4 w-4" />
          用通行密钥登录
        </Button>

        <p v-if="blockedReason" class="text-center text-xs text-muted-foreground">
          {{ blockedReason }}
        </p>
      </form>

      <div v-if="mode === 'login'" class="flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
        <span>忘记密码请联系管理员重置</span>
        <button
          type="button"
          class="font-medium text-foreground underline-offset-4 hover:underline"
          @click="switchMode('register'); switchChannel('external')"
        >
          校外注册 →
        </button>
      </div>
    </CardContent>
  </Card>
</template>
