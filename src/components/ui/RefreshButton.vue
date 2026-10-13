<script setup lang="ts">
/**
 * 管理页统一的「刷新」按钮。
 *
 * 样式和行为各页都一样：描边小按钮 + 旋转刷新图标 + 「刷新」文字。
 * 集中在一处，免得每页复制一套 class，改样式时漏掉一两个。
 */
import { RefreshCw } from 'lucide-vue-next'
import { Button } from './button'

withDefaults(
  defineProps<{
    /** 转圈动画的开关，通常绑 loading/busy。 */
    busy?: boolean
    disabled?: boolean
    label?: string
  }>(),
  { busy: false, disabled: false, label: '刷新' },
)

defineEmits<{ click: [] }>()
</script>

<template>
  <Button variant="outline" size="sm" :disabled="disabled || busy" @click="$emit('click')">
    <RefreshCw class="mr-1.5 h-3.5 w-3.5" :class="busy && 'animate-spin'" />
    {{ label }}
  </Button>
</template>
