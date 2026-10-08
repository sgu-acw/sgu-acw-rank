<script setup lang="ts">
/**
 * 博客列表。
 *
 * 文章存在后端数据库（管理员后台能写），不是构建时的 content collection。
 * 列表按 sort_order 排——公告置顶就靠给它一个大 sort_order。
 */
import { onMounted, ref } from 'vue'
import { Loader2, Megaphone } from 'lucide-vue-next'
import { ApiError, postApi, type PostSummary } from '../lib/api'
import { useAuth } from '../lib/auth'

const { isAdmin, ensureLoaded } = useAuth()

const posts = ref<PostSummary[]>([])
const loading = ref(true)
const error = ref('')

function go(slug: string) {
  // 详情页是 /post?s=slug。/blog/{slug} 这条老路径由 _redirects 重写到同一个页面。
  window.location.href = `/post?s=${encodeURIComponent(slug)}`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

onMounted(async () => {
  await ensureLoaded()
  try {
    posts.value = await postApi.list()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <div class="mb-2 flex items-center justify-between">
      <h1 class="text-lg font-semibold">博客</h1>
      <a
        v-if="isAdmin"
        href="/posts/admin"
        class="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        管理
      </a>
    </div>

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <p v-else-if="error" class="py-10 text-sm text-destructive">{{ error }}</p>

    <p v-else-if="!posts.length" class="py-16 text-center text-sm text-muted-foreground">
      还没有文章
    </p>

    <div v-else class="divide-y divide-border/50">
      <a
        v-for="post in posts"
        :key="post.id"
        :href="`/post?s=${encodeURIComponent(post.slug)}`"
        class="group block"
        @click.prevent="go(post.slug)"
      >
        <article class="row-action -mx-2 rounded-lg px-2 py-6 md:-mx-4 md:px-4">
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
