<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  Home, Medal, Code, Trophy, User, ChevronDown, ChevronRight, Menu, X, Activity, Compass,
} from 'lucide-vue-next'

const isOpen = ref(false)
const cfOpen = ref(false)
const isMobile = ref(false)

const navItems = [
  { title: '首页', route: '/', icon: Home },
  { title: '导航', route: '/nav', icon: Compass },
  { title: '工作坊状态', route: '/status', icon: Activity },
  // { title: '成员获奖', route: '/member-awards', icon: Medal }, // 页面已下线
]

const cfItems = [
  { title: '排名', route: '/codeforces/rank', icon: Trophy },
  { title: '排名（退役）', route: '/codeforces/rank-retired', icon: Trophy },
  { title: '个人资料', route: '/codeforces/profile', icon: User },
]

onMounted(() => {
  isMobile.value = window.innerWidth < 768
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < 768
    if (!isMobile.value) isOpen.value = true
  })
  if (!isMobile.value) isOpen.value = true

  // Listen for toggle event from header button
  window.addEventListener('toggle-nav', () => {
    isOpen.value = !isOpen.value
  })
})

function toggleNav() {
  isOpen.value = !isOpen.value
}

function isActive(route: string): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname === route
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
    class="fixed top-14 left-0 z-40 h-[calc(100vh-3.5rem)] w-64 border-r border-border/40 bg-background transition-transform duration-200"
    :class="isOpen ? 'translate-x-0' : '-translate-x-full'"
  >
    <nav class="p-4 space-y-1">
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
    </nav>
  </aside>
</template>
