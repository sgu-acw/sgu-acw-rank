<script setup lang="ts">
/** 代码截图按钮：把当前代码渲成 PNG，预览后可下载或复制到剪贴板。 */
import { ref } from 'vue'
import { Camera, Download, X, ClipboardCopy } from 'lucide-vue-next'
import { renderCodePng, canvasToBlob } from '../../lib/learning/screenshot'
import type { Environment } from '../../lib/learning/types'
import Button from '../ui/button/Button.vue'

const props = defineProps<{
  code: string
  environment: Environment
  disabled?: boolean
}>()

const open = ref(false), url = ref(''), blob = ref<Blob | null>(null), busy = ref(false), notice = ref('')

async function generate() {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try {
    const canvas = renderCodePng(props.code, props.environment, { dark: document.documentElement.classList.contains('dark') })
    const b = await canvasToBlob(canvas)
    if (!b) throw new Error('导出失败')
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = URL.createObjectURL(b)
    blob.value = b
    open.value = true
  } catch (e) { notice.value = e instanceof Error ? e.message : '导出失败' }
  finally { busy.value = false }
}

function close() {
  open.value = false
  if (url.value) { URL.revokeObjectURL(url.value); url.value = '' }
}

function download() {
  if (!url.value) return
  const a = document.createElement('a')
  a.href = url.value
  a.download = `code-${Date.now()}.png`
  a.click()
}

async function copy() {
  try {
    if (!blob.value) throw new Error('没有图片')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob.value })])
    notice.value = '已复制到剪贴板'
  } catch { notice.value = '复制图片失败，浏览器可能不支持' }
}
</script>

<template>
  <div class="relative">
    <button
      type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      :disabled="disabled || busy" aria-label="代码截图" title="把当前代码导成 PNG 图片" @click="generate"
    >
<Camera class="h-4 w-4" />
</button>
    <p v-if="notice" class="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border bg-popover p-2 text-xs shadow">{{ notice }}</p>
    <Teleport to="body">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="代码截图预览" @click.self="close">
        <div class="w-full max-w-3xl rounded-xl border bg-popover p-4 shadow-xl">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium">代码截图</p>
            <button type="button" class="min-h-8 min-w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="关闭" @click="close"><X class="mx-auto h-4 w-4" /></button>
          </div>
          <img v-if="url" :src="url" alt="代码截图" class="mt-3 max-h-[60vh] w-auto max-w-full rounded-lg border" />
          <div class="mt-4 flex gap-2">
            <Button @click="download"><Download class="mr-2 h-4 w-4" />下载 PNG</Button>
            <Button variant="outline" @click="copy"><ClipboardCopy class="mr-2 h-4 w-4" />复制图片</Button>
            <Button variant="outline" @click="close">关闭</Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
