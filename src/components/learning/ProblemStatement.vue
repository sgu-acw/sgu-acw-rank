<script setup lang="ts">
import { computed } from 'vue'
/* eslint-disable vue/no-v-html -- 题面由管理员编辑，沿用站内 Markdown 与 KaTeX 渲染器。 */
import { Clock3, Braces } from 'lucide-vue-next'
import { renderMarkdown } from '../../lib/markdown'
import type { Problem } from '../../lib/learning/types'
import TestDataView from './TestDataView.vue'
const props = defineProps<{ problem: Problem }>()
const blocks = computed(() => [
  { title: '题目描述', text: props.problem.content.statement },
  { title: '输入格式', text: props.problem.content.input_format },
  { title: '输出格式', text: props.problem.content.output_format },
  { title: '说明', text: props.problem.content.note },
].filter(b => b.text?.trim()).map(b => ({ title: b.title, html: renderMarkdown(b.text!) })))
const samples = computed(() => props.problem.content.tests.filter(t => t.sample))
</script>
<template>
  <article class="problem-statement" aria-label="题目内容">
    <div class="flex flex-wrap gap-x-5 gap-y-2 border-b pb-5 text-xs text-muted-foreground"><span class="inline-flex items-center gap-2"><Clock3 class="h-3.5 w-3.5" />{{ problem.content.time_ms }} ms / 测试点</span><span class="inline-flex items-center gap-2"><Braces class="h-3.5 w-3.5" />{{ problem.content.checker === 'spj' ? 'Special Judge' : problem.content.checker === 'tokens' ? '忽略空白比较' : '逐字比较' }}</span></div>
    <section v-for="block in blocks" :key="block.title" class="mt-6"><h2 class="mb-3 text-sm font-semibold">{{ block.title }}</h2><div class="problem-prose" v-html="block.html" /></section>
    <section v-if="samples.length" class="mt-7 border-t pt-5"><h2 class="text-sm font-semibold">样例</h2><div v-for="(test, i) in samples" :key="i" class="mt-5 min-w-0"><h3 class="mb-1 text-xs font-medium text-muted-foreground">{{ test.name || `样例 ${i + 1}` }}</h3><TestDataView :text="test.input" label="输入" /><TestDataView :text="test.output" label="输出" /></div></section>
    <div v-if="problem.content.tags.length" class="mt-7 flex flex-wrap gap-2 border-t pt-5"><span v-for="tag in problem.content.tags" :key="tag" class="learning-tag">{{ tag }}</span></div>
  </article>
</template>
