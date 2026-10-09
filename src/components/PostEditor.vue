<script setup lang="ts">
/**
 * 文章编辑器。
 *
 * 不用 WYSIWYG——Crepe 很大（1.4MB）、有 image-block 崩 caption=null
 * 的 bug、左边还浮着一列把手图标跟站点扁平风格不搭。
 *
 * 改成「左边写 markdown、右边实时预览」：跟题解管理页的风格一致，
 * 没新依赖，renderMarkdown 就是题解用的那个（卡片、公式、裸 HTML
 * 都通）。
 */
import { computed } from 'vue'
import { renderMarkdown } from '../lib/markdown'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const html = computed(() => renderMarkdown(props.modelValue))
</script>

<template>
  <div class="grid gap-3 lg:grid-cols-2">
    <div class="space-y-1.5">
      <label class="text-xs font-medium">
        正文
        <span class="ml-1 font-normal text-muted-foreground">
          Markdown + LaTeX + HTML，{{ modelValue.length }} 字符
        </span>
      </label>
      <textarea
        :value="modelValue"
        rows="20"
        spellcheck="false"
        placeholder="写点什么…"
        class="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      />
      <p class="text-[11px] text-muted-foreground/70">
        :::card 标题 | 描述 | url 是链接卡片；$...$ 是公式
      </p>
    </div>

    <div class="space-y-1.5">
      <p class="text-xs font-medium text-muted-foreground">预览</p>
      <!-- eslint-disable vue/no-v-html -->
      <div
        class="editorial-body prose min-h-[26rem] max-w-none rounded-md border border-border/40 px-4 py-3 text-sm dark:prose-invert"
        v-html="html"
      />
      <!-- eslint-enable vue/no-v-html -->
    </div>
  </div>
</template>
