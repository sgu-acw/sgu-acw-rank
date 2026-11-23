<script setup lang="ts">
/**
 * 统一的权限边界引导页。
 *
 * 用于所有仅限校内成员访问的页面（练习数据、集训、线下赛报名、工作坊状态、
 * 成员资料等）：未登录访客看到清晰的登录与校外体验注册入口；校外账号看到
 * 温和的功能范围说明与可用学习页面快捷入口，不直接暴露生硬的 401/403 报错。
 */
import { ArrowRight, CalendarCheck, ListChecks, Lock, LogIn, SquareTerminal, Terminal, UserPlus } from 'lucide-vue-next'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { LEARN_LOCAL } from '../lib/api'

const props = withDefaults(
  defineProps<{
    /** login: 尚未登录；campus: 已登录但为校外账号。 */
    mode: 'login' | 'campus'
    title: string
    description?: string
  }>(),
  {
    description: '',
  },
)

function go(path: string) {
  import('astro:transitions/client')
    .then(({ navigate }) => navigate(path))
    .catch(() => {
      window.location.href = path
    })
}

const openLinks = [
  ...(LEARN_LOCAL
    ? [
        { title: '在线题库', desc: '浏览器内直接写码评测', href: '/learn', icon: Terminal },
        { title: '云端 IDE', desc: '自由调试 C++ / Python 代码', href: '/ide', icon: SquareTerminal },
      ]
    : []),
  { title: '每日一题', desc: '每日分档推荐与题解', href: '/daily', icon: CalendarCheck },
  { title: '公开题单', desc: '按专题整理练习清单', href: '/problems', icon: ListChecks },
]
</script>

<template>
  <div class="mx-auto w-full max-w-2xl py-4">
    <Card>
      <CardContent class="space-y-5 p-6 sm:p-8">
        <div class="flex items-start gap-3.5">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/50 text-muted-foreground">
            <Lock class="h-4 w-4" />
          </div>
          <div class="min-w-0 space-y-1">
            <h1 class="text-lg font-semibold tracking-tight text-foreground">{{ props.title }}</h1>
            <p class="text-sm leading-relaxed text-muted-foreground">
              <template v-if="props.description">{{ props.description }}</template>
              <template v-else-if="props.mode === 'login'">
                该栏目仅对校内工作坊成员开放。校内成员登录后可查看完整内容；校外访客可免邀请码注册体验账号，使用题库、云端 IDE 与公开资源。
              </template>
              <template v-else>
                当前使用的是校外账号，暂不开放校内成员数据与内部活动。你可以继续使用下方的公开学习功能，并在题库中云端保存做题记录。
              </template>
            </p>
          </div>
        </div>

        <div v-if="props.mode === 'login'" class="flex flex-wrap gap-2.5">
          <Button @click="go('/login')">
            <LogIn class="mr-1.5 h-4 w-4" />
            登录账号
          </Button>
          <Button variant="outline" @click="go('/register?channel=external')">
            <UserPlus class="mr-1.5 h-4 w-4" />
            校外人员注册
          </Button>
          <Button variant="ghost" @click="go('/')">返回首页</Button>
        </div>
        <div v-else class="flex flex-wrap gap-2.5">
          <Button @click="go(LEARN_LOCAL ? '/learn' : '/daily')">
            前往{{ LEARN_LOCAL ? '在线题库' : '每日一题' }}
            <ArrowRight class="ml-1.5 h-4 w-4" />
          </Button>
          <Button variant="outline" @click="go('/')">返回首页</Button>
        </div>

        <div class="border-t border-border/50 pt-4">
          <p class="mb-2.5 text-xs font-medium text-muted-foreground">
            {{ props.mode === 'login' ? '无需登录也可直接浏览' : '校外账号可用功能' }}
          </p>
          <div class="grid gap-2.5 sm:grid-cols-2">
            <a
              v-for="item in openLinks"
              :key="item.href"
              :href="item.href"
              class="surface-action group flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-3.5 py-2.5"
            >
              <span class="flex min-w-0 items-center gap-2.5">
                <component :is="item.icon" class="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                <span class="min-w-0">
                  <span class="block text-sm font-medium text-foreground">{{ item.title }}</span>
                  <span class="block truncate text-xs text-muted-foreground">{{ item.desc }}</span>
                </span>
              </span>
              <ArrowRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
