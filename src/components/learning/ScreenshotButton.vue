<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { Camera, Download, ClipboardCopy } from 'lucide-vue-next'
import { renderCodePng, canvasToBlob } from '../../lib/learning/screenshot'
import type { Environment } from '../../lib/learning/types'
import Button from '../ui/button/Button.vue'
import IconButton from '../ui/IconButton.vue'
import ActionNotice from '../ui/ActionNotice.vue'
import WorkspaceDialog from './WorkspaceDialog.vue'
const props = defineProps<{ code: string; environment: Environment; disabled?: boolean }>()
const open = ref(false), url = ref(''), blob = ref<Blob | null>(null), busy = ref(false), copying = ref(false), notice = ref(''), error = ref('')
async function generate() {
  if (busy.value || props.disabled) return
  busy.value = true; notice.value = ''; error.value = ''
  try {
    const canvas = renderCodePng(props.code, props.environment, { dark: document.documentElement.classList.contains('dark') })
    const b = await canvasToBlob(canvas)
    if (!b) throw new Error('导出失败')
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = URL.createObjectURL(b); blob.value = b; open.value = true
  } catch (e) { error.value = e instanceof Error ? e.message : '导出失败'; open.value = true }
  finally { busy.value = false }
}
function download() { if (url.value) { const a = document.createElement('a'); a.href = url.value; a.download = 'code.png'; a.click() } }
async function copy() {
  if (!blob.value || copying.value) return
  copying.value = true
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob.value })]); notice.value = '图片已复制。' }
  catch { error.value = '复制图片失败，请下载 PNG。' }
  finally { copying.value = false }
}
onUnmounted(() => { if (url.value) URL.revokeObjectURL(url.value) })
</script>
<template>
  <IconButton :disabled="disabled || busy" label="代码截图" @click="generate"><Camera class="h-4 w-4" /></IconButton>
  <WorkspaceDialog v-model:open="open" title="代码截图" description="">
    <ActionNotice :message="notice" variant="success" /><ActionNotice :message="error" variant="error" />
    <div class="max-h-[50dvh] overflow-auto"><img v-if="url" :src="url" alt="代码截图" class="mx-auto h-auto max-w-full rounded-lg" /></div>
    <div class="mt-4 flex flex-wrap gap-2"><Button :disabled="!url" @click="download"><Download class="mr-2 h-4 w-4" />下载 PNG</Button><Button variant="outline" :disabled="!blob || copying" @click="copy"><ClipboardCopy class="mr-2 h-4 w-4" />{{ copying ? '复制中…' : '复制图片' }}</Button></div>
  </WorkspaceDialog>
</template>
