<script setup lang="ts">
/**
 * 移动端底部标签栏。
 *
 * 桌面端是左侧边栏，但把侧边栏搬到手机上不对：拇指够不到屏幕左上角，
 * 而且抽屉要先点一下才展开，多一步操作。底部标签栏是手机上的惯例，
 * 单手就能碰到。
 *
 * 只放五个最常用的入口。导航、CodeForces 资料、管理这些次要的收进
 * 「我的」页面，不占标签位。
 *
 * 桌面端（md 以上）整个隐藏，那边有侧边栏。
 */
import { ref, onMounted } from 'vue'
import { Home, BarChart3, Activity, BookOpen, User } from 'lucide-vue-next'

const currentPath = ref('')

const tabs = [
  { title: '首页', route: '/', icon: Home },
  { title: '练习', route: '/practice', icon: BarChart3 },
  { title: '状态', route: '/status', icon: Activity },
  { title: '博客', route: '/blog', icon: BookOpen },
]

onMounted(() => {
  currentPath.value = window.location.pathname
})

/** 标签是否处于选中态。子页面也算选中，例如 /blog/xxx 要高亮「博客」。 */
function isActive(route: string): boolean {
  if (route === '/') return currentPath.value === '/'
  return currentPath.value === route || currentPath.value.startsWith(route + '/')
}
</script>

<template>
  <!--
    固定在底部。md 以上隐藏，桌面用侧边栏。
    bg-sidebar 与侧边栏同色，视觉上是一套东西。
  -->
  <nav
    class="fixed inset-x-0 bottom-0 z-40 flex border-t border-border/50 bg-sidebar/95 backdrop-blur-md md:hidden"
    style="padding-bottom: env(safe-area-inset-bottom)"
    aria-label="主导航"
  >
    <a
      v-for="tab in tabs"
      :key="tab.route"
      :href="tab.route"
      class="relative flex flex-1 flex-col items-center gap-1 py-2 transition-colors active:scale-95"
      :class="isActive(tab.route) ? 'text-foreground' : 'text-muted-foreground'"
    >
      <component :is="tab.icon" class="h-5 w-5" :stroke-width="isActive(tab.route) ? 2.2 : 1.8" />
      <span class="text-[10px] font-medium leading-none">{{ tab.title }}</span>
    </a>

    <!--
      「我的」始终指向 /me。该页自己处理未登录的情况（提示去登录），
      标签栏不必知道登录状态——一旦依赖它，服务端就渲染不出正确结果，
      hydration 会对不上。
    -->
    <a
      href="/me"
      class="relative flex flex-1 flex-col items-center gap-1 py-2 transition-colors active:scale-95"
      :class="isActive('/me') ? 'text-foreground' : 'text-muted-foreground'"
    >
      <User class="h-5 w-5" :stroke-width="isActive('/me') ? 2.2 : 1.8" />
      <span class="text-[10px] font-medium leading-none">我的</span>
    </a>
  </nav>
</template>
