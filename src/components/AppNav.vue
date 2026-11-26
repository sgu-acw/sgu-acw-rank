<script setup lang="ts">
import MemberName from './MemberName.vue'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import {
  Award,
  Bell,
  FileText,
  Home,
  User,
  Activity,
  Compass,
  LogIn,
  BarChart3,
  CalendarCheck,
  ClipboardList,
  ListChecks,
  Settings,
  BookOpen,
  Trophy,
  Terminal,
  SquareTerminal,
} from 'lucide-vue-next'
import { useAuth } from '../lib/auth'
import { LEARN_LOCAL } from '../lib/api'

// 当前路径。服务端渲染时为空，客户端挂载后填上。
//
// 导航项的高亮依赖它，而服务端并不知道访客在哪个页面，所以首帧一律不高亮，
// 挂载后再补上。若在服务端直接读 window.location，会因为拿不到而渲染成另一
// 套 class，客户端 hydration 时就会报不匹配。
const currentPath = ref('')

/*
 * 账号区（管理 / 姓名 / 登录）要等挂载后再渲染。
 *
 * 服务端不知道登录状态，只能渲染成「登录」；客户端一挂载就知道已登录，
 * 渲染成「管理 + 姓名」。两者不一致时 Vue 不会修正已有 DOM，只会警告。
 *
 * 所以让首帧两边都为空，挂载后再填。代价是这一小块会稍晚出现，
 * 但它本来就要等 /auth/session 返回，早显示也显示不出真东西。
 */
const mounted = ref(false)

// 侧边栏底部的登录入口。未登录时显示「登录」，已登录时显示姓名并链到个人中心。
const { user, isExternal, isCampusMember, isAdmin, canPost, ensureLoaded } = useAuth()

interface NavItem {
  title: string
  route: string
  icon: unknown
  campusOnly?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const rawNavGroups: NavGroup[] = [
  {
    label: '总览',
    items: [{ title: '首页', route: '/', icon: Home }],
  },
  {
    label: '训练',
    items: [
      { title: '每日一题', route: '/daily', icon: CalendarCheck },
      { title: '题单', route: '/problems', icon: ListChecks },
      // 题库与云端 IDE 只在题库功能开启时存在。
      ...(LEARN_LOCAL
        ? [
            { title: '题库', route: '/learn', icon: Terminal },
            { title: '云端 IDE', route: '/ide', icon: SquareTerminal },
          ]
        : []),
      { title: '练习数据', route: '/practice', icon: BarChart3, campusOnly: true },
      { title: '集训', route: '/camps', icon: Trophy, campusOnly: true },
    ],
  },
  {
    label: '工作坊',
    items: [
      { title: '荣誉殿堂', route: '/honors', icon: Award },
      { title: '工作坊状态', route: '/status', icon: Activity, campusOnly: true },
      { title: '线下赛报名', route: '/signups', icon: ClipboardList, campusOnly: true },
      { title: '博客', route: '/blog', icon: BookOpen },
      { title: '导航与资源', route: '/nav', icon: Compass },
      { title: 'Codeforces 资料', route: '/codeforces/profile', icon: User },
    ],
  },
]

// 仅在客户端挂载且确认是校内成员后展示校内专属入口。
// 必须同时依赖 mounted：ClientRouter 切换页面时 useAuth() 单例里可能已有登录态，
// 而新页面的静态 HTML 仍是不含校内项的 SSR 产物；若 hydration 首帧就渲染校内项，
// Vue 会按索引复用已有 <a> 节点且不修补 href，导致第二次点击跳到错位链接。
const showCampus = computed(() => mounted.value && isCampusMember.value)

const navGroups = computed(() =>
  rawNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.campusOnly || showCampus.value),
    }))
    .filter((group) => group.items.length > 0),
)

function syncPath() {
  currentPath.value = window.location.pathname
}

onMounted(() => {
  syncPath()
  mounted.value = true
  // 侧边栏需要知道是否已登录，才能决定底部显示什么。
  void ensureLoaded()
  // ClientRouter 持久化侧边栏时组件不会重新挂载；路径必须跟着导航事件更新。
  document.addEventListener('astro:after-swap', syncPath)
  document.addEventListener('astro:page-load', syncPath)
})

onUnmounted(() => {
  document.removeEventListener('astro:after-swap', syncPath)
  document.removeEventListener('astro:page-load', syncPath)
})

function isAdminRoute(): boolean {
  return currentPath.value.startsWith('/admin') || currentPath.value.startsWith('/problems/admin') || currentPath.value.startsWith('/problems/edit') || currentPath.value.startsWith('/camps/admin') || currentPath.value.startsWith('/posts/admin') || currentPath.value.startsWith('/editorials/admin')
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

</script>

<template>
  <!--
    桌面侧边栏。移动端整块隐藏——那边用底部标签栏（MobileTabBar），
    侧边栏那种抽屉式导航在手机上要多点一下，拇指也够不到左上角。
  -->
  <aside
    class="fixed left-0 top-14 z-40 hidden w-64 flex-col border-r border-border/50 bg-sidebar md:flex"
    style="height: calc(100vh - 3.5rem)"
  >
    <nav class="flex h-full flex-col overflow-y-auto px-3 py-5">
      <div class="space-y-6">
        <section v-for="group in navGroups" :key="group.label" class="space-y-1">
          <p class="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/55">
            {{ group.label }}
          </p>
          <a
            v-for="item in group.items"
            :key="item.route"
            :href="item.route"
            :aria-current="isActive(item.route) ? 'page' : undefined"
            class="group flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
            :class="isActive(item.route) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'"
          >
            <component :is="item.icon" class="h-4 w-4 shrink-0 transition-colors" :class="isActive(item.route) ? 'text-foreground' : 'text-muted-foreground/80 group-hover:text-foreground'" />
            <span class="truncate">{{ item.title }}</span>
            <span v-if="isActive(item.route)" class="ml-auto h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          </a>
        </section>
      </div>

      <!-- 管理入口只保留在侧栏，不再在个人中心重复放一个入口。 -->
      <div v-if="mounted" class="mt-auto space-y-1 border-t border-border/40 pt-4">
        <a
          v-if="user && isAdmin"
          href="/admin"
          :aria-current="isAdminRoute() ? 'page' : undefined"
          class="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
          :class="isAdminRoute() ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'"
        >
          <Settings class="h-4 w-4 shrink-0" />
          管理工作台
        </a>
        <a
          v-if="user && isAdmin"
          href="/notifications"
          :aria-current="isActive('/notifications') ? 'page' : undefined"
          class="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
          :class="isActive('/notifications') ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'"
        >
          <Bell class="h-4 w-4 shrink-0" />
          管理员站内信
        </a>
        <a
          v-else-if="user && canPost"
          href="/posts/admin"
          :aria-current="isActive('/posts/admin') ? 'page' : undefined"
          class="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
          :class="isActive('/posts/admin') ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'"
        >
          <FileText class="h-4 w-4 shrink-0" />
          文章管理
        </a>
        <a
          v-if="user"
          href="/me"
          :aria-current="isActive('/me') ? 'page' : undefined"
          class="flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
          :class="isActive('/me') ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'"
        >
          <User class="h-4 w-4 shrink-0" />
          <span class="truncate"><MemberName :name="user.display_name" :signature="user.signature" /></span>
          <span
            v-if="isExternal"
            class="ml-auto shrink-0 rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            校外
          </span>
        </a>
        <a
          v-else
          href="/login"
          class="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
        >
          <LogIn class="h-4 w-4" />
          登录 / 注册
        </a>
      </div>
    </nav>
  </aside>
</template>
