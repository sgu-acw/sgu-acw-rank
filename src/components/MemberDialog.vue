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
    Teleport 到 body：position:fixed 一旦某个祖先上有 transform / filter /
    backdrop-filter / will-change，就会被锚到那个祖先而不是视口——
    低排名行点开弹窗会跑到页面顶部看不见。挂到 body 下就免疫了。
  -->
  <Teleport to="body">
  <div
    class="fixed inset-0 z-50 overflow-y-auto bg-background/80 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    @click.self="emit('close')"
  >
    <!--
      滚动区（外层）和撑高器（min-h-full 的 flex 内层）必须分开：
      直接把 flex + overflow-y-auto 写在同一层时，子项被 items-stretch
      钉在视口高度，内容再高也长不出滚动区——Edge 里整个弹窗就滚不动。
      min-h-full 让包装层跟着内容长，滚动区自然有东西可滚。
    -->
    <div
      class="flex min-h-full w-full items-stretch justify-center sm:items-start sm:p-4 md:p-8"
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
  </div>
  </Teleport>
</template>
