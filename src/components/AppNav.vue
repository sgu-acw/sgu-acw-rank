<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  Home, Code, Trophy, User, ChevronDown, ChevronRight, Activity, Compass, LogIn, BarChart3, Settings,
} from 'lucide-vue-next'
import { useAuth } from '../lib/auth'

const isOpen = ref(false)
const cfOpen = ref(false)
const isMobile = ref(false)

// 当前路径。服务端渲染时为空，客户端挂载后填上。
//
// 导航项的高亮依赖它，而服务端并不知道访客在哪个页面，所以首帧一律不高亮，
// 挂载后再补上。若在服务端直接读 window.location，会因为拿不到而渲染成另一
// 套 class，客户端 hydration 时就会报不匹配。
const currentPath = ref('')

// 侧边栏底部的登录入口。未登录时显示「登录」，已登录时显示姓名并链到个人中心。
const { user, isAdmin, ensureLoaded } = useAuth()

const navItems = [
  { title: '首页', route: '/', icon: Home },
  { title: '导航', route: '/nav', icon: Compass },
  { title: '每日练习', route: '/practice', icon: BarChart3 },
  { title: '工作坊状态', route: '/status', icon: Activity },
]

const cfItems = [
  { title: '排名', route: '/codeforces/rank', icon: Trophy },
  { title: '排名（退役）', route: '/codeforces/rank-retired', icon: Trophy },
  { title: '个人资料', route: '/codeforces/profile', icon: User },
]

onMounted(() => {
  isMobile.value = window.innerWidth < 768
  currentPath.value = window.location.pathname
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < 768
    if (!isMobile.value) isOpen.value = true
  })
  if (!isMobile.value) isOpen.value = true

  // Listen for toggle event from header button
  window.addEventListener('toggle-nav', () => {
    isOpen.value = !isOpen.value
  })

  // 侧边栏需要知道是否已登录，才能决定底部显示什么。
  ensureLoaded()
})

function isActive(route: string): boolean {
  return currentPath.value === route
}

function onNavClick() {
  if (isMobile.value) isOpen.value = false
}
</script>

<template>
  <!-- Mobile overlay -->
  <div
    v-if="isOpen && isMobile"
    class="fixed inset-0 z-30 bg-black/50"
    @click="isOpen = false"
  />

  <!-- Sidebar -->
  <aside
    class="fixed top-14 left-0 z-40 flex h-[calc(100vh-3.5rem)] w-64 flex-col border-r border-border/40 bg-background transition-transform duration-200"
    :class="isOpen ? 'translate-x-0' : '-translate-x-full'"
  >
    <nav class="flex h-full flex-col p-4">
      <div class="space-y-1">
        <a
          v-for="item in navItems"
          :key="item.route"
          :href="item.route"
          @click="onNavClick"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          :class="isActive(item.route) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
        >
          <component :is="item.icon" class="h-4 w-4" />
          {{ item.title }}
        </a>

        <!-- CodeForces group -->
        <div>
          <button
            @click="cfOpen = !cfOpen"
            class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground"
          >
            <Code class="h-4 w-4" />
            CodeForces
            <ChevronDown v-if="cfOpen" class="ml-auto h-4 w-4" />
            <ChevronRight v-else class="ml-auto h-4 w-4" />
          </button>
          <div v-if="cfOpen" class="ml-4 space-y-1">
            <a
              v-for="item in cfItems"
              :key="item.route"
              :href="item.route"
              @click="onNavClick"
              class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              :class="isActive(item.route) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
            >
              <component :is="item.icon" class="h-4 w-4" />
              {{ item.title }}
            </a>
          </div>
        </div>
      </div>

      <!-- 账号入口。mt-auto 把它推到侧边栏底部，与导航项分开。 -->
      <div class="mt-auto space-y-1 pt-4">
        <a
          v-if="user && isAdmin"
          href="/admin"
          @click="onNavClick"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          :class="isActive('/admin') ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
        >
          <Settings class="h-4 w-4 shrink-0" />
          管理
        </a>
        <a
          v-if="user"
          href="/me"
          @click="onNavClick"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          :class="isActive('/me') ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
        >
          <User class="h-4 w-4 shrink-0" />
          <span class="truncate">{{ user.display_name }}</span>
        </a>
        <a
          v-else
          href="/login"
          @click="onNavClick"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogIn class="h-4 w-4" />
          登录
        </a>
      </div>
    </nav>
  </aside>
</template>
