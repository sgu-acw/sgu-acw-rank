<script setup lang="ts">
/**
 * 登录 / 注册表单。
 *
 * 两种模式共用一套字段样式，用 tab 切换。注册成功和登录成功都直接跳转，
 * 不在这里处理后续导航，交给调用方传 onSuccess。
 */
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, Fingerprint, Loader2 } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { ApiError, authApi, isStudentIdShaped, normalizeStudentId } from '../lib/api'
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

const { login, register, finishTotpLogin, loginWithPasskey, user, ensureLoaded } = useAuth()

const mode = ref<'login' | 'register'>(props.initialMode)
const submitting = ref(false)
const error = ref('')
//: 还在确认登录态。确认完之前不渲染表单，免得已登录的人先看一眼空表单。
const checking = ref(true)

const studentId = ref('')

// 两步验证第二步的状态：密码过了，差一个 TOTP 码。
const totpTicket = ref('')
const totpCode = ref('')
const canPasskey = ref(false)
const password = ref('')
const displayName = ref('')
const inviteCode = ref('')

// 学号格式提示。不在输入框上监听 keyup 来触发：浏览器自动填充和脚本设值都
// 不会发 keyup，那样会漏掉。改为直接看当前值，只多一个「非空」条件。
const studentIdLooksWrong = computed(
  () => studentId.value.trim() !== '' && !isStudentIdShaped(studentId.value),
)

const canSubmit = computed(() => {
  if (submitting.value) return false
  if (!studentId.value.trim() || !password.value) return false
  if (mode.value === 'register') {
    if (!displayName.value.trim() || !inviteCode.value.trim()) return false
    if (!isStudentIdShaped(studentId.value)) return false
  }
  return true
})

// 按钮为何不可点。光把按钮置灰而不说明原因，用户只能猜。
const blockedReason = computed(() => {
  if (submitting.value) return ''
  if (!inviteCode.value.trim() && mode.value === 'register') return '请填写邀请码'
  if (!studentId.value.trim()) return '请填写学号'
  if (!isStudentIdShaped(studentId.value)) return '学号格式不对，应为 11 位数字'
  if (!displayName.value.trim() && mode.value === 'register') return '请填写姓名'
  if (!password.value) return '请填写密码'
  if (mode.value === 'register' && password.value.length < 8) return '密码至少 8 位'
  return ''
})

function switchMode(next: 'login' | 'register') {
  mode.value = next
  error.value = ''
}

onMounted(async () => {
  // 邀请链接形如 /register?code=ABCD1234。带了这个参数就直接进注册模式并把
  // 码填好——成员从群里点过来时不该还要手抄一遍。
  const code = new URLSearchParams(window.location.search).get('code')
  if (code) {
    mode.value = 'register'
    inviteCode.value = code.trim().toUpperCase()
  }

  // 已经登录的人不该停在登录/注册表单上。
  //
  // 之前没这一步，已登录的账号点 /register 会看到一个空的注册表单，填了
  // 还会因为「账号已存在」报错——其实是该直接进去的。
  //
  // 先 await ensureLoaded()：user 初始为 null，不等它拉完就判，已登录的人
  // 也会被当成未登录放过去。
  //
  // 用 finally 复位 checking：ensureLoaded 内部已经吞掉网络错误，但真出
  // 意外时也不能让页面永远卡在「正在确认」。
  try {
    await ensureLoaded()
    if (user.value) {
      window.location.replace(props.redirectTo)
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
      const r = await login(normalizeStudentId(studentId.value), password.value)
      // 开了两步验证：转去填码，别直接跳走。
      if (typeof r === 'object' && 'totpRequired' in r && r.totpRequired) {
        totpTicket.value = r.ticket
        totpCode.value = ''
        submitting.value = false
        return
      }
    } else {
      await register({
        invite_code: inviteCode.value.trim().toUpperCase(),
        student_id: normalizeStudentId(studentId.value),
        display_name: displayName.value.trim(),
        password: password.value,
      })
    }
    window.location.href = props.redirectTo
  } catch (err) {
    if (err instanceof ApiError) {
      error.value = err.message
    } else {
      error.value = '出了点问题，请稍后重试'
    }
    submitting.value = false
  }
}

// 第二步：票据 + 验证码 → 会话。
async function submitTotp() {
  if (!totpTicket.value || !totpCode.value.trim() || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await finishTotpLogin(totpTicket.value, totpCode.value.trim())
    window.location.href = props.redirectTo
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '出了点问题，请稍后重试'
    submitting.value = false
    if (err instanceof ApiError && err.message.includes('票据')) {
      // 票据过期就退回密码步
      totpTicket.value = ''
      totpCode.value = ''
    }
  }
}

// 通行密钥登录：浏览器自己挑账号的密钥，不用先输学号。
async function usePasskey() {
  if (!canPasskey.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const { options } = await authApi.passkeyLoginBegin()
    const credential = await getPasskey(options)
    await loginWithPasskey(String((options as Record<string, unknown>).challenge), credential)
    window.location.href = props.redirectTo
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : (err as Error).message || '出了点问题，请稍后重试'
    submitting.value = false
  }
}
</script>

<template>
  <!--
    确认登录态期间不渲染表单。已登录的人会直接被跳走，让表单先出现再消失
    会白闪一下。
  -->
  <div v-if="checking" class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
    <Loader2 class="h-4 w-4 animate-spin" />
    正在确认登录状态
  </div>

  <Card v-else class="w-full max-w-md mx-auto">
    <CardHeader class="pb-4">
      <CardTitle class="text-lg">{{ mode === 'login' ? '登录' : '注册' }}</CardTitle>

      <div class="flex gap-1 pt-3">
        <button
          v-for="tab in [
            { key: 'login' as const, label: '登录' },
            { key: 'register' as const, label: '注册' },
          ]"
          :key="tab.key"
          type="button"
          class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          :class="
            mode === tab.key
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted/60'
          "
          @click="switchMode(tab.key)"
        >
          {{ tab.label }}
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
        <div v-if="mode === 'register'" class="space-y-1.5">
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

        <div class="space-y-1.5">
          <label for="student-id" class="text-sm font-medium">学号</label>
          <Input
            id="student-id"
            v-model="studentId"
            placeholder="11 位学号"
            autocomplete="username"
            inputmode="numeric"
            spellcheck="false"
            class="font-mono"
          />
          <p v-if="studentIdLooksWrong" class="text-xs text-destructive">
            学号格式看起来不对，应为 11 位数字
          </p>
          <p v-else class="text-xs text-muted-foreground">
            {{ mode === 'register' ? '入学年份、学院、专业会从学号自动识别' : '' }}
          </p>
        </div>

        <div v-if="mode === 'register'" class="space-y-1.5">
          <label for="display-name" class="text-sm font-medium">姓名</label>
          <Input
            id="display-name"
            v-model="displayName"
            placeholder="真实姓名"
            autocomplete="name"
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
          {{ mode === 'login' ? '登录' : '注册并登录' }}
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

      <!--
        只有登录页需要这一句：用户找不到「忘记密码」入口时会到处找。
        注册页不需要——邀请码字段的 placeholder 已经写了「群里的邀请码」。
      -->
      <p v-if="mode === 'login'" class="text-center text-xs text-muted-foreground">
        忘记密码请联系管理员重置
      </p>
    </CardContent>
  </Card>
</template>
