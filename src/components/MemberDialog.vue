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
  <!--
    遮罩。点空白处关闭，这是弹窗的常规预期。

    窄屏下改成贴底的整屏面板：留 16px 边距在手机上很浪费，而且顶部的关闭
    按钮会跟系统状态栏打架。所以移动端铺满，桌面端才居中留白。
  -->
  <div
    class="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-background/80 backdrop-blur-sm sm:items-start sm:p-4 md:p-8"
    role="dialog"
    aria-modal="true"
    @click.self="emit('close')"
  >
    <div
      class="relative w-full rounded-none border-border/60 bg-background p-4 shadow-lg sm:max-w-2xl sm:rounded-lg sm:border sm:p-5"
      style="padding-bottom: calc(1rem + env(safe-area-inset-bottom))"
    >
      <!--
        关闭按钮。移动端固定在右上角并加大到 40px，方便拇指点。
      -->
      <button
        class="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 sm:right-3 sm:top-3 sm:h-8 sm:w-8"
        title="关闭（Esc）"
        aria-label="关闭"
        @click="emit('close')"
      >
        <X class="h-4 w-4" />
      </button>

      <MemberProfileBody :user-id="props.entry.user_id" :entry="props.entry" />
    </div>
  </div>
</template>
