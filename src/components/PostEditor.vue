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
  'image-block': true,
  'link-tooltip': true,
}

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement | null>(null)
let crepe: { getMarkdown(): string; destroy(): Promise<void> } | null = null

onMounted(async () => {
  // 动态 import：这个包很大（编辑器全家桶），只有进了管理页才下载。
  const { Crepe } = await import('@milkdown/crepe')

  if (!host.value) return
  const editor = new Crepe({
    root: host.value,
    defaultValue: props.modelValue,
    features,
    featureConfigs: {
      placeholder: { text: '写点什么…' },
    },
  })
  await editor.create()
  crepe = editor

  // 每次内容变化就同步出去。Crepe 没暴露 v-model 式的接口，监听
  // markdownUpdated 事件拿最新 markdown。
  editor.on((api) => {
    api.markdownUpdated((_ctx, markdown) => {
      emit('update:modelValue', markdown)
    })
  })
})

onBeforeUnmount(async () => {
  await crepe?.destroy()
  crepe = null
})
</script>

<template>
  <div ref="host" class="post-editor rounded-md border border-input" />
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
