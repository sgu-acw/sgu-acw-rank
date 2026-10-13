<script setup lang="ts">
/**
 * 成员资料里「仅管理员可见」的那一段。
 *
 * 它回答的不是「这个人是谁」，而是**「这个人为什么没数据」**。常见的三种
 * 原因，从公开信息里都看不出来：
 *
 * * 账号还没验证通过（验证码没填对，或者压根没去填）
 * * 平台抓取一直失败（平台改版、账号注销、被限流）
 * * 人本来就不做题了（看最后一次做题是哪天）
 *
 * 所以这一块是按「排查」组织信息的，而不是把所有字段摊开。
 */
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { PLATFORM_META, adminApi, ApiError, type AdminMemberDetail } from '../lib/api'

const props = defineProps<{ userId: number }>()

const data = ref<AdminMemberDetail | null>(null)
const loading = ref(true)
const error = ref('')

/** 把 ISO 时间显示成「3 小时前」这种。抓取时间看相对值比看绝对时间有用。 */
function ago(iso: string | null): string {
  if (!iso) return '从未'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return '刚刚'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天前`
  return `${Math.round(days / 30)} 个月前`
}

function dateOnly(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

/**
 * 这个账号有没有问题。
 *
 * 返回一个短语，没问题时返回空串。判断顺序按「有多影响数据」排：
 * 没验证 > 连续失败 > 很久没抓到新题。
 */
function problemOf(account: AdminMemberDetail['accounts'][number]): string {
  if (!account.verified_at) {
    return account.verify_attempts > 0
      ? `未验证，已尝试 ${account.verify_attempts} 次`
      : '未验证'
  }
  if (account.sync_flag === 'privacy') return '开了隐私保护'
  if (account.sync_flag === 'unverified') return '未实名'
  if (account.consecutive_failures > 0) {
    return `连续 ${account.consecutive_failures} 次抓取失败`
  }
  if (!account.solved_fetched_at) return '从未抓取过'
  return ''
}

/** 距离上次抓到新题多少天了。用来判断人是不是掉队了。 */
const idleDays = computed(() => {
  const last = data.value?.last_practice_date
  if (!last) return null
  const diff = Date.now() - new Date(last).getTime()
  return Math.floor(diff / 86400000)
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await adminApi.memberDetail(props.userId)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '读取失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <!--
    就是一张普通卡片，不加边框线也不加额外颜色。
    「这是管理员专属」由标题旁边那个标签说明就够了——用颜色或边框去强调，
    要么浅色主题下看不见，要么看起来像出错了。
  -->
  <Card>
    <CardHeader class="pb-3">
      <div class="flex flex-wrap items-center gap-2">
        <CardTitle class="text-sm font-medium">管理员信息</CardTitle>
        <!-- 明确标出来，避免截图分享时把内部信息带出去 -->
        <span class="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          仅管理员可见
        </span>
      </div>
    </CardHeader>

    <CardContent class="space-y-4">
      <div v-if="loading" class="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin" />
        正在读取…
      </div>

      <p v-else-if="error" class="text-sm text-destructive">{{ error }}</p>

      <template v-else-if="data">
        <!-- 一眼看的数字 -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p class="text-[11px] text-muted-foreground">总过题数</p>
            <p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">
              {{ data.total_solved }}
            </p>
          </div>
          <div>
            <p class="text-[11px] text-muted-foreground">近 30 天活跃</p>
            <p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">
              {{ data.active_days_30 }}
              <span class="text-xs font-normal text-muted-foreground">天</span>
            </p>
          </div>
          <!--
            「几天前」放在日期下面一行，而不是跟在后面。

            跟在后面时内容太长会折行，把这一格撑高，四个格子的值就不在
            同一水平线上了。分两行是固定的，多长都不会挤。
          -->
          <div>
            <p class="text-[11px] text-muted-foreground">最后一次做题</p>
            <p class="mt-0.5 font-mono text-sm font-medium tabular-nums">
              {{ data.last_practice_date ?? '没有记录' }}
            </p>
            <p v-if="idleDays !== null" class="text-[11px] text-muted-foreground">
              {{ idleDays }} 天前
            </p>
          </div>
          <div>
            <p class="text-[11px] text-muted-foreground">同步异常</p>
            <p
              class="mt-0.5 text-sm font-medium"
              :class="data.failing_accounts > 0 && 'text-destructive'"
            >
              {{ data.failing_accounts > 0 ? `${data.failing_accounts} 个账号` : '正常' }}
            </p>
          </div>
        </div>

        <!-- 掉队提醒。只提示，不评价。 -->
        <p
          v-if="idleDays !== null && idleDays >= 14"
          class="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>已经 {{ idleDays }} 天没做题了。</span>
        </p>

        <!-- 账号同步状态 -->
        <div class="space-y-2">
          <p class="text-xs font-medium">账号同步状态</p>
          <p v-if="!data.accounts.length" class="text-xs text-muted-foreground">
            还没有绑定平台账号
          </p>
          <div v-else class="divide-y divide-border/40 rounded-md border border-border/40">
            <div
              v-for="account in data.accounts"
              :key="account.id"
              class="space-y-1 px-3 py-2.5"
            >
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="text-xs font-medium">
                  {{ PLATFORM_META[account.platform]?.label ?? account.platform }}
                </span>
                <span class="font-mono text-[11px] text-muted-foreground">
                  {{ account.identifier }}
                </span>

                <!-- 有没有问题，一眼看出来 -->
                <span
                  v-if="problemOf(account)"
                  class="inline-flex items-center gap-0.5 rounded border border-destructive/40 px-1.5 py-0.5 text-[10px] text-destructive"
                >
                  <AlertCircle class="h-2.5 w-2.5" />
                  {{ problemOf(account) }}
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-0.5 rounded border border-emerald-600/30 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-500"
                >
                  <CheckCircle2 class="h-2.5 w-2.5" />
                  正常
                </span>

                <span class="ml-auto font-mono text-[11px] text-muted-foreground">
                  {{ account.solved_count }} 题
                </span>
              </div>

              <div class="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground/80">
                <span>验证：{{ account.verified_at ? '已通过' : '未通过' }}</span>
                <span>Rating 抓取：{{ ago(account.rating_fetched_at) }}</span>
                <span>过题抓取：{{ ago(account.solved_fetched_at) }}</span>
                <span>最近新增：{{ ago(account.last_active_at) }}</span>
                <span v-if="account.rating">Rating：{{ account.rating }}</span>
                <span>活跃 {{ account.active_days }} 天</span>
              </div>

              <p v-if="account.last_error" class="text-[11px] text-destructive">
                最近错误：{{ account.last_error }}
              </p>
            </div>
          </div>
        </div>

        <!-- 账号本身的信息 -->
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>最后登录：{{ ago(data.last_login_at) }}</span>
          <span>注册于：{{ dateOnly(data.created_at) }}</span>
          <span>账号状态：{{ data.status === 'disabled' ? '已停用' : '在用' }}</span>
        </div>

        <div>
          <p class="text-[11px] text-muted-foreground">管理员备注</p>
          <p class="mt-0.5 text-xs">
            {{ data.admin_note || '（空）' }}
          </p>
          <p class="mt-1 text-[10px] text-muted-foreground/60">
            备注在「管理」页改
          </p>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
