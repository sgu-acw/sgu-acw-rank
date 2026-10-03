<script setup lang="ts">
/**
 * 一道题的题解。
 *
 * 三层内容，默认都是藏着的：
 *
 * - **提示**：逐条显示。看一条、想一想，还不够再点下一条。
 * - **题解**：默认隐藏。很多人点进来只是想拿一条提示，不想被剧透。
 * - **参考代码**：次日凌晨 4 点公布。比题解晚一天——题解讲思路，
 *   看完还得自己写；代码是最终答案，早给出来就没得做了。
 *
 * 未公布的内容服务端根本不返回，所以这里不用做「隐藏」，只需要按
 * 有没有内容来显示状态。
 */
import { computed, ref } from 'vue'
import { BookOpen, ChevronDown, Code2, Lightbulb, Loader2, Lock } from 'lucide-vue-next'
import { renderMarkdown } from '../lib/markdown'
import type { EditorialView } from '../lib/api'

const props = defineProps<{ editorial: EditorialView }>()

/**
 * 已经放出几条提示。
 *
 * 用数字而不是布尔量：提示要一条一条给，看一条想一下，不够再点。
 * 一次全放出来和直接给题解区别不大。
 */
const revealedHints = ref(0)
/** 题解默认藏着。 */
const showBody = ref(false)
/** 代码默认收起。 */
const showCode = ref(false)
/** 当前看哪个语言的代码。 */
const lang = ref<'cpp17' | 'py3' | 'java17'>('cpp17')

const bodyHtml = computed(() => renderMarkdown(props.editorial.body))

const LANGS = [
  { key: 'cpp17' as const, label: 'C++17' },
  { key: 'py3' as const, label: 'Python 3' },
  { key: 'java17' as const, label: 'Java 17' },
]

const hints = computed(() => props.editorial.hints)
const shownHints = computed(() => hints.value.slice(0, revealedHints.value))
const hasMoreHints = computed(() => revealedHints.value < hints.value.length)
const currentCode = computed(() => props.editorial.code[lang.value] ?? '')

function revealNextHint() {
  if (hasMoreHints.value) revealedHints.value += 1
}

/**
 * 未公布时显示什么。
 *
 * 分三种情况：还在生成、生成失败、已生成但没到公布时间。第三种最常见，
 * 告诉用户几点来看就够了。
 */
const pendingLabel = computed(() => {
  if (props.editorial.status === 'failed') return '题解生成失败'
  if (props.editorial.status === 'pending') return '题解正在生成'
  return null
})

const publishLabel = computed(() => {
  const at = props.editorial.publish_at
  if (!at) return ''
  const date = new Date(at)
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
})

const codePublishLabel = computed(() => {
  const at = props.editorial.code_publish_at
  if (!at) return ''
  const date = new Date(at)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month} 月 ${day} 日 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
})
</script>

<template>
  <div class="space-y-3">
    <!-- 还没到公布时间 -->
    <div
      v-if="!editorial.available"
      class="flex items-center gap-2 rounded-md border border-border/40 px-3 py-2.5 text-xs text-muted-foreground"
    >
      <Loader2 v-if="editorial.status === 'pending'" class="h-3.5 w-3.5 animate-spin" />
      <Lock v-else class="h-3.5 w-3.5" />
      <template v-if="pendingLabel">{{ pendingLabel }}</template>
      <template v-else>题解 {{ publishLabel }} 公布</template>
    </div>

    <template v-else>
      <!--
        提示。一条一条放。

        已放出的直接显示，没放出的用一行「下一条提示」按钮。
        一次全放出来跟直接看题解区别不大——逐条才留得住「再想一想」的余地。
      -->
      <div v-if="hints.length" class="space-y-1.5">
        <ol v-if="shownHints.length" class="space-y-1.5">
          <li
            v-for="(hint, index) in shownHints"
            :key="index"
            class="flex gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs leading-relaxed"
          >
            <Lightbulb class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>{{ hint }}</span>
          </li>
        </ol>

        <button
          v-if="hasMoreHints"
          type="button"
          class="row-action flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground"
          @click="revealNextHint"
        >
          <Lightbulb class="h-3.5 w-3.5" />
          {{ revealedHints === 0 ? '看提示' : '下一条提示' }}
          <span class="font-normal text-muted-foreground/60">
            {{ revealedHints }}/{{ hints.length }}
          </span>
        </button>
      </div>

      <!--
        题解正文。默认藏着。

        很多人点进来只是想要一条提示，不想被剧透。所以正文要主动点开，
        而且展开前把话说清楚。

        v-html 在这里是安全的：markdown-it 开了 html:false，生成器写的裸
        HTML 会被转义成文本；能进入这段 HTML 的只有 markdown-it 自己产出
        的标签和 KaTeX 渲染的公式。

        注意：如果以后把 html 改成 true，这里就真的成了 XSS 口子。
      -->
      <div>
        <button
          v-if="!showBody"
          type="button"
          class="row-action flex w-full items-center gap-1.5 rounded-md border border-border/40 px-3 py-2 text-xs font-medium text-muted-foreground"
          @click="showBody = true"
        >
          <BookOpen class="h-3.5 w-3.5" />
          看完整题解
          <span class="ml-auto font-normal text-muted-foreground/60">含做法与推导</span>
        </button>

        <template v-else>
          <button
            type="button"
            class="row-action flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground"
            @click="showBody = false"
          >
            <BookOpen class="h-3.5 w-3.5" />
            题解
            <span class="ml-auto font-normal text-muted-foreground/60">收起</span>
          </button>

          <!-- eslint-disable-next-line vue/no-v-html -- 见上 -->
          <div class="editorial-body mt-1" v-html="bodyHtml" />
        </template>
      </div>

      <!-- 参考代码 -->
      <div>
        <button
          v-if="editorial.code_available"
          type="button"
          class="row-action flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground"
          :aria-expanded="showCode"
          @click="showCode = !showCode"
        >
          <Code2 class="h-3.5 w-3.5" />
          参考代码
          <ChevronDown
            class="ml-auto h-3.5 w-3.5 transition-transform duration-150"
            :class="showCode && 'rotate-180'"
          />
        </button>

        <p v-else class="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground/70">
          <Lock class="h-3.5 w-3.5" />
          参考代码 {{ codePublishLabel }} 公布
        </p>

        <template v-if="showCode && editorial.code_available">
          <div class="mt-1.5 flex gap-1">
            <button
              v-for="item in LANGS"
              :key="item.key"
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              :class="
                lang === item.key
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted/60'
              "
              @click="lang = item.key"
            >
              {{ item.label }}
            </button>
          </div>

          <pre
            class="mt-2 overflow-x-auto rounded-md border border-border/40 bg-muted/30 p-3 text-xs leading-relaxed"
          ><code>{{ currentCode }}</code></pre>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
/*
 * 题解正文的排版。
 *
 * 用 :deep() 是因为正文是父组件渲染进来的 HTML，不在本组件的 scoped 范围内。
 * 只定必要的几项：标题、段落、代码块、列表、表格。不做全套 prose——
 * 题解篇幅有限，样式太多反而显得杂。
 */
.editorial-body :deep(h2) {
  @apply mt-4 text-sm font-semibold first:mt-0;
}

.editorial-body :deep(h3) {
  @apply mt-3 text-xs font-semibold text-muted-foreground;
}

.editorial-body :deep(p) {
  @apply mt-2 text-sm leading-relaxed text-muted-foreground;
}

.editorial-body :deep(ul),
.editorial-body :deep(ol) {
  @apply mt-2 space-y-1 pl-4 text-sm leading-relaxed text-muted-foreground;
}

.editorial-body :deep(ul) {
  @apply list-disc;
}

.editorial-body :deep(ol) {
  @apply list-decimal;
}

.editorial-body :deep(code) {
  @apply rounded bg-muted px-1 py-0.5 font-mono text-xs;
}

.editorial-body :deep(pre) {
  @apply mt-2 overflow-x-auto rounded-md border border-border/40 bg-muted/30 p-3;
}

.editorial-body :deep(pre code) {
  @apply bg-transparent p-0;
}

.editorial-body :deep(strong) {
  @apply font-semibold text-foreground;
}
</style>
