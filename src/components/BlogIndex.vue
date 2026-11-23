<script setup lang="ts">
/**
 * 博客列表。
 *
 * 文章存在后端数据库，列表按 sort_order 排——公告置顶靠大 sort_order。
 * 提供 RSS 订阅链接和站内关键词筛选。
 */
import { computed, onMounted, ref } from 'vue'
import { Megaphone, Rss, Search } from 'lucide-vue-next'
import { Input } from './ui/input'
import { ApiError, postApi, type PostSummary } from '../lib/api'
import { useAuth } from '../lib/auth'

const { ensureLoaded } = useAuth()

const posts = ref<PostSummary[]>([])
const loading = ref(true)
const error = ref('')
const query = ref('')

const filteredPosts = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return posts.value
  return posts.value.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.excerpt.toLowerCase().includes(q) ||
      (p.author_name ?? '').toLowerCase().includes(q),
  )
})

function go(slug: string) {
  import('astro:transitions/client').then(({ navigate }) => navigate(`/post/${encodeURIComponent(slug)}`))
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    posts.value = await postApi.list()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void Promise.all([ensureLoaded(), load()])
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-lg font-semibold tracking-tight">博客</h1>
      <div class="flex items-center gap-2">
        <div v-if="!loading && posts.length > 3" class="relative w-44 sm:w-56">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="query"
            aria-label="搜索文章"
            placeholder="搜索文章…"
            class="h-9 pl-8 text-sm"
          />
        </div>
        <a
          href="/blog/rss.xml"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="RSS 订阅"
        >
          <Rss class="h-3.5 w-3.5" />
          RSS
        </a>
      </div>
    </div>

    <div v-if="loading" class="space-y-4 py-2">
      <div v-for="i in 3" :key="i" class="space-y-2 border-b border-border/40 pb-5">
        <div class="h-5 w-2/3 animate-pulse rounded bg-muted" />
        <div class="h-4 w-full animate-pulse rounded bg-muted/70" />
        <div class="h-3 w-32 animate-pulse rounded bg-muted/50" />
      </div>
    </div>

    <p v-else-if="error" class="py-10 text-sm text-destructive">{{ error }}</p>

    <p v-else-if="!posts.length" class="py-16 text-center text-sm text-muted-foreground">
      还没有文章
    </p>

    <p v-else-if="!filteredPosts.length" class="py-16 text-center text-sm text-muted-foreground">
      没有匹配的文章
    </p>

    <div v-else class="divide-y divide-border/50">
      <a
        v-for="post in filteredPosts"
        :key="post.id"
        :href="`/post/${encodeURIComponent(post.slug)}`"
        class="group block"
        @click.prevent="go(post.slug)"
      >
        <article class="row-action -mx-2 rounded-lg px-2 py-5 md:-mx-4 md:px-4">
          <h2
            class="flex items-center gap-2 text-base font-medium tracking-tight transition-colors group-hover:text-primary md:text-lg"
          >
            <Megaphone
              v-if="post.is_popup"
              class="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500"
              aria-label="公告"
            />
            {{ post.title }}
          </h2>
          <p
            v-if="post.excerpt"
            class="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground"
          >
            {{ post.excerpt }}
          </p>
          <span class="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground/70">
            {{ fmtDate(post.published_at) }}
            <template v-if="post.author_name">· {{ post.author_name }}</template>
          </span>
        </article>
      </a>
    </div>
  </div>
</template>
