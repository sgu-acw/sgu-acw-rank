<script setup lang="ts">
/**
 * 移动端主导航：把高频训练动作放在拇指区，低频信息收进「更多」。
 * 桌面端仍用分组侧栏；移动端不尝试缩小那套导航。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Compass,
  FileText,
  Home,
  ListChecks,
  LogIn,
  MoreHorizontal,
  Settings,
  Trophy,
  User,
  Terminal,
  SquareTerminal,
} from 'lucide-vue-next'
import { useAuth } from '../lib/auth'
import { LEARN_LOCAL } from '../lib/api'

const currentPath = ref('')
const moreOpen = ref(false)
const { user, isAdmin, canPost, ensureLoaded } = useAuth()

const tabs = [
  { title: '首页', route: '/', icon: Home },
  { title: '每日一题', route: '/daily', icon: CalendarCheck },
  { title: '题单', route: '/problems', icon: ListChecks },
  { title: '练习数据', route: '/practice', icon: BarChart3 },
]

const extraLinks = [
  ...(LEARN_LOCAL ? [
    { title: '题库', route: '/learn', icon: Terminal },
    { title: '云端 IDE', route: '/ide', icon: SquareTerminal },
  ] : []),
  { title: '集训', route: '/camps', icon: Trophy },
  { title: '荣誉殿堂', route: '/honors', icon: Award },
  { title: '工作坊状态', route: '/status', icon: Activity },
  { title: '线下赛报名', route: '/signups', icon: ClipboardList },
  { title: '博客', route: '/blog', icon: BookOpen },
  { title: '导航与资源', route: '/nav', icon: Compass },
  { title: 'Codeforces 资料', route: '/codeforces/profile', icon: User },
]

function syncPath() {
  currentPath.value = window.location.pathname
  moreOpen.value = false
}

function isActive(route: string): boolean {
  const path = currentPath.value
  if (route === '/') return path === '/'
  if (route === '/problems') {
    if (path.startsWith('/problems/admin') || path.startsWith('/problems/edit')) return false
    return path === '/problems' || path.startsWith('/problems/')
  }
  if (route === '/camps') {
    if (path.startsWith('/camps/admin')) return false
    return path === '/camps' || path.startsWith('/camps/') || path === '/camp' || path.startsWith('/camp/')
  }
  if (route === '/signups') {
    return path === '/signups' || path.startsWith('/signups/') || path === '/signup' || path.startsWith('/signup/')
  }
  if (route === '/blog') {
    return path === '/blog' || path.startsWith('/blog/') || path === '/post' || path.startsWith('/post/')
  }
  return path === route || path.startsWith(`${route}/`)
}

const isAdminRoute = () =>
  currentPath.value.startsWith('/admin') ||
  currentPath.value.startsWith('/problems/admin') ||
  currentPath.value.startsWith('/problems/edit') ||
  currentPath.value.startsWith('/camps/admin') ||
  currentPath.value.startsWith('/posts/admin') ||
  currentPath.value.startsWith('/editorials/admin')

const moreActive = () =>
  [
    '/learn',
    '/ide',
    '/honors',
    '/camps',
    '/status',
    '/signups',
    '/blog',
    '/nav',
    '/codeforces/profile',
    '/me',
    '/notifications',
  ].some((route) => isActive(route)) || isAdminRoute()

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') moreOpen.value = false
}

onMounted(() => {
  syncPath()
  void ensureLoaded()
  window.addEventListener('keydown', closeOnEscape)
  document.addEventListener('astro:page-load', syncPath)
})

onUnmounted(() => {
  window.removeEventListener('keydown', closeOnEscape)
  document.removeEventListener('astro:page-load', syncPath)
})
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
        class="absolute bottom-[calc(100%+0.65rem)] right-3 z-20 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-border/60 bg-popover p-2 shadow-xl shadow-black/10"
        role="menu"
        aria-label="更多页面"
      >
        <a
          v-if="user"
          href="/me"
          role="menuitem"
          :aria-current="isActive('/me') ? 'page' : undefined"
          class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-accent"
          :class="isActive('/me') ? 'bg-accent/70 text-foreground' : 'text-foreground'"
          @click="moreOpen = false"
        >
          <User class="h-4 w-4 shrink-0" />
          <span class="truncate">{{ user.display_name }}</span>
          <span class="ml-auto text-xs text-muted-foreground">个人中心</span>
        </a>
        <a
          v-else
          href="/login"
          role="menuitem"
          class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          @click="moreOpen = false"
        >
          <LogIn class="h-4 w-4 shrink-0" />
          登录 / 注册
        </a>
        <div class="my-1 border-t border-border/50" />
        <a
          v-for="link in extraLinks"
          :key="link.route"
          :href="link.route"
          role="menuitem"
          :aria-current="isActive(link.route) ? 'page' : undefined"
          class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-accent"
          :class="isActive(link.route) ? 'bg-accent/60 font-medium text-foreground' : 'text-muted-foreground'"
          @click="moreOpen = false"
        >
          <component :is="link.icon" class="h-4 w-4 shrink-0" />
          {{ link.title }}
        </a>
        <template v-if="user && isAdmin">
          <div class="my-1 border-t border-border/50" />
          <a
            href="/admin"
            role="menuitem"
            :aria-current="isAdminRoute() ? 'page' : undefined"
            class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-accent hover:text-foreground"
            :class="isAdminRoute() ? 'bg-accent/60 font-medium text-foreground' : 'text-muted-foreground'"
            @click="moreOpen = false"
          >
            <Settings class="h-4 w-4 shrink-0" />
            管理工作台
          </a>
          <a
            href="/notifications"
            role="menuitem"
            :aria-current="isActive('/notifications') ? 'page' : undefined"
            class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-accent hover:text-foreground"
            :class="isActive('/notifications') ? 'bg-accent/60 font-medium text-foreground' : 'text-muted-foreground'"
            @click="moreOpen = false"
          >
            <Bell class="h-4 w-4 shrink-0" />
            管理员站内信
          </a>
        </template>
        <template v-else-if="user && canPost">
          <div class="my-1 border-t border-border/50" />
          <a
            href="/posts/admin"
            role="menuitem"
            :aria-current="isActive('/posts/admin') ? 'page' : undefined"
            class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-accent hover:text-foreground"
            :class="isActive('/posts/admin') ? 'bg-accent/60 font-medium text-foreground' : 'text-muted-foreground'"
            @click="moreOpen = false"
          >
            <FileText class="h-4 w-4 shrink-0" />
            文章管理
          </a>
        </template>
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
