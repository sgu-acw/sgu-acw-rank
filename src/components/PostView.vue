<script setup lang="ts">
/**
 * 文章详情。
 *
 * slug 从路径 ``/post/{slug}`` 或兜底 ``?s=`` 取得，展示预计阅读时长并提供一键复制分享链接。
 */
import MemberName from './MemberName.vue'
import { computed, onMounted, ref } from 'vue'
import { ArrowLeft, Check, Clock, Link2, Megaphone } from 'lucide-vue-next'
import { Button } from './ui/button'
import { ApiError, postApi, type PostDetail } from '../lib/api'
import { renderMarkdown } from '../lib/markdown'

const post = ref<PostDetail | null>(null)
const loading = ref(true)
const error = ref('')
const copiedLink = ref(false)

const slug = computed(() => {
  const m = window.location.pathname.match(/^\/(?:post|blog)\/(.+?)\/?$/)
  if (m) return decodeURIComponent(m[1])
  return new URLSearchParams(window.location.search).get('s') ?? ''
})

const html = computed(() => (post.value ? renderMarkdown(post.value.body) : ''))

const readingMinutes = computed(() => {
  const raw = post.value?.body ?? ''
  const plain = raw.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`[\]()-]/g, ' ')
  const cjk = (plain.match(/[\u4e00-\u9fff]/g) ?? []).length
  const words = (plain.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9_]+/g) ?? []).length
  return Math.max(1, Math.ceil((cjk + words * 1.5) / 360))
})

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copiedLink.value = true
    window.setTimeout(() => {
      copiedLink.value = false
    }, 2000)
  } catch {
    /* 剪贴板权限受限时忽略 */
  }
}

onMounted(async () => {
  if (!slug.value) {
    error.value = '缺少文章地址'
    loading.value = false
    return
  }
  try {
    post.value = await postApi.detail(slug.value)
    document.title = `${post.value.title} - 算法竞赛工作坊`
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <div v-if="loading" class="space-y-4 py-4">
      <div class="h-4 w-16 animate-pulse rounded bg-muted" />
      <div class="h-7 w-2/3 animate-pulse rounded bg-muted" />
      <div class="h-4 w-48 animate-pulse rounded bg-muted/70" />
      <div class="space-y-2 pt-4">
        <div class="h-4 w-full animate-pulse rounded bg-muted/60" />
        <div class="h-4 w-5/6 animate-pulse rounded bg-muted/60" />
        <div class="h-4 w-4/6 animate-pulse rounded bg-muted/60" />
      </div>
    </div>

    <div v-else-if="error" class="py-10">
      <p class="text-sm text-destructive">{{ error }}</p>
      <a href="/blog" class="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft class="h-3.5 w-3.5" />
        回博客列表
      </a>
    </div>

    <article v-else-if="post">
      <div class="mb-4 flex items-center justify-between gap-2">
        <a
          href="/blog"
          class="inline-flex min-h-9 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft class="h-3.5 w-3.5" />
          博客
        </a>
        <Button size="sm" variant="ghost" class="h-8 px-2.5 text-xs text-muted-foreground" @click="copyShareLink">
          <Check v-if="copiedLink" class="mr-1 h-3.5 w-3.5 text-emerald-600" />
          <Link2 v-else class="mr-1 h-3.5 w-3.5" />
          {{ copiedLink ? '已复制链接' : '复制链接' }}
        </Button>
      </div>

      <h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Megaphone
          v-if="post.is_popup"
          class="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500"
          aria-label="公告"
        />
        {{ post.title }}
      </h1>
      <p class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{{ fmtDate(post.published_at) }}</span>
        <template v-if="post.author_name"><span>· <MemberName :name="post.author_name" :signature="post.author_signature" /></span></template>
        <span class="inline-flex items-center gap-1">
          · <Clock class="h-3 w-3" />约 {{ readingMinutes }} 分钟阅读
        </span>
      </p>

      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="prose mt-6 max-w-none dark:prose-invert" v-html="html" />
    </article>
  </div>
</template>
