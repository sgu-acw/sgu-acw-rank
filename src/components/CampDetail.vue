<script setup lang="ts">
/**
 * 单次集训的详情页。
 *
 * 四种状态：
 * - 未登录：能看到名字和时间，题目排行榜不显示，提示登录
 * - 已登录未报名：显示需要哪些平台的账号，能报就显示报名按钮
 * - 已报名：题目列表 + 排行榜
 * - 管理员：始终能看题目和排行榜
 */
import { computed, onMounted, ref } from 'vue'
import {
  CircleCheck,
  Loader2,
  LogIn,
  Minus,
  Settings,
  Trophy,
} from 'lucide-vue-next'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import {
  ApiError,
  campApi,
  PLATFORM_META,
  type CampDetail,
  type Platform,
} from '../lib/api'
import { difficultyLabel } from '../lib/format'
import { useAuth } from '../lib/auth'

const { user, isAdmin, ensureLoaded } = useAuth()

const camp = ref<CampDetail | null>(null)
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const actionError = ref('')

const id = computed(() => {
  const raw = new URLSearchParams(window.location.search).get('id')
  return raw ? Number(raw) : 0
})

/** 未开始时的倒计时文案。 */
const countdown = computed(() => {
  if (!camp.value || camp.value.started) return ''
  const ms = Date.parse(camp.value.start_at) - Date.now()
  if (ms <= 0) return ''
  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(hours / 24)
  if (days >= 1) return `${days} 天后开始`
  if (hours >= 1) return `${hours} 小时后开始`
  return `${Math.max(1, Math.floor(ms / 60_000))} 分钟后开始`
})

function fmt(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function platformLabel(p: Platform): string {
  return PLATFORM_META[p]?.label ?? p
}

function go(path: string) {
  window.location.href = path
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    camp.value = await campApi.detail(id.value)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function register() {
  if (!camp.value) return
  busy.value = true
  actionError.value = ''
  try {
    await campApi.register(camp.value.id)
    await load()
  } catch (err) {
    actionError.value = err instanceof ApiError ? err.message : '报名失败'
  } finally {
    busy.value = false
  }
}

async function unregister() {
  if (!camp.value || !window.confirm('确定取消报名？')) return
  busy.value = true
  actionError.value = ''
  try {
    await campApi.unregister(camp.value.id)
    await load()
  } catch (err) {
    actionError.value = err instanceof ApiError ? err.message : '操作失败'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await ensureLoaded()
  await load()
})
</script>

<template>
  <div class="mx-auto w-full max-w-4xl space-y-4">
    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <p v-else-if="error" class="py-10 text-sm text-destructive">{{ error }}</p>

    <template v-else-if="camp">
      <!-- 头部：名字、时间、状态 -->
      <div class="space-y-1.5">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-lg font-semibold">{{ camp.name }}</h1>
          <span
            v-if="camp.ended"
            class="text-xs font-medium text-muted-foreground"
          >已结束</span>
          <span
            v-else-if="!camp.started"
            class="text-xs font-medium text-amber-600 dark:text-amber-500"
          >未开始</span>
          <span
            v-else
            class="text-xs font-medium text-emerald-600 dark:text-emerald-500"
          >进行中</span>

          <Button
            v-if="isAdmin"
            variant="ghost"
            size="sm"
            class="ml-auto h-7 gap-1 px-2 text-xs text-muted-foreground"
            @click="go('/camps/admin')"
          >
            <Settings class="h-3.5 w-3.5" />
            管理
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">
          {{ fmt(camp.start_at) }} 开放题目，{{ fmt(camp.end_at) }} 截止报名与统计
          <span v-if="countdown" class="ml-1">（{{ countdown }}）</span>
        </p>
        <p v-if="camp.description" class="text-sm text-muted-foreground">
          {{ camp.description }}
        </p>
      </div>

      <!-- 未登录：引导登录 -->
      <Card v-if="!user">
        <CardContent class="flex items-center gap-3 py-6">
          <LogIn class="h-4 w-4 shrink-0 text-muted-foreground" />
          <p class="flex-1 text-sm text-muted-foreground">登录后可以报名</p>
          <Button size="sm" @click="go('/login')">登录</Button>
        </CardContent>
      </Card>

      <!-- 已登录未报名。管理员也走这个——在前台他就是普通用户。 -->
      <Card v-else-if="!camp.registered">
        <CardContent class="space-y-3 py-6">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="text-muted-foreground">需要至少一个已验证账号：</span>
            <span
              v-for="p in camp.platforms"
              :key="p"
              class="rounded-md bg-muted px-2 py-0.5 font-mono text-xs"
            >
              {{ platformLabel(p) }}
            </span>
          </div>
          <div class="flex items-center gap-3">
            <Button
              v-if="camp.can_register"
              :disabled="busy"
              @click="register"
            >
              <Loader2 v-if="busy" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
              报名
            </Button>
            <p v-else class="text-sm text-muted-foreground">{{ camp.register_reason }}</p>
          </div>
          <p v-if="camp.can_register && camp.register_reason" class="text-xs text-muted-foreground/70">
            {{ camp.register_reason }}
          </p>
          <p v-if="!camp.can_register" class="text-xs text-muted-foreground/70">
            到「个人中心 → 平台账号」绑定并验证后再来。
          </p>
          <p v-if="actionError" class="text-sm text-destructive">{{ actionError }}</p>
        </CardContent>
      </Card>

      <!-- 已报名但还没开始 -->
      <Card v-else-if="camp.registered && !camp.started">
        <CardContent class="flex items-center gap-3 py-6">
          <CircleCheck class="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
          <p class="flex-1 text-sm text-muted-foreground">
            已报名。题目 {{ fmt(camp.start_at) }} 开放。
          </p>
          <Button variant="ghost" size="sm" :disabled="busy" @click="unregister">
            取消报名
          </Button>
        </CardContent>
      </Card>

      <!-- 题目列表（报名了或管理员才渲染） -->
      <Card v-if="camp.problems.length">
        <CardHeader class="pb-3">
          <div class="flex items-center justify-between">
            <CardTitle class="text-sm font-medium">题目</CardTitle>
            <span class="text-xs text-muted-foreground">{{ camp.problems.length }} 题</span>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <div class="divide-y divide-border/40 border-t border-border/40">
            <a
              v-for="p in camp.problems"
              :key="`${p.platform}:${p.key}`"
              :href="p.url"
              target="_blank"
              rel="noreferrer"
              class="row-action flex items-center gap-3 px-4 py-2.5"
              :class="p.done ? 'bg-emerald-500/5' : ''"
            >
              <!-- 绿色对号表示「我过了」。题单那边是同款标记。 -->
              <span
                class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]"
                :class="
                  p.done
                    ? 'border-emerald-600/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'border-border/50 text-transparent'
                "
                :title="p.done ? '已解决' : '未解决'"
              >
                ✓
              </span>
              <span class="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">
                {{ platformLabel(p.platform) }}
              </span>
              <span
                class="min-w-0 flex-1 truncate text-sm"
                :class="p.done ? 'text-emerald-700 dark:text-emerald-400' : ''"
              >
                {{ p.name || p.key }}
              </span>
              <span class="shrink-0 font-mono text-xs text-muted-foreground">{{ p.key }}</span>
              <span v-if="p.rating" class="shrink-0 font-mono text-[11px] text-muted-foreground">
                {{ difficultyLabel(p.platform, p.rating) }}
              </span>
            </a>
          </div>
        </CardContent>
      </Card>

      <!-- 排行榜 -->
      <Card v-if="camp.leaderboard.length">
        <CardHeader class="pb-3">
          <div class="flex items-center justify-between">
            <CardTitle class="flex items-center gap-1.5 text-sm font-medium">
              <Trophy class="h-4 w-4 text-muted-foreground" />
              排行榜
            </CardTitle>
            <span class="text-xs text-muted-foreground">{{ camp.leaderboard.length }} 人</span>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <div class="overflow-x-auto border-t border-border/40">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border/40 text-left text-xs text-muted-foreground">
                  <th class="w-10 px-3 py-2 text-center font-medium">#</th>
                  <th class="px-3 py-2 font-medium">姓名</th>
                  <th class="px-3 py-2 text-right font-medium">过题</th>
                  <th
                    v-for="p in camp.problems"
                    :key="p.key"
                    class="px-2 py-2 text-center font-mono text-[10px] font-medium"
                    :title="`${p.platform}:${p.key}${p.name ? ` — ${p.name}` : ''}`"
                  >
                    {{ p.key }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/40">
                <tr
                  v-for="entry in camp.leaderboard"
                  :key="entry.user_id"
                  class="row-action"
                >
                  <td
                    class="px-3 py-2.5 text-center font-mono text-xs"
                    :class="entry.rank <= 3 ? 'font-semibold text-foreground' : 'text-muted-foreground'"
                  >
                    {{ entry.rank }}
                  </td>
                  <td class="px-3 py-2.5">
                    <button
                      class="font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
                      @click="go(`/member?id=${entry.user_id}`)"
                    >
                      {{ entry.display_name }}
                    </button>
                    <span
                      v-if="entry.class_label"
                      class="ml-1.5 text-[11px] text-muted-foreground/70"
                    >
                      {{ entry.class_label }}
                    </span>
                  </td>
                  <td class="px-3 py-2.5 text-right font-mono font-semibold">
                    {{ entry.solved_count }}
                  </td>
                  <td
                    v-for="p in camp.problems"
                    :key="p.key"
                    class="px-2 py-2.5 text-center"
                  >
                    <CircleCheck
                      v-if="entry.per_problem[`${p.platform}:${p.key}`]"
                      class="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-500"
                    />
                    <Minus v-else class="mx-auto h-4 w-4 text-muted-foreground/30" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p v-if="camp.ended" class="text-xs text-muted-foreground/60">
        已截止，榜单为最终结果
      </p>
    </template>
  </div>
</template>
