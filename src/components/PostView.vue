<script setup lang="ts">
/**
 * 文章详情。
 *
 * slug 从两个地方拿：``?s=`` query（新写法），或者 ``/blog/{slug}`` 的
 * 路径尾巴（老链接，被 _redirects rewrite 到本页，URL 里还带着 slug）。
 */
import { computed, onMounted, ref } from 'vue'
import { ArrowLeft, Loader2, Megaphone } from 'lucide-vue-next'
import { ApiError, postApi, type PostDetail } from '../lib/api'
import { renderMarkdown } from '../lib/markdown'

const post = ref<PostDetail | null>(null)
const loading = ref(true)
const error = ref('')

const slug = computed(() => {
  // /post/100-入门指南 → 100-入门指南；老链接 /blog/xxx 会被 301 到 /post/xxx。
  const m = window.location.pathname.match(/^\/(?:post|blog)\/(.+?)\/?$/)
  if (m) return decodeURIComponent(m[1])
  // 兜底：?s= 写法
  return new URLSearchParams(window.location.search).get('s') ?? ''
})

const html = computed(() => (post.value ? renderMarkdown(post.value.body) : ''))

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

onMounted(async () => {
  if (!slug.value) {
    error.value = '缺少文章地址'
    loading.value = false
    return
  }
  try {
    post.value = await postApi.detail(slug.value)
    document.title = `${post.value.title} - SGU ACW`
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <div v-else-if="error" class="py-10">
      <p class="text-sm text-destructive">{{ error }}</p>
      <a href="/blog" class="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft class="h-3.5 w-3.5" />
        回博客列表
      </a>
    </div>

    <article v-else-if="post">
      <a
        href="/blog"
        class="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft class="h-3.5 w-3.5" />
        博客
      </a>

      <h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Megaphone
          v-if="post.is_popup"
          class="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500"
          aria-label="公告"
        />
        {{ post.title }}
      </h1>
      <p class="mt-1.5 text-xs text-muted-foreground">
        {{ fmtDate(post.published_at) }}
        <template v-if="post.author_name"> · {{ post.author_name }}</template>
      </p>

      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="prose mt-6 max-w-none dark:prose-invert" v-html="html" />
    </article>
  </div>
</template>
