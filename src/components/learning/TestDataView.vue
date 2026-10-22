<script setup lang="ts">
import { ref } from 'vue'
import { Check, Copy } from 'lucide-vue-next'
import IconButton from '../ui/IconButton.vue'
import ActionNotice from '../ui/ActionNotice.vue'
import { clipText } from '../../lib/learning/workspace'
const props = defineProps<{ text: string; label: string }>()
const copied = ref(false), error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  try {
    await navigator.clipboard.writeText(props.text); copied.value = true; error.value = ''
    clearTimeout(timer); timer = setTimeout(() => { copied.value = false }, 1600)
  } catch { error.value = '复制失败，请选中文字复制。' }
}
</script>
<template>
  <div class="min-w-0">
    <div class="flex min-h-11 items-center justify-between gap-2"><span class="text-xs font-medium text-muted-foreground">{{ label }}</span><IconButton :label="copied ? '已复制' : `复制${label}`" @click="copy"><Check v-if="copied" class="h-3.5 w-3.5 text-emerald-500" /><Copy v-else class="h-3.5 w-3.5" /></IconButton></div>
    <pre class="test-data">{{ clipText(text) || '（空）' }}</pre>
    <ActionNotice :message="error" variant="error" />
  </div>
</template>
