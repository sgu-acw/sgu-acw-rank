<script setup lang="ts">
/**
 * 平台账号绑定。
 *
 * 验证方式是把后端给的一串 SGU-xxxx 填进平台的签名里，再让后端去读。
 * 这证明的是「这个人控制那个账号」，不是「这个人是韶关学院的」——后者需要
 * 学校配合，前者正是绑定真正要确认的事。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Separator } from './ui/separator'
import {
  ApiError,
  PLATFORM_META,
  accountsApi,
  type Platform,
  type PlatformAccount,
} from '../lib/api'

const loading = ref(true)
const error = ref('')
const notice = ref('')

const accounts = ref<PlatformAccount[]>([])
const adding = ref(false)
const verifying = ref<number | null>(null)
//: 账号 id → 还要等几秒才能再点验证。后端限流时不只报错，还让按钮走个
//: 倒计时，免得用户以为是坏了而反复点。
const cooldowns = ref<Record<number, number>>({})
let ticker: number | undefined

const newPlatform = ref<Platform>('codeforces')
const newIdentifier = ref('')

const PLATFORMS = Object.keys(PLATFORM_META) as Platform[]

function flash(message: string) {
  notice.value = message
  window.setTimeout(() => {
    if (notice.value === message) notice.value = ''
  }, 3000)
}

//: 刚复制过的账号 id。用来把按钮图标换成对勾，给一个「按下去了」的反馈。
const copiedId = ref<number | null>(null)

/**
 * 复制验证码。
 *
 * navigator.clipboard 只在 https 或 localhost 下可用，而且用户拒绝授权时
 * 会抛错。所以失败时退回到「选中这段文字」，让人自己按 Ctrl+C——
 * 总好过点了没反应。
 */
async function copyToken(account: PlatformAccount) {
  const token = account.verify_token
  if (!token) return

  try {
    await navigator.clipboard.writeText(token)
    copiedId.value = account.id
    window.setTimeout(() => {
      if (copiedId.value === account.id) copiedId.value = null
    }, 1500)
  } catch {
    // 退路：把验证码选中，用户直接按 Ctrl+C 就行。
    const el = document.querySelector(`[data-token="${account.id}"]`)
    if (el) {
      const range = document.createRange()
      range.selectNodeContents(el)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    flash('已选中验证码，按 Ctrl+C 复制')
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    accounts.value = await accountsApi.mine()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function add() {
  if (!newIdentifier.value.trim()) return
  adding.value = true
  error.value = ''
  try {
    const created = await accountsApi.add(newPlatform.value, newIdentifier.value.trim())
    accounts.value = [...accounts.value, created]
    newIdentifier.value = ''
    flash('已添加，请按提示把验证码填进平台签名')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '添加失败'
  } finally {
    adding.value = false
  }
}

async function verify(account: PlatformAccount) {
  if (cooldowns.value[account.id] > 0) return

  verifying.value = account.id
  error.value = ''
  try {
    const result = await accountsApi.verify(account.id)
    if (result.account) {
      const index = accounts.value.findIndex((a) => a.id === account.id)
      if (index >= 0) accounts.value[index] = result.account
    }
    if (result.ok) flash('验证通过')
    else error.value = result.detail
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      const wait = err.retryAfter ?? 10
      cooldowns.value = { ...cooldowns.value, [account.id]: wait }
    }
    error.value = err instanceof ApiError ? err.message : '验证失败'
  } finally {
    verifying.value = null
  }
}

async function renew(account: PlatformAccount) {
  try {
    const updated = await accountsApi.renew(account.id)
    const index = accounts.value.findIndex((a) => a.id === account.id)
    if (index >= 0) accounts.value[index] = updated
    flash('已生成新的验证码')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '生成失败'
  }
}

async function remove(account: PlatformAccount) {
  if (!window.confirm(`确定解绑 ${PLATFORM_META[account.platform].label} 的 ${account.identifier}？`)) return
  try {
    await accountsApi.remove(account.id)
    accounts.value = accounts.value.filter((a) => a.id !== account.id)
    flash('已解绑')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '解绑失败'
  }
}

onMounted(() => {
  load()
  // 每秒把倒计时往下减。用一个 ticker 而不是每个账号一个定时器。
  ticker = window.setInterval(() => {
    const next: Record<number, number> = {}
    let any = false
    for (const [id, seconds] of Object.entries(cooldowns.value)) {
      const left = seconds - 1
      if (left > 0) {
        next[Number(id)] = left
        any = true
      }
    }
    if (any || Object.keys(cooldowns.value).length) cooldowns.value = next
  }, 1000)
})

onUnmounted(() => {
  if (ticker !== undefined) window.clearInterval(ticker)
})
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <CardTitle class="text-sm font-medium">平台账号</CardTitle>
    </CardHeader>

    <CardContent class="space-y-4">
      <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
        <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
        <span class="text-sm">{{ error }}</span>
      </Alert>
      <Alert v-if="notice" class="flex items-start gap-2">
        <Check class="h-4 w-4 shrink-0 translate-y-0.5" />
        <span class="text-sm">{{ notice }}</span>
      </Alert>

      <div v-if="loading" class="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin" />
        正在读取…
      </div>

      <template v-else>
        <div v-if="!accounts.length" class="text-sm text-muted-foreground">
          暂无已绑定账号
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="account in accounts"
            :key="account.id"
            class="rounded-md border border-border/40 p-3"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium">{{ PLATFORM_META[account.platform].label }}</span>
              <span class="font-mono text-xs text-muted-foreground">{{ account.identifier }}</span>

              <span
                v-if="account.verified_at"
                class="rounded border border-emerald-600/30 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-500"
              >
                已验证
              </span>
              <span v-else class="rounded border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                待验证
              </span>

              <div class="ml-auto flex shrink-0 gap-1">
                <Button
                  v-if="!account.verified_at"
                  size="sm"
                  :disabled="verifying === account.id || cooldowns[account.id] > 0"
                  @click="verify(account)"
                >
                  <Loader2 v-if="verifying === account.id" class="mr-1 h-3.5 w-3.5 animate-spin" />
                  <template v-if="cooldowns[account.id] > 0">
                    {{ cooldowns[account.id] }} 秒后可重试
                  </template>
                  <template v-else>验证</template>
                </Button>
                <Button variant="ghost" size="sm" @click="remove(account)">
                  <Trash2 class="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <!-- 待验证时给出具体操作步骤，包括去哪填、填什么。 -->
            <div v-if="!account.verified_at && account.verify_token" class="mt-2.5 space-y-1.5">
              <p class="text-xs text-muted-foreground">
                把下面这串填进
                <a
                  :href="PLATFORM_META[account.platform].settingsUrl(account.identifier)"
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  {{ PLATFORM_META[account.platform].label }} 的「{{ PLATFORM_META[account.platform].field }}」
                  <ExternalLink class="h-3 w-3" />
                </a>
                ，保存后回来点验证。原有内容不用删，加在后面即可。
              </p>
              <!-- 有些平台的字段有坑（比如 CF 的组织是个选择器），单说清楚。 -->
              <p
                v-if="PLATFORM_META[account.platform].hint"
                class="text-xs text-muted-foreground/70"
              >
                {{ PLATFORM_META[account.platform].hint }}
              </p>
              <!--
                验证码。整块可点，点了就复制。
                单独放一个小按钮不够——这串东西就是要拿去粘到别处的，
                点击本身就该是复制，不用先找按钮。
              -->
              <div class="flex flex-wrap items-center gap-2">
                <button
                  :data-token="account.id"
                  class="group/token inline-flex items-center gap-1.5 rounded border border-border/50 bg-muted px-2 py-1 font-mono text-sm transition-colors hover:border-border hover:bg-muted/70 active:scale-[0.98]"
                  :title="`复制 ${account.verify_token}`"
                  @click="copyToken(account)"
                >
                  {{ account.verify_token }}
                  <Check v-if="copiedId === account.id" class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
                  <Copy v-else class="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover/token:text-foreground" />
                </button>
                <Button variant="ghost" size="sm" @click="renew(account)">
                  <RefreshCw class="mr-1 h-3 w-3" />
                  换一个
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div class="space-y-2">
          <p class="text-xs font-medium">添加账号</p>
          <div class="flex flex-wrap gap-2">
            <select
              v-model="newPlatform"
              class="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option v-for="key in PLATFORMS" :key="key" :value="key">
                {{ PLATFORM_META[key].label }}
              </option>
            </select>
            <Input
              v-model="newIdentifier"
              :placeholder="PLATFORM_META[newPlatform].idHint"
              class="h-10 flex-1 min-w-[160px] font-mono"
              @keyup.enter="add"
            />
            <Button :disabled="adding || !newIdentifier.trim()" @click="add">
              <Loader2 v-if="adding" class="mr-1 h-4 w-4 animate-spin" />
              <Plus v-else class="mr-1 h-4 w-4" />
              添加
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            同一平台可以绑多个（主号、小号）
          </p>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
