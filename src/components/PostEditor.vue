<script setup lang="ts">
/**
 * 文章的所见即所得编辑器，Crepe（Milkdown 全家桶）套一层壳。
 *
 * 为什么不直接用它的官方 Vue 适配器：@milkdown/vue 是把 React 风格的
 * 上下文硬套进 Vue，生命周期和响应式都别扭。Crepe 本身是 vanilla JS，
 * 一个 div + create()/destroy() 就完了，比适配层干净。
 *
 * 深色的做法：主题 CSS 只引浅色那份，深色变量用 ``.dark .milkdown``
 * 覆盖——值照抄官方的 frame-dark 主题。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { CalendarDays, ClipboardList, FileText, Link2, ListChecks, Trophy } from 'lucide-vue-next'
import {
  campApi,
  postApi,
  problemListApi,
  signupApi,
} from '../lib/api'
// 主题 CSS 静态引入：动态 import CSS 在构建时不会单独产出文件，
// 运行时会 404（`Unable to preload CSS`）。放这里由 Vite 打进本页的样式。
// Crepe 的样式分两层：common 是组件本身（工具栏、ProseMirror、气泡…），
// frame 是配色变量。两层都得引，少了 common 编辑器是裸的。
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

// 按需开特性：工具栏、LaTeX（题解文章会写公式）、表格、列表、代码、
// 占位提示。block-edit（拖拽重排）关掉——它不显示在工具栏里，靠左侧
// 把手，和站点扁平风格不搭。
const features = {
  toolbar: true,
  latex: true,
  table: true,
  'list-item': true,
  'code-mirror': true,
  placeholder: true,
  // image-block 是 Crepe 的增强图片节点，但它要求 caption 属性是 string——
  // 普通 markdown `![](url)` 解析出来 caption 是 null，直接 RangeError 崩掉
  // 整篇渲染。关掉它，用 ProseMirror 自带的标准图片节点。
  'image-block': false,
  'link-tooltip': true,
}

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement | null>(null)
type CrepeLike = {
  getMarkdown(): string
  destroy(): Promise<void>
  editor: { action(fn: (ctx: unknown) => void): void } | null
}
let crepe: CrepeLike | null = null

// ---------------------------------------------------------------- 站内事件插入
//
// 写作时常要链到本站的集训、报名、题单这类动态页——手敲 URL 容易错。
// 顶栏一个按钮展开分组列表，点了把 [名称](站内路径) 插到光标处。

type EventLink = { label: string; url: string }
type EventGroup = { title: string; icon: unknown; items: EventLink[] }

const pickerOpen = ref(false)
const pickerLoading = ref(false)
const groups = ref<EventGroup[]>([])

const STATIC_LINKS: EventLink[] = [
  { label: '每日一题', url: '/daily' },
  { label: '工作坊状态', url: '/status' },
  { label: '练习数据', url: '/practice' },
  { label: '集训列表', url: '/camps' },
  { label: '线下赛报名', url: '/signups' },
  { label: '博客', url: '/blog' },
]

async function togglePicker() {
  pickerOpen.value = !pickerOpen.value
  if (!pickerOpen.value || groups.value.length) return
  pickerLoading.value = true
  const next: EventGroup[] = [{ title: '常用页面', icon: Link2, items: STATIC_LINKS }]
  const [camps, signups, lists, posts] = await Promise.allSettled([
    campApi.list(),
    signupApi.list(),
    problemListApi.list({ include_nested: true }),
    postApi.list(),
  ])
  if (camps.status === 'fulfilled' && camps.value.length) {
    next.push({
      title: '集训',
      icon: Trophy,
      items: camps.value.map((c) => ({ label: c.name, url: `/camp?id=${c.id}` })),
    })
  }
  if (signups.status === 'fulfilled' && signups.value.length) {
    next.push({
      title: '线下报名',
      icon: ClipboardList,
      items: signups.value.map((s) => ({ label: s.name, url: `/signup?id=${s.id}` })),
    })
  }
  if (lists.status === 'fulfilled' && lists.value.length) {
    next.push({
      title: '题单',
      icon: ListChecks,
      items: lists.value.map((l) => ({ label: l.title, url: `/problems/view?id=${l.id}` })),
    })
  }
  if (posts.status === 'fulfilled' && posts.value.length) {
    next.push({
      title: '文章',
      icon: FileText,
      items: posts.value.map((p) => ({ label: p.title, url: `/post/${p.slug}` })),
    })
  }
  groups.value = next
  pickerLoading.value = false
}

async function insertLink(item: EventLink) {
  pickerOpen.value = false
  if (!crepe?.editor) return
  const { insert } = await import('@milkdown/kit/utils')
  crepe.editor.action(insert(`[${item.label}](${item.url})`))
}

// Crepe 的 image-block 节点要求 caption 是 string——`![](url)` 的 title
// 是 null，直接 RangeError 崩掉整篇渲染。进编辑器前给无 title 的图片
// 塞上空 title，出编辑器时再清掉，round-trip 对用户透明。
function normalizeIn(md: string): string {
  // "" 会被 remark 当没 title 解析回 null，要真塞一个空格。
  return md.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, '![$1]($2 " ")')
}
function normalizeOut(md: string): string {
  return md.replace(/!\[([^\]]*)\]\(([^\s)]+) " "\)/g, '![$1]($2)')
}

onMounted(async () => {
  // 动态 import：这个包很大（编辑器全家桶），只有进了管理页才下载。
  const { Crepe } = await import('@milkdown/crepe')

  if (!host.value) return
  const editor = new Crepe({
    root: host.value,
    defaultValue: normalizeIn(props.modelValue),
    features,
    featureConfigs: {
      placeholder: { text: '写点什么…' },
    },
  })
  await editor.create()
  crepe = editor as unknown as CrepeLike

  // 每次内容变化就同步出去。Crepe 没暴露 v-model 式的接口，监听
  // markdownUpdated 事件拿最新 markdown。
  editor.on((api) => {
    api.markdownUpdated((_ctx, markdown) => {
      emit('update:modelValue', normalizeOut(markdown))
    })
  })
})

onBeforeUnmount(async () => {
  await crepe?.destroy()
  crepe = null
})
</script>

<template>
  <div class="space-y-2">
    <!-- 站内事件：链接到本站的集训/报名/题单等，不用手敲 URL -->
    <div>
      <button
        type="button"
        class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
        @click="togglePicker"
      >
        <CalendarDays class="h-3.5 w-3.5" />插入站内事件
      </button>
      <div
        v-if="pickerOpen"
        class="mt-1.5 max-h-64 space-y-3 overflow-y-auto rounded-md border border-border/60 bg-card p-3"
      >
        <p v-if="pickerLoading" class="text-xs text-muted-foreground">加载…</p>
        <section v-for="g in groups" v-else :key="g.title" class="space-y-1">
          <p class="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            <component :is="g.icon" class="h-3 w-3" />{{ g.title }}
          </p>
          <button
            v-for="item in g.items"
            :key="item.url"
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent/60"
            @click="insertLink(item)"
          >
            <span class="truncate">{{ item.label }}</span>
            <span class="shrink-0 font-mono text-[10px] text-muted-foreground/60">{{ item.url }}</span>
          </button>
        </section>
      </div>
    </div>
    <div ref="host" class="post-editor rounded-md border border-input" />
  </div>
</template>

<style>
/*
 * Crepe 的深色适配：官方深色主题是一份完整 CSS，不能和浅色同时引入
 * （同 scope 会互相覆盖）。这里只覆盖变量。
 */
.dark .post-editor .milkdown {
  --crepe-color-background: hsl(240 6% 9%);
  --crepe-color-on-background: #e6e6e6;
  --crepe-color-surface: hsl(240 6% 7%);
  --crepe-color-surface-low: hsl(240 5% 12%);
  --crepe-color-on-surface: #d1d1d1;
  --crepe-color-on-surface-variant: #a9a9a9;
  --crepe-color-outline: hsl(240 4% 30%);
  --crepe-color-primary: #b5b5b5;
  --crepe-color-secondary: #4d4d4d;
  --crepe-color-on-secondary: #d6d6d6;
  --crepe-color-inverse: #e5e5e5;
  --crepe-color-on-inverse: #2a2a2a;
  --crepe-color-inline-code: #ff6666;
  --crepe-color-error: #ff6666;
  --crepe-color-hover: hsl(240 5% 16%);
  --crepe-color-selected: hsl(240 5% 20%);
  --crepe-color-inline-area: #2b2b2b;
}

/* 编辑器跟站点字体走，不用它自带的 serif 标题字体。 */
.post-editor .milkdown {
  --crepe-font-title: inherit;
  --crepe-font-default: inherit;
}
</style>
