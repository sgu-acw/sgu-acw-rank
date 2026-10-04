<script setup lang="ts">
/**
 * 管理工作台的分区切换。成员、题单、题解、题单编辑几个页面共用同一条。
 *
 * 标题就是这一条，不再另起一行写「SGU ACW · 管理」再加一句功能说明——
 * 那两句和「管理工作台」说的是同一件事，只是把版面撑高。分区靠图标区分，
 * 文字只留最短的标签。
 */
import { BookOpen, ListChecks, Users } from 'lucide-vue-next'

defineProps<{
  active: 'people' | 'problems' | 'editorials'
}>()

const TABS = [
  { key: 'people', href: '/admin', label: '成员', icon: Users },
  { key: 'problems', href: '/problems/admin', label: '题单', icon: ListChecks },
  { key: 'editorials', href: '/editorials/admin', label: '题解', icon: BookOpen },
] as const
</script>

<template>
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-xl font-semibold tracking-tight">管理工作台</h1>
      <!-- 页面自己的操作放这里，与标题同排，不再另占一行。 -->
      <slot />
    </div>

    <!--
      分段控件。选中态用底色和前景色区分，不加阴影——本站的卡片都是平的，
      靠边框分层，这里跟着走。
    -->
    <nav
      class="flex gap-0.5 rounded-lg border border-border/50 bg-muted/40 p-0.5"
      aria-label="管理工作台"
    >
      <a
        v-for="tab in TABS"
        :key="tab.key"
        :href="tab.href"
        class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-[var(--ease-out)] active:scale-[0.98]"
        :class="
          active === tab.key
            ? 'bg-card text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        :aria-current="active === tab.key ? 'page' : undefined"
      >
        <component :is="tab.icon" class="h-4 w-4" />
        {{ tab.label }}
      </a>
    </nav>
  </header>
</template>
