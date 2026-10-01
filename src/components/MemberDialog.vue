<script setup lang="ts">
/**
 * 成员资料弹窗。
 *
 * 练习榜里点名字时弹出来，不必离开当前页——榜单是拿来横向比较的，跳走再
 * 回来会丢掉滚动位置和筛选状态。
 *
 * 内容与 `/member?id=N` 页面共用 MemberProfileBody。榜单里已经有这个人的
 * 那一行数据了，直接传进去，Body 就不用再拉一遍整个榜单。
 */
import { onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import MemberProfileBody from './MemberProfileBody.vue'
import type { PracticeEntry } from '../lib/api'

const props = defineProps<{ entry: PracticeEntry }>()
const emit = defineEmits<{ close: [] }>()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  // 弹窗打开时禁掉背景滚动，否则滑到底会带动后面的榜单。
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <!-- 遮罩。点空白处关闭，这是弹窗的常规预期。 -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm md:p-8"
    role="dialog"
    aria-modal="true"
    @click.self="emit('close')"
  >
    <div class="relative w-full max-w-2xl rounded-lg border border-border/60 bg-background p-5 shadow-lg">
      <button
        class="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="关闭（Esc）"
        @click="emit('close')"
      >
        <X class="h-4 w-4" />
      </button>

      <MemberProfileBody :user-id="props.entry.user_id" :entry="props.entry" />
    </div>
  </div>
</template>
