<script setup lang="ts">
/**
 * 全局快速跳转面板（⌘K / Ctrl+K）。
 *
 * 把所有页面、账号入口与当前角色可用的管理工作台收进一个轻量搜索框，
 * 键盘和触控都可用，支持中文、拼音首字母或英文别名筛选。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
  Search,
  Settings,
  SquareTerminal,
  Terminal,
  Trophy,
  User,
  Users,
} from 'lucide-vue-next'
import { LEARN_LOCAL } from '../lib/api'
import { useAuth } from '../lib/auth'

interface JumpItem {
  title: string
  route: string
  group: string
  keywords: string
  icon: unknown
}

const { user, isCampusMember, isAdmin, canPost, ensureLoaded } = useAuth()

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const isMac = ref(false)

const items = computed<JumpItem[]>(() => {
  const list: JumpItem[] = [
    { title: '首页', route: '/', group: '总览', keywords: 'home index dashboard shouye', icon: Home },
    { title: '每日一题', route: '/daily', group: '训练', keywords: 'daily meiri checkin editorial', icon: CalendarCheck },
    { title: '题单', route: '/problems', group: '训练', keywords: 'problems list tidan', icon: ListChecks },
    ...(LEARN_LOCAL
      ? [
          { title: '题库', route: '/learn', group: '训练', keywords: 'learn oj tiku', icon: Terminal },
          { title: '云端 IDE', route: '/ide', group: '训练', keywords: 'ide code editor yun', icon: SquareTerminal },
        ]
      : []),
    ...(isCampusMember.value
      ? [
          { title: '练习数据', route: '/practice', group: '训练', keywords: 'practice rank rating lianxi', icon: BarChart3 },
          { title: '集训', route: '/camps', group: '训练', keywords: 'camps training jixun', icon: Trophy },
        ]
      : []),
    { title: '荣誉殿堂', route: '/honors', group: '工作坊', keywords: 'honors awards rongyu icpc ccpc', icon: Award },
    ...(isCampusMember.value
      ? [
          { title: '工作坊状态', route: '/status', group: '工作坊', keywords: 'status workshop heartbeat zhuangtai', icon: Activity },
          { title: '线下赛报名', route: '/signups', group: '工作坊', keywords: 'signups register baoming', icon: ClipboardList },
        ]
      : []),
    { title: '博客', route: '/blog', group: '工作坊', keywords: 'blog posts articles boke', icon: BookOpen },
    { title: '导航与资源', route: '/nav', group: '工作坊', keywords: 'nav links resources daohang', icon: Compass },
    { title: 'Codeforces 资料', route: '/codeforces/profile', group: '工作坊', keywords: 'codeforces cf profile', icon: User },
  ]

  if (user.value) {
    list.push({
      title: '个人中心与账号安全',
      route: '/me',
      group: '我的',
      keywords: 'me profile account totp passkey session geren',
      icon: User,
    })
  } else {
    list.push({
      title: '登录',
      route: '/login',
      group: '账号',
      keywords: 'login signin denglu',
      icon: LogIn,
    })
  }

  if (isAdmin.value) {
    list.push(
      { title: '成员与邀请码管理', route: '/admin', group: '管理工作台', keywords: 'admin users invites chengyuan', icon: Users },
      { title: '题单管理', route: '/problems/admin', group: '管理工作台', keywords: 'admin problems tidan', icon: ListChecks },
      ...(LEARN_LOCAL
        ? [{ title: '题库管理', route: '/admin/learn', group: '管理工作台', keywords: 'admin learn tiku', icon: Terminal }]
        : []),
      { title: '题解管理', route: '/editorials/admin', group: '管理工作台', keywords: 'admin editorials tijie', icon: BookOpen },
      { title: '集训管理', route: '/camps/admin', group: '管理工作台', keywords: 'admin camps jixun', icon: Trophy },
      { title: '文章与公告管理', route: '/posts/admin', group: '管理工作台', keywords: 'admin posts blog wenzhang', icon: FileText },
      { title: '报名管理', route: '/admin/signups', group: '管理工作台', keywords: 'admin signups baoming', icon: ClipboardList },
      { title: '荣誉管理', route: '/admin/honors', group: '管理工作台', keywords: 'admin honors rongyu', icon: Award },
      { title: '工作坊状态管理', route: '/admin/status', group: '管理工作台', keywords: 'admin status zhuangtai', icon: Activity },
      { title: '管理员站内信', route: '/notifications', group: '管理工作台', keywords: 'admin notifications alerts zhanneixin', icon: Bell },
    )
  } else if (canPost.value) {
    list.push({
      title: '文章管理',
      route: '/posts/admin',
      group: '创作',
      keywords: 'posts blog write wenzhang',
      icon: Settings,
    })
  }

  return list
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q) ||
      item.keywords.toLowerCase().includes(q) ||
      item.route.toLowerCase().includes(q),
  )
})

watch(filtered, () => {
  activeIndex.value = 0
})

function openPalette() {
  void ensureLoaded()
  query.value = ''
  activeIndex.value = 0
  open.value = true
  void nextTick(() => inputEl.value?.focus())
}

function closePalette() {
  open.value = false
}

function go(route: string) {
  closePalette()
  void import('astro:transitions/client')
    .then(({ navigate }) => navigate(route))
    .catch(() => {
      window.location.href = route
    })
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (open.value) {
      closePalette()
    } else {
      openPalette()
    }
    return
  }
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closePalette()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (filtered.value.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % filtered.value.length
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (filtered.value.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + filtered.value.length) % filtered.value.length
    }
  } else if (event.key === 'Enter') {
    const target = filtered.value[activeIndex.value]
    if (target) {
      event.preventDefault()
      go(target.route)
    }
  }
}

onMounted(() => {
  isMac.value = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <button
    type="button"
    aria-label="快速跳转页面"
    title="快速跳转（⌘K / Ctrl+K）"
    class="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:h-9 sm:w-auto sm:gap-2 sm:border sm:border-border/70 sm:bg-muted/35 sm:px-3"
    @click="openPalette"
  >
    <Search class="h-4 w-4 shrink-0" />
    <span class="hidden text-xs sm:inline">快速跳转</span>
    <kbd class="hidden rounded border border-border/80 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline-block">
      {{ isMac ? '⌘K' : 'Ctrl K' }}
    </kbd>
  </button>

  <Teleport to="body">
    <Transition name="quick-jump">
      <div
        v-if="open"
        class="fixed inset-0 z-[100] flex items-start justify-center bg-background/60 px-3 pt-[12vh] backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="快速跳转页面"
        @click.self="closePalette"
      >
        <div class="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          <div class="flex items-center gap-2.5 border-b border-border/70 px-3.5 py-3">
            <Search class="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              placeholder="输入页面名称或关键词跳转…"
              class="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd class="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>

          <div class="max-h-[min(60vh,24rem)] overflow-y-auto p-1.5">
            <p v-if="filtered.length === 0" class="px-3 py-8 text-center text-sm text-muted-foreground">
              没有匹配的页面
            </p>
            <button
              v-for="(item, idx) in filtered"
              :key="item.route"
              type="button"
              class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors"
              :class="idx === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/60'"
              @mouseenter="activeIndex = idx"
              @click="go(item.route)"
            >
              <component :is="item.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ item.title }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ item.group }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.quick-jump-enter-active,
.quick-jump-leave-active {
  transition: opacity 120ms ease-out;
}
.quick-jump-enter-from,
.quick-jump-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .quick-jump-enter-active,
  .quick-jump-leave-active {
    transition: none;
  }
}
</style>
