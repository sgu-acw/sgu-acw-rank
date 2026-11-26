<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'
import { Loader2 } from 'lucide-vue-next'
import ActionNotice from './ui/ActionNotice.vue'

const video = ref<HTMLVideoElement | null>(null)
const starting = ref(true)
const error = ref('')
let controls: IScannerControls | undefined
let stream: MediaStream | undefined
let stopped = false

function stopCamera() {
  stopped = true
  controls?.stop()
  stream?.getTracks().forEach((track) => track.stop())
}

function readLoginToken(text: string) {
  try {
    const url = new URL(text)
    const token = url.searchParams.get('token')
    if (url.origin === window.location.origin &&
        url.pathname.replace(/\/$/, '') === '/qr-login' &&
        token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      return token
    }
  } catch {
    return null
  }
  return null
}

onMounted(async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    starting.value = false
    error.value = '当前浏览器无法访问摄像头，请使用手机系统相机扫码'
    return
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    })
    if (stopped) {
      stopCamera()
      return
    }

    const reader = new BrowserQRCodeReader()
    controls = await reader.decodeFromStream(
      stream,
      video.value,
      (result, _error, scannerControls) => {
        if (!result || stopped) return
        const token = readLoginToken(result.getText())
        if (!token) {
          error.value = '这不是工作坊电脑登录二维码，请对准登录页上的二维码'
          return
        }
        controls = scannerControls
        stopCamera()
        window.location.assign(`/qr-login?token=${token}`)
      },
    )
    if (stopped) stopCamera()
  } catch (cause) {
    if (stopped) return
    stopCamera()
    const name = cause instanceof DOMException ? cause.name : ''
    error.value = name === 'NotAllowedError'
      ? '请在浏览器设置中允许摄像头访问，再重试'
      : name === 'NotFoundError'
        ? '没有找到可用摄像头'
        : '无法启动摄像头，请确认页面使用 HTTPS 并允许摄像头访问'
  } finally {
    starting.value = false
  }
})

onBeforeUnmount(stopCamera)
</script>

<template>
  <div class="space-y-3">
    <video
      ref="video"
      class="aspect-square max-h-[48dvh] w-full rounded-md bg-black object-contain"
      autoplay
      muted
      playsinline
      aria-label="摄像头扫码画面"
    />
    <div v-if="starting" class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 class="h-4 w-4 animate-spin" />正在启动摄像头
    </div>
    <ActionNotice v-else-if="error" :message="error" variant="error" />
    <p v-else class="text-sm text-muted-foreground">将摄像头对准电脑登录页上的二维码</p>
  </div>
</template>
