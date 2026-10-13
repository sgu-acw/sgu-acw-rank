<script setup lang="ts">
/**
 * 通知引导条。
 *
 * 浏览器通知必须用户授权——直接 requestPermission() 一上来就弹系统框，
 * 大多数人点「拒绝」就再也看不到了。所以先用一条自己的横幅说明用途，
 * 点「开启」才调系统授权（有用户手势，通过率高）。
 *
 * 只在「支持推送 + 已登录 + 未授权未订阅」时出现；拒绝过或已订阅都不再
 * 打扰。本地记一次「暂时不看」，下次来也不会立刻又弹。
 */
import { onMounted, ref } from 'vue'
import { Bell, X } from 'lucide-vue-next'
import { useAuth } from '../lib/auth'
import { isSubscribed, pushPermission, pushSupported, subscribe } from '../lib/push'

const DISMISS_KEY = 'push-optin-dismissed'
const visible = ref(false)
const busy = ref(false)
const state = ref<'idle' | 'ok' | 'fail'>('idle')
const failReason = ref('')

const { user, ready, ensureLoaded } = useAuth()

function dismiss() {
  visible.value = false
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // 存储不可用就算了，下回来再显示一次。
  }
}

async function enable() {
  busy.value = true
  try {
    const r = await subscribe()
    state.value = r.ok ? 'ok' : 'fail'
    failReason.value = r.reason ?? ''
    if (r.ok) window.setTimeout(() => (visible.value = false), 1500)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  if (!pushSupported()) return
  await ensureLoaded()
  if (!ready.value || !user.value) return
  if (pushPermission() === 'denied') return
  try {
    if (localStorage.getItem(DISMISS_KEY)) return
  } catch {
    // ignore
  }
  if (await isSubscribed()) return
  visible.value = true
})
</script>

<template>
  <Transition name="optin">
    <div
      v-if="visible"
      class="fixed inset-x-0 bottom-20 z-40 mx-4 flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3.5 shadow-lg md:bottom-6 md:left-auto md:right-6 md:w-80"
      role="region"
      aria-label="开启通知"
    >
      <Bell class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">开启通知</p>
        <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          集训报名、公告、过题提醒会直接发到这台设备，页面关了也能收到。
        </p>
        <p v-if="state === 'fail' && failReason" class="mt-1.5 text-xs text-destructive">
          {{ failReason }}
        </p>
        <div class="mt-2.5 flex items-center gap-2">
          <button
            class="min-h-9 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
            :disabled="busy || state === 'ok'"
            @click="enable"
          >
            {{ state === 'ok' ? '已开启' : busy ? '开启中…' : '开启通知' }}
          </button>
          <button class="min-h-9 px-2 text-xs text-muted-foreground hover:text-foreground" @click="dismiss">
            以后再说
          </button>
        </div>
      </div>
      <button class="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="关闭" @click="dismiss">
        <X class="h-4 w-4" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.optin-enter-active,
.optin-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.optin-enter-from,
.optin-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
