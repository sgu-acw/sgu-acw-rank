<script setup lang="ts">
import { KeyRound, ListChecks, Users } from 'lucide-vue-next'

defineProps<{
  active: 'people' | 'problems'
}>()
</script>

<template>
  <section class="space-y-5">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">SGU ACW · 管理</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">管理工作台</h1>
        <p class="mt-1 text-sm text-muted-foreground">成员、邀请码与题单，集中在这里处理。</p>
      </div>
      <span class="hidden rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex sm:items-center sm:gap-2">
        <KeyRound class="h-3.5 w-3.5" />
        仅管理员可见
      </span>
    </header>

    <nav class="grid max-w-2xl grid-cols-2 gap-1 rounded-xl border border-border/50 bg-muted/40 p-1" aria-label="管理工作台导航">
      <a
        href="/admin"
        class="group flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
        :class="active === 'people' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'"
        :aria-current="active === 'people' ? 'page' : undefined"
      >
        <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted/70 text-muted-foreground transition-colors group-hover:text-foreground" :class="active === 'people' && 'bg-primary/10 text-primary'">
          <Users class="h-4 w-4" />
        </span>
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium">成员与邀请码</span>
          <span class="hidden text-[11px] text-muted-foreground sm:block">账号、身份与注册</span>
        </span>
      </a>
      <a
        href="/problems/admin"
        class="group flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
        :class="active === 'problems' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'"
        :aria-current="active === 'problems' ? 'page' : undefined"
      >
        <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted/70 text-muted-foreground transition-colors group-hover:text-foreground" :class="active === 'problems' && 'bg-primary/10 text-primary'">
          <ListChecks class="h-4 w-4" />
        </span>
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium">题单管理</span>
          <span class="hidden text-[11px] text-muted-foreground sm:block">合集、题目与排序</span>
        </span>
      </a>
    </nav>
  </section>
</template>
