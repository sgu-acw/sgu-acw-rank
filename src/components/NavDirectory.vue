<script setup lang="ts">
/**
 * 导航与常用学习资源。
 *
 * 校内成员看到完整内容（含工作坊 QQ 群与校内直达）；
 * 未登录与校外用户只看到公开学习入口与外部竞赛资源，不暴露内部群号。
 */
import { computed, onMounted, ref } from 'vue'
import {
  ArrowUpRight,
  BookOpen,
  Code2,
  Compass,
  Laptop,
  MessageCircle,
  MonitorSmartphone,
  Puzzle,
  Terminal,
  Trophy,
} from 'lucide-vue-next'
import { LEARN_LOCAL } from '../lib/api'
import { useAuth } from '../lib/auth'

interface NavLink {
  name: string
  url: string
  desc?: string
  internal?: boolean
  campusOnly?: boolean
}

interface NavSection {
  title: string
  icon: unknown
  links: NavLink[]
}

const qqGroup = '905189428'

const mounted = ref(false)
const { isCampusMember, ensureLoaded } = useAuth()
const showCampus = computed(() => mounted.value && isCampusMember.value)

const rawSections: NavSection[] = [
  {
    title: '站内',
    icon: Trophy,
    links: [
      ...(LEARN_LOCAL
        ? [
            { name: '在线题库', url: '/learn', desc: '浏览器内直接编写与评测题目', internal: true },
            { name: '云端 IDE', url: '/ide', desc: '免配置在线调试代码', internal: true },
          ]
        : []),
      { name: '每日一题', url: '/daily', desc: '按难度分档每日抽题与题解', internal: true },
      { name: '专题题单', url: '/problems', desc: '按专题整理训练题目', internal: true },
      { name: '成员练习榜', url: '/practice', desc: '训练量与 Rating 榜单', internal: true, campusOnly: true },
      { name: '工作坊状态', url: '/status', desc: '活动室开门情况与排期', internal: true, campusOnly: true },
    ],
  },
  {
    title: 'OJ',
    icon: Code2,
    links: [
      { name: 'Codeforces', url: 'https://codeforces.com/', desc: '主力刷题平台' },
      { name: 'AtCoder', url: 'https://atcoder.jp/', desc: '基础题练习 (ABC)' },
      { name: '洛谷', url: 'https://www.luogu.com.cn/', desc: '模板题练习' },
      { name: 'qoj', url: 'https://qoj.ac/', desc: '参加以往的正赛' },
      { name: '牛客', url: 'https://ac.nowcoder.com/' },
    ],
  },
  {
    title: '资料',
    icon: BookOpen,
    links: [{ name: 'OI WIKI', url: 'https://oi-wiki.org/', desc: '算法竞赛知识百科' }],
  },
  {
    title: '工具（网页）',
    icon: MonitorSmartphone,
    links: [
      { name: 'CList', url: 'https://clist.by/', desc: '评级、比赛日历' },
      { name: 'CF Visualizer', url: 'https://cfviz.netlify.app/', desc: '个人比赛数据可视' },
      { name: 'CF Tracker', url: 'https://cftracker.netlify.app/', desc: '个人提交统计、题单管理' },
      {
        name: 'AtCoder Problems',
        url: 'https://kenkoooo.com/atcoder/#/table/All',
        desc: 'AtCoder 题目列表、个人数据可视',
      },
      { name: 'CPC Finder', url: 'https://cpcfinder.com/', desc: '区域赛获奖查询' },
    ],
  },
  {
    title: '工具（插件）',
    icon: Puzzle,
    links: [
      {
        name: 'CF Better',
        url: 'https://greasyfork.org/zh-CN/scripts/465777-codeforces-better#google_vignette',
        desc: 'Codeforces 增强、翻译。翻译 API 建议用 LLM（如 DS / Qwen），充十块钱能用很久',
      },
      {
        name: 'AtCoder Better',
        url: 'https://greasyfork.org/zh-CN/scripts/471106-atcoder-better',
        desc: 'AtCoder 增强、翻译',
      },
      {
        name: 'Competitive Companion',
        url: 'https://github.com/jmerle/competitive-companion#readme',
      },
      { name: 'Carrot', url: 'https://github.com/meooow25/carrot', desc: 'CF 分数预测' },
    ],
  },
  {
    title: 'IDE / 编辑器',
    icon: Laptop,
    links: [
      { name: 'CLion', url: 'https://www.jetbrains.com.cn/clion/download' },
      { name: 'PyCharm', url: 'https://www.jetbrains.com/pycharm/download' },
      { name: 'VSCode', url: 'https://code.visualstudio.com/' },
      { name: '小熊猫 C++', url: 'http://royqh.net/redpandacpp/' },
    ],
  },
  {
    title: 'VSCode 插件',
    icon: Terminal,
    links: [
      {
        name: 'Competitive Programming Helper',
        url: 'https://marketplace.visualstudio.com/items?itemName=DivyanshuAgrawal.competitive-programming-helper',
        desc: '代码补全、代码片段，建议配合 Competitive Companion 使用',
      },
      {
        name: 'Cpp Runner',
        url: 'https://marketplace.visualstudio.com/items?itemName=franneck94.c-cpp-runner',
        desc: '代码运行',
      },
    ],
  },
]

const sections = computed(() =>
  rawSections
    .map((section) => ({
      ...section,
      links: section.links.filter((link) => !link.campusOnly || showCampus.value),
    }))
    .filter((section) => section.links.length > 0),
)

onMounted(() => {
  mounted.value = true
  void ensureLoaded()
})
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <h1 class="page-title flex items-center gap-2">
          <Compass class="h-5 w-5 text-muted-foreground" />
          导航与资源
        </h1>
        <p class="page-subtitle">算法竞赛常用平台、资料百科与本地工具合集</p>
      </div>
    </header>

    <a
      v-if="showCampus"
      :href="`https://qm.qq.com/q/${qqGroup}`"
      target="_blank"
      rel="noreferrer"
      class="surface-card surface-action group flex items-center justify-between gap-4 p-4"
    >
      <span class="flex items-center gap-3">
        <MessageCircle class="h-5 w-5 text-muted-foreground" />
        <span>
          <span class="block text-sm font-medium">校内工作坊 QQ 群</span>
          <span class="block text-xs text-muted-foreground">校内训练与比赛通知主要在这里发</span>
        </span>
      </span>
      <span class="flex items-center gap-2 font-mono text-sm text-muted-foreground">
        {{ qqGroup }}
        <ArrowUpRight class="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-primary" />
      </span>
    </a>

    <div class="space-y-8">
      <section v-for="section in sections" :key="section.title">
        <h2 class="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <component :is="section.icon" class="h-4 w-4 text-muted-foreground" />
          {{ section.title }}
        </h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <a
            v-for="link in section.links"
            :key="link.url"
            :href="link.url"
            :target="link.internal ? undefined : '_blank'"
            :rel="link.internal ? undefined : 'noreferrer'"
            class="surface-card surface-action group flex flex-col justify-between p-4"
          >
            <span class="flex items-start justify-between gap-2">
              <span class="text-sm font-medium">{{ link.name }}</span>
              <span
                v-if="link.internal"
                class="shrink-0 rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                站内
              </span>
              <ArrowUpRight
                v-else
                class="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary"
              />
            </span>
            <span v-if="link.desc" class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {{ link.desc }}
            </span>
          </a>
        </div>
      </section>
    </div>
  </div>
</template>
