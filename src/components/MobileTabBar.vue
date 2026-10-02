<script setup lang="ts">
/**
 * 移动端主导航：把高频训练动作放在拇指区，低频信息收进「更多」。
 * 桌面端仍用分组侧栏；移动端不尝试缩小那套导航。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarCheck,
  Compass,
  Home,
  ListChecks,
  MoreHorizontal,
  Settings,
  User,
} from 'lucide-vue-next'
import { useAuth } from '../lib/auth'

const currentPath = ref('')
const moreOpen = ref(false)
const { user, isAdmin, ensureLoaded } = useAuth()

const tabs = [
  { title: '首页', route: '/', icon: Home },
  { title: '每日一题', route: '/daily', icon: CalendarCheck },
  { title: '题单', route: '/problems', icon: ListChecks },
  { title: '练习数据', route: '/practice', icon: BarChart3 },
]

const extraLinks = [
  { title: '工作坊状态', route: '/status', icon: Activity },
  { title: '博客', route: '/blog', icon: BookOpen },
  { title: '导航与资源', route: '/nav', icon: Compass },
  { title: 'Codeforces 资料', route: '/codeforces/profile', icon: User },
]

function isActive(route: string): boolean {
  if (route === '/') return currentPath.value === '/'
  if (route === '/problems' && currentPath.value.startsWith('/problems/admin')) return false
  return currentPath.value === route || currentPath.value.startsWith(`${route}/`)
}

const isAdminRoute = () =>
  currentPath.value.startsWith('/admin') ||
  currentPath.value.startsWith('/problems/admin') ||
  currentPath.value.startsWith('/problems/edit')

const moreActive = () =>
  ['/status', '/blog', '/nav', '/codeforces/profile', '/me'].some((route) =>
    isActive(route),
  ) || isAdminRoute()

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') moreOpen.value = false
}

onMounted(() => {
  currentPath.value = window.location.pathname
  void ensureLoaded()
  window.addEventListener('keydown', closeOnEscape)
})

onUnmounted(() => window.removeEventListener('keydown', closeOnEscape))
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-40 md:hidden">
    <button
      v-if="moreOpen"
      type="button"
      aria-label="关闭更多导航"
      class="fixed inset-0 z-0 bg-background/20"
      @click="moreOpen = false"
    />

    <nav
      class="relative z-10 flex border-t border-border/50 bg-sidebar/95 shadow-[0_-8px_24px_-20px_hsl(var(--foreground)/0.2)] backdrop-blur-md"
      style="padding-bottom: env(safe-area-inset-bottom)"
      aria-label="主导航"
    >
      <a
        v-for="tab in tabs"
        :key="tab.route"
        :href="tab.route"
        :aria-current="isActive(tab.route) ? 'page' : undefined"
        class="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-1.5 transition-colors duration-150 active:scale-[0.98]"
        :class="isActive(tab.route) ? 'text-foreground' : 'text-muted-foreground'"
      >
        <span v-if="isActive(tab.route)" class="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-primary" aria-hidden="true" />
        <component :is="tab.icon" class="h-5 w-5" :stroke-width="isActive(tab.route) ? 2.2 : 1.8" />
        <span class="text-[10px] font-medium leading-none">{{ tab.title }}</span>
      </a>

      <button
        type="button"
        :aria-expanded="moreOpen"
        aria-haspopup="true"
        class="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-1.5 transition-colors duration-150 active:scale-[0.98]"
        :class="moreActive() || moreOpen ? 'text-foreground' : 'text-muted-foreground'"
        @click="moreOpen = !moreOpen"
      >
        <span v-if="moreActive() || moreOpen" class="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-primary" aria-hidden="true" />
        <MoreHorizontal class="h-5 w-5" :stroke-width="moreOpen ? 2.2 : 1.8" />
        <span class="text-[10px] font-medium leading-none">更多</span>
      </button>
    </nav>

    <Transition name="mobile-menu">
      <div
        v-if="moreOpen"
        class="absolute bottom-[calc(100%+0.65rem)] right-3 z-20 w-64 rounded-xl border border-border/60 bg-popover p-2 shadow-xl shadow-black/10"
        role="menu"
        aria-label="更多页面"
      >
        <a
          href="/me"
          role="menuitem"
          :aria-current="isActive('/me') ? 'page' : undefined"
          class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-accent"
          :class="isActive('/me') ? 'text-foreground' : 'text-muted-foreground'"
          @click="moreOpen = false"
        >
          <User class="h-4 w-4" />
          我的
        </a>
        <div class="my-1 border-t border-border/50" />
        <a
          v-for="link in extraLinks"
          :key="link.route"
          :href="link.route"
          role="menuitem"
          :aria-current="isActive(link.route) ? 'page' : undefined"
          class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-accent"
          :class="isActive(link.route) ? 'text-foreground' : 'text-muted-foreground'"
          @click="moreOpen = false"
        >
          <component :is="link.icon" class="h-4 w-4" />
          {{ link.title }}
        </a>
        <a
          v-if="user && isAdmin"
          href="/admin"
          role="menuitem"
          :aria-current="isAdminRoute() ? 'page' : undefined"
          class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          @click="moreOpen = false"
        >
          <Settings class="h-4 w-4" />
          管理工作台
        </a>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.mobile-menu-enter-active,
.mobile-menu-leave-active {
  transition: opacity 140ms ease-out, transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
}

.mobile-menu-enter-from,
.mobile-menu-leave-to {
  opacity: 0;
  transform: translateY(5px) scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .mobile-menu-enter-active,
  .mobile-menu-leave-active {
    transition: none;
  }
}
</style>
