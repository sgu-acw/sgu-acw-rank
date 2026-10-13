<script setup lang="ts">
/**
 * 账号页的通知开关。
 *
 * 与开屏引导条是两套入口：引导条负责「第一次」转化，这里负责之后的
 * 查看和开关。状态来自浏览器真实订阅（isSubscribed），不是猜。
 */
import { onMounted, ref } from 'vue'
import { BellOff, BellRing, Loader2 } from 'lucide-vue-next'
import { isSubscribed, pushPermission, pushSupported, subscribe, unsubscribe } from '../lib/push'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

type PushPermission = 'granted' | 'denied' | 'default' | 'unsupported'

const supported = ref(true)
const subscribed = ref(false)
const permission = ref<PushPermission>('unsupported')
const busy = ref(false)
const error = ref('')

async function check() {
  supported.value = pushSupported()
  permission.value = pushPermission()
  subscribed.value = await isSubscribed()
}

async function toggle() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (subscribed.value) {
      await unsubscribe()
      subscribed.value = false
    } else {
      const r = await subscribe()
      if (r.ok) {
        subscribed.value = true
      } else {
        error.value = r.reason ?? '开启失败'
      }
    }
  } finally {
    busy.value = false
    await check()
  }
}

onMounted(check)
</script>

<template>
  <Card>
    <CardHeader><CardTitle class="text-sm">通知</CardTitle></CardHeader>
    <CardContent class="space-y-3">
      <p v-if="!supported" class="text-sm text-muted-foreground">
        当前浏览器不支持网页推送。
      </p>
      <template v-else>
        <p class="text-sm text-muted-foreground">
          {{ subscribed ? '这台设备会收到公告和通知。' : '开启后，公告和通知会直接发到这台设备。' }}
        </p>
        <p v-if="permission === 'denied'" class="text-xs text-amber-700 dark:text-amber-400">
          通知被浏览器拒绝了——去浏览器设置里把这个站点的通知权限打开再回来开。
        </p>
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        <Button
          variant="outline"
          size="sm"
          :disabled="busy || permission === 'denied'"
          @click="toggle"
        >
          <Loader2 v-if="busy" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
          <component :is="subscribed ? BellOff : BellRing" v-else class="mr-1.5 h-3.5 w-3.5" />
          {{ subscribed ? '关闭这台设备的通知' : '开启通知' }}
        </Button>
      </template>
    </CardContent>
  </Card>
</template>
