<script setup lang="ts">
/**
 * 管理工作台的分区切换。成员、题单、题解、题单编辑几个页面共用同一条。
 *
 * 标题就是这一条，不再另起一行写「算法竞赛工作坊 · 管理」再加一句功能说明——
 * 那两句和「管理工作台」说的是同一件事，只是把版面撑高。分区靠图标区分，
 * 文字只留最短的标签。
 */
import { Activity, BookOpen, ClipboardList, FileText, ListChecks, Terminal, Trophy, Users } from 'lucide-vue-next'
import { LEARN_LOCAL } from '../lib/api'

defineProps<{
  active: 'people' | 'problems' | 'learn' | 'editorials' | 'camps' | 'posts' | 'status' | 'signups'
}>()

const TABS = [
  { key: 'people', href: '/admin', label: '成员', icon: Users },
  { key: 'problems', href: '/problems/admin', label: '题单', icon: ListChecks },
  // 题库只在本地预览启用；生产构建里 /admin/learn 是 404。
  ...(LEARN_LOCAL ? [{ key: 'learn', href: '/admin/learn', label: '题库', icon: Terminal }] : []),
  { key: 'editorials', href: '/editorials/admin', label: '题解', icon: BookOpen },
  { key: 'camps', href: '/camps/admin', label: '集训', icon: Trophy },
  { key: 'posts', href: '/posts/admin', label: '文章', icon: FileText },
  { key: 'status', href: '/admin/status', label: '状态', icon: Activity },
  { key: 'signups', href: '/admin/signups', label: '报名', icon: ClipboardList },
] as const
</script>

<template>
  <div class="space-y-3">
    <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="text-xl font-semibold tracking-tight">管理工作台</h1>
      <!-- 页面操作单独成组，手机端会完整占一行，避免和标题争夺宽度。 -->
      <div class="flex min-h-9 shrink-0 items-center gap-2">
        <slot />
      </div>
    </div>

    <!--
      手机端保持一行横向滚动，而不是自动换行成两行不可预测的导航。
      当前项始终有底色和 aria-current，用户不会因为页面变窄而丢失上下文。
    -->
    <nav
      class="-mx-3 flex min-w-0 gap-0.5 overflow-x-auto border-y border-border/40 bg-muted/20 px-3 py-1.5 sm:mx-0 sm:rounded-lg sm:border sm:bg-muted/40 sm:px-0 sm:py-0.5"
      aria-label="管理工作台"
    >
      <a
        v-for="tab in TABS"
        :key="tab.key"
        :href="tab.href"
        class="flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150 ease-[var(--ease-out)] active:scale-[0.98] sm:min-h-8"
        :class="
          active === tab.key
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
        "
        :aria-current="active === tab.key ? 'page' : undefined"
      >
        <component :is="tab.icon" class="h-4 w-4" />
        {{ tab.label }}
      </a>
    </nav>
  </div>
</template>
