<script setup lang="ts">
/**
 * 主题开关。
 *
 * 默认主题由 CSS 的 prefers-color-scheme 决定，这个开关只负责把用户的
 * 选择写进 localStorage 并挂上对应的类（见 globals.css 里的说明）。
 *
 * 两个类都挂：``.dark`` 让系统偏好是浅色时也能变深，``.light`` 让系统
 * 偏好是深色时也能变浅。同时挂的话后定义的 ``.light`` 会赢——但那只在
 * 两个类都在时才发生，而我们每次只挂一个。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { Sun, Moon } from 'lucide-vue-next'

const isDark = ref(false)

/**
 * 当前实际是不是深色。
 *
 * 不能只看类——用户没点过开关时类是不存在的，这时要看系统偏好。
 */
function detect(): boolean {
  const saved = localStorage.getItem('theme')
  if (saved === 'dark') return true
  if (saved === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function apply(dark: boolean) {
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.classList.toggle('light', !dark)
  // 地址栏颜色也要跟着走，否则深色页面上顶着一条白的。
  document
    .getElementById('theme-color')
    ?.setAttribute('content', dark ? '#111113' : '#ffffff')
}

function toggle() {
  isDark.value = !isDark.value
  apply(isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

/**
 * 系统偏好变化时跟随，但只在用户没手动选过的情况下。
 *
 * 存的是返回值而不是类型：``MediaQueryList`` 这个全局类型在本项目的
 * ESLint 配置下不被识别，用 ``ReturnType`` 推导就不用写它。
 */
let media: ReturnType<typeof window.matchMedia> | null = null

function onSystemChange(event: { matches: boolean }) {
  // 跟随系统，不写 localStorage——那会变成「选择」，之后就再也不跟随了。
  if (localStorage.getItem('theme')) return
  isDark.value = event.matches
}

onMounted(() => {
  isDark.value = detect()
  media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onSystemChange)
})

onUnmounted(() => {
  media?.removeEventListener('change', onSystemChange)
})
</script>

<template>
  <button
    type="button"
    :aria-label="isDark ? '切换为浅色主题' : '切换为深色主题'"
    class="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    @click="toggle"
  >
    <Sun v-if="isDark" class="h-5 w-5" />
    <Moon v-else class="h-5 w-5" />
  </button>
</template>
