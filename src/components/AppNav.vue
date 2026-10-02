<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  Home,
  User,
  Activity,
  Compass,
  LogIn,
  BarChart3,
  CalendarCheck,
  ListChecks,
  Settings,
  BookOpen,
} from 'lucide-vue-next'
import { useAuth } from '../lib/auth'

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
const { user, isAdmin, ensureLoaded } = useAuth()

// 榜单现在由 /practice 承担（练习量 + Rating 两个维度），旧的
// /codeforces/rank 已删除，所以这里不再有可折叠的分组。
const navItems = [
  { title: '首页', route: '/', icon: Home },
  { title: '博客', route: '/blog', icon: BookOpen },
  { title: '导航', route: '/nav', icon: Compass },
  { title: '每日一题', route: '/daily', icon: CalendarCheck },
  { title: '练习数据', route: '/practice', icon: BarChart3 },
  { title: '题单', route: '/problems', icon: ListChecks },
  { title: '工作坊状态', route: '/status', icon: Activity },
  { title: 'CodeForces 资料', route: '/codeforces/profile', icon: User },
]

onMounted(() => {
  currentPath.value = window.location.pathname
  mounted.value = true
  // 侧边栏需要知道是否已登录，才能决定底部显示什么。
  ensureLoaded()
})

function isActive(route: string): boolean {
  return currentPath.value === route
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
    <nav class="flex h-full flex-col p-4">
      <div class="space-y-1">
        <a
          v-for="item in navItems"
          :key="item.route"
          :href="item.route"
          class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
          :class="isActive(item.route) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
        >
          <component :is="item.icon" class="h-4 w-4" />
          {{ item.title }}
        </a>
      </div>

      <!-- 账号入口。mt-auto 把它推到侧边栏底部，与导航项分开。 -->
      <div v-if="mounted" class="mt-auto space-y-1 pt-4">
        <a
          v-if="user && isAdmin"
          href="/admin"
          class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
          :class="isActive('/admin') ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
        >
          <Settings class="h-4 w-4 shrink-0" />
          管理
        </a>
        <a
          v-if="user"
          href="/me"
          class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
          :class="isActive('/me') ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
        >
          <User class="h-4 w-4 shrink-0" />
          <span class="truncate">{{ user.display_name }}</span>
        </a>
        <a
          v-else
          href="/login"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogIn class="h-4 w-4" />
          登录
        </a>
      </div>
    </nav>
  </aside>
</template>
