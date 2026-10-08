<script setup lang="ts">
/**
 * 公告弹窗。挂在 BaseLayout，全站生效。
 *
 * 「确认过就不显示」记 localStorage，键是 ``{文章 id}:{内容版本}``。
 * 版本是 updated_at 的毫秒时间戳——管理员改了内容版本变，确认过旧版
 * 的人会再看到一次。发新公告也是同理（id 变了）。
 */
import { computed, onMounted, ref } from 'vue'
import { Megaphone, X } from 'lucide-vue-next'
import { postApi, type PopupInfo } from '../lib/api'
import { renderMarkdown } from '../lib/markdown'

const STORAGE_KEY = 'sgu-popup-seen'

const popup = ref<PopupInfo | null>(null)
const visible = ref(false)

const html = computed(() => (popup.value ? renderMarkdown(popup.value.body) : ''))

function dismiss() {
  if (popup.value) {
    try {
      localStorage.setItem(STORAGE_KEY, `${popup.value.id}:${popup.value.version}`)
    } catch {
      // 隐私模式下 localStorage 可能写不进。写不进就算了，下次还会弹。
    }
  }
  visible.value = false
}

function onEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) dismiss()
}

onMounted(async () => {
  try {
    const info = await postApi.popup()
    if (!info) return
    const seen = localStorage.getItem(STORAGE_KEY)
    if (seen === `${info.id}:${info.version}`) return
    popup.value = info
    visible.value = true
    window.addEventListener('keydown', onEscape)
  } catch {
    // 公告拉不到不该挡用户看页面。静默失败。
  }
})
</script>

<template>
  <!--
    遮罩。点空白或 Esc 都算「确认」——公告不是需要逐条念的协议，
    看到了就算确认。
  -->
  <div
    v-if="visible"
    class="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label="公告"
    @click.self="dismiss"
  >
    <div
      class="relative w-full max-w-lg rounded-lg border border-border/60 bg-background p-5"
      style="max-height: calc(100vh - 4rem)"
    >
      <button
        class="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="关闭"
        aria-label="关闭"
        @click="dismiss"
      >
        <X class="h-4 w-4" />
      </button>

      <div class="mb-3 flex items-center gap-2 pr-8">
        <Megaphone class="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
        <h2 class="text-base font-semibold tracking-tight">{{ popup?.title }}</h2>
      </div>

      <!--
        v-html 渲染的是管理员写的 markdown，可信源——和题解同一个渲染器，
        html:false 不开裸 HTML 口子。
      -->
      <!-- eslint-disable vue/no-v-html -->
      <div
        class="prose max-h-[60vh] max-w-none overflow-y-auto text-sm dark:prose-invert"
        v-html="html"
      />
      <!-- eslint-enable vue/no-v-html -->

      <div class="mt-4 flex items-center justify-end gap-2">
        <a
          :href="`/post/${encodeURIComponent(popup?.slug ?? '')}`"
          class="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          在博客里查看
        </a>
        <button
          class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          @click="dismiss"
        >
          知道了
        </button>
      </div>
    </div>
  </div>
</template>
