<script setup lang="ts">
/**
 * 个人中心的安全设置：两步验证（TOTP）+ 通行密钥（passkey）。
 *
 * 都是自助流程：开/关自己负责，管理端不需要碰。
 * TOTP：begin 给 QR → 扫码 → 输当前码 → enable。关闭也要输一次码。
 * 通行密钥：列出已绑设备，加新的走 navigator.credentials.create，
 * 删除直接删。注册时要求可发现凭据（resident key）——登录端不先问学号。
 */
import { computed, onMounted, ref } from 'vue'
import { CheckCircle2, Fingerprint, KeyRound, Loader2, Plus, Trash2 } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import ActionNotice from './ui/ActionNotice.vue'
import { ApiError, authApi, type PasskeyEntry } from '../lib/api'
import { useAuth } from '../lib/auth'
import { confirmAction } from '../lib/confirm'
import { createPasskey, passkeySupported } from '../lib/webauthn'

const { user } = useAuth()

// ---------------------------------------------------------------- 两步验证

const totpEnabled = computed(() => !!user.value?.totp_enabled)
const totpSetup = ref<{ secret: string; uri: string; qr: string } | null>(null)
const totpCode = ref('')
const totpDisable = ref(false)
const totpBusy = ref(false)
const totpError = ref('')
const notice = ref('')

async function beginTotp() {
  if (totpBusy.value) return
  totpError.value = ''
  totpBusy.value = true
  try {
    const r = await authApi.totpBegin()
    totpSetup.value = { secret: r.secret, uri: r.otpauth_uri, qr: r.qr_svg }
    totpDisable.value = false
    totpCode.value = ''
  } catch (err) {
    totpError.value = err instanceof ApiError ? err.message : '开启失败'
  } finally {
    totpBusy.value = false
  }
}

async function enableTotp() {
  if (!totpCode.value.trim() || totpBusy.value) return
  totpBusy.value = true
  totpError.value = ''
  try {
    await authApi.totpEnable(totpCode.value.trim())
    if (user.value) user.value.totp_enabled = true
    totpSetup.value = null
    totpCode.value = ''
    notice.value = '两步验证已开启'
    window.setTimeout(() => { if (notice.value === '两步验证已开启') notice.value = '' }, 3000)
  } catch (err) {
    totpError.value = err instanceof ApiError ? err.message : '验证码不对'
  } finally {
    totpBusy.value = false
  }
}

async function disableTotp() {
  if (!totpCode.value.trim() || totpBusy.value) return
  totpBusy.value = true
  totpError.value = ''
  try {
    await authApi.totpDisable(totpCode.value.trim())
    if (user.value) user.value.totp_enabled = false
    totpDisable.value = false
    totpCode.value = ''
    notice.value = '两步验证已关闭'
    window.setTimeout(() => { if (notice.value === '两步验证已关闭') notice.value = '' }, 3000)
  } catch (err) {
    totpError.value = err instanceof ApiError ? err.message : '验证码不对'
  } finally {
    totpBusy.value = false
  }
}

// ---------------------------------------------------------------- 通行密钥

const passkeys = ref<PasskeyEntry[]>([])
const pkLoading = ref(true)
const pkBusy = ref(false)
const pkName = ref('')
const pkError = ref('')
const addingPasskey = ref(false)
const canPasskey = ref(false)

async function loadPasskeys() {
  pkLoading.value = true
  try {
    passkeys.value = await authApi.passkeys()
  } catch {
    passkeys.value = []
  } finally {
    pkLoading.value = false
  }
}

async function addPasskey() {
  if (pkBusy.value) return
  pkBusy.value = true
  pkError.value = ''
  try {
    const { options } = await authApi.passkeyRegisterBegin()
    const challenge = String((options as Record<string, unknown>).challenge)
    const credential = await createPasskey(options)
    const name = pkName.value.trim() || '未命名设备'
    const created = await authApi.passkeyRegisterComplete(challenge, credential, name)
    passkeys.value.push(created)
    pkName.value = ''
    addingPasskey.value = false
    notice.value = '通行密钥已绑定'
    window.setTimeout(() => { if (notice.value === '通行密钥已绑定') notice.value = '' }, 3000)
  } catch (err) {
    pkError.value = err instanceof ApiError ? err.message : (err as Error).message || '绑定失败'
  } finally {
    pkBusy.value = false
  }
}

async function removePasskey(p: PasskeyEntry) {
  if (pkBusy.value) return
  if (!await confirmAction(`删掉通行密钥「${p.name || '未命名'}」？以后就不能用它登录了。`)) return
  pkBusy.value = true
  try {
    await authApi.passkeyRemove(p.id)
    passkeys.value = passkeys.value.filter((x) => x.id !== p.id)
  } catch (err) {
    pkError.value = err instanceof ApiError ? err.message : '删除失败'
  } finally {
    pkBusy.value = false
  }
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(async () => {
  canPasskey.value = passkeySupported()
  await loadPasskeys()
})
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <CardTitle class="flex items-center gap-2 text-sm">
        <KeyRound class="h-4 w-4" />安全设置
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-5">
      <ActionNotice :message="notice" />

      <!-- 两步验证 -->
      <div class="space-y-2.5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium">两步验证（TOTP）</p>
            <p class="text-xs text-muted-foreground">登录时在密码后再输一个认证器动态码</p>
          </div>
          <span v-if="totpEnabled" class="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-500">
            <CheckCircle2 class="h-3.5 w-3.5" />已开启
          </span>
        </div>
        <Alert v-if="totpError" variant="destructive" class="text-sm">{{ totpError }}</Alert>

        <!-- 开启流程 -->
        <div v-if="totpSetup" class="space-y-2.5 rounded-md border border-border/60 p-3">
          <p class="text-xs text-muted-foreground">用认证器扫下面的码，或手输密钥</p>
          <img :src="`data:image/svg+xml;charset=utf-8,${encodeURIComponent(totpSetup.qr)}`" alt="两步验证设置二维码" class="mx-auto h-48 w-48 rounded bg-white p-2" />
          <p class="break-all text-center font-mono text-xs text-muted-foreground">{{ totpSetup.secret }}</p>
          <Input v-model="totpCode" placeholder="认证器里的 6 位数字" inputmode="numeric" maxlength="8" class="min-h-11 font-mono tracking-widest" />
          <div class="flex gap-2">
            <Button size="sm" :disabled="totpBusy || !totpCode.trim()" @click="enableTotp">
              <Loader2 v-if="totpBusy" class="mr-1.5 h-3.5 w-3.5 animate-spin" />开启两步验证
            </Button>
            <Button size="sm" variant="ghost" :disabled="totpBusy" @click="totpSetup = null">取消</Button>
          </div>
        </div>

        <!-- 关闭流程 -->
        <div v-else-if="totpDisable" class="space-y-2.5 rounded-md border border-border/60 p-3">
          <p class="text-xs text-muted-foreground">关闭前要再验一次当前码</p>
          <Input v-model="totpCode" placeholder="认证器里的 6 位数字" inputmode="numeric" maxlength="8" class="min-h-11 font-mono tracking-widest" />
          <div class="flex gap-2">
            <Button size="sm" variant="destructive" :disabled="totpBusy || !totpCode.trim()" @click="disableTotp">
              <Loader2 v-if="totpBusy" class="mr-1.5 h-3.5 w-3.5 animate-spin" />关闭两步验证
            </Button>
            <Button size="sm" variant="ghost" :disabled="totpBusy" @click="totpDisable = false">取消</Button>
          </div>
        </div>

        <div v-else class="flex gap-2">
          <Button v-if="!totpEnabled" size="sm" variant="outline" :disabled="totpBusy" @click="beginTotp">
            <Loader2 v-if="totpBusy" class="mr-1.5 h-3.5 w-3.5 animate-spin" />开启两步验证
          </Button>
          <Button v-else size="sm" variant="outline" @click="totpDisable = true; totpCode = ''; totpError = ''">
            关闭两步验证
          </Button>
        </div>
      </div>

      <!-- 通行密钥 -->
      <div class="space-y-2.5 border-t border-border/40 pt-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="flex items-center gap-1.5 text-sm font-medium"><Fingerprint class="h-4 w-4" />通行密钥</p>
            <p class="text-xs text-muted-foreground">指纹 / 面容 / 系统 PIN 登录，不输密码</p>
          </div>
          <Button v-if="canPasskey" size="sm" variant="outline" :disabled="pkBusy" @click="addingPasskey = !addingPasskey">
            <Plus class="mr-1 h-3.5 w-3.5" />绑定新设备
          </Button>
        </div>
        <p v-if="!canPasskey" class="text-xs text-muted-foreground">这台浏览器不支持通行密钥</p>
        <Alert v-if="pkError" variant="destructive" class="text-sm">{{ pkError }}</Alert>

        <div v-if="addingPasskey" class="space-y-2.5 rounded-md border border-border/60 p-3">
          <Input v-model="pkName" placeholder="给这台设备起个名（如「我的手机」）" maxlength="80" class="min-h-11" />
          <div class="flex gap-2">
            <Button size="sm" :disabled="pkBusy" @click="addPasskey">
              <Loader2 v-if="pkBusy" class="mr-1.5 h-3.5 w-3.5 animate-spin" />验证指纹 / 面容 / PIN
            </Button>
            <Button size="sm" variant="ghost" :disabled="pkBusy" @click="addingPasskey = false">取消</Button>
          </div>
        </div>

        <p v-if="pkLoading" class="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" />读取…</p>
        <template v-else>
          <div v-for="p in passkeys" :key="p.id" class="flex items-center gap-3 rounded-md border border-border/40 px-3 py-2.5">
            <Fingerprint class="h-4 w-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ p.name || '未命名设备' }}</p>
              <p class="text-xs text-muted-foreground">
                绑定于 {{ fmtTime(p.created_at) }}<template v-if="p.last_used_at"> · 上次用 {{ fmtTime(p.last_used_at) }}</template>
              </p>
            </div>
            <button class="rounded p-1.5 text-muted-foreground hover:text-destructive" title="删除" :disabled="pkBusy" @click="removePasskey(p)">
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
          <p v-if="!passkeys.length" class="text-xs text-muted-foreground">还没有绑定任何设备</p>
        </template>
      </div>
    </CardContent>
  </Card>
</template>
