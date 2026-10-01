<script setup lang="ts">
/**
 * 成员资料页。
 *
 * 展示某个人的平台账号与最近的练习趋势。数据来自已有的接口，不需要新增
 * 后端能力：账号走 /accounts/of/{id}，练习走 /practice/rank 后按人筛出。
 */
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Separator } from './ui/separator'
import {
  ApiError,
  PLATFORM_META,
  accountsApi,
  api,
  practiceApi,
  type PlatformAccount,
  type PracticeRank,
} from '../lib/api'
import { formatEnrollYear } from '../lib/format'

const props = withDefaults(defineProps<{ userId?: number }>(), { userId: 0 })

interface MemberInfo {
  id: number
  display_name: string
  student_id: string
  enroll_year: number
  college_code: string
  major_code: string
  role: string
}

const loading = ref(true)
const error = ref('')
const member = ref<MemberInfo | null>(null)
const accounts = ref<PlatformAccount[]>([])
const practice = ref<PracticeRank | null>(null)

/** 从查询参数取成员 id。
 *
 * 页面是静态输出的，用不了 /member/3 这种路径——构建时不知道有哪些 id。
 * 所以走 ?id=3。服务端渲染时没有 window，读不到就当作无效。
 */
const userId = ref(props.userId || 0)

/** 这个人在榜单里的那一行，用来取每日明细。 */
const trend = computed(() => {
  if (!practice.value) return null
  return practice.value.entries.find((e) => e.user_id === userId.value) ?? null
})

const maxDaily = computed(() => {
  const entry = trend.value
  if (!entry) return 1
  return Math.max(1, ...entry.days.map((d) => d.count))
})

async function load() {
  if (!userId.value) {
    error.value = '缺少成员编号'
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''
  try {
    const [info, accountList, rank] = await Promise.all([
      api.get<MemberInfo>(`/users/${userId.value}`),
      accountsApi.of(userId.value),
      practiceApi.rank({ days: 30 }),
    ])
    member.value = info
    accounts.value = accountList
    practice.value = rank
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 挂载后才能读地址栏。
  const fromQuery = new URLSearchParams(window.location.search).get('id')
  if (fromQuery) userId.value = Number(fromQuery)
  load()
})
</script>

<template>
  <div class="space-y-4">
    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>

    <div v-if="loading" class="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <template v-else-if="member">
      <Card>
        <CardHeader class="pb-3">
          <div class="flex flex-wrap items-baseline gap-2">
            <CardTitle class="text-lg">{{ member.display_name }}</CardTitle>
            <span class="font-mono text-xs text-muted-foreground">{{ member.student_id }}</span>
            <span v-if="formatEnrollYear(member.enroll_year)" class="text-xs text-muted-foreground">
              {{ formatEnrollYear(member.enroll_year) }}
            </span>
            <span
              class="rounded border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {{ member.role === 'admin' ? '管理员' : member.role === 'root' ? 'root' : '成员' }}
            </span>
          </div>
        </CardHeader>
      </Card>

      <!-- 平台账号 -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium">平台账号</CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <div v-if="!accounts.length" class="p-4 text-sm text-muted-foreground">
            还没有绑定任何平台账号。
          </div>
          <div v-else class="divide-y divide-border/40">
            <div
              v-for="account in accounts"
              :key="account.id"
              class="flex flex-wrap items-center gap-2 px-4 py-2.5"
            >
              <span class="text-sm font-medium">{{ PLATFORM_META[account.platform].label }}</span>
              <span class="font-mono text-xs text-muted-foreground">{{ account.identifier }}</span>
              <a
                v-if="account.platform === 'codeforces'"
                :href="`https://codeforces.com/profile/${account.identifier}`"
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
              >
                主页
                <ExternalLink class="h-3 w-3" />
              </a>
              <a
                v-else-if="account.platform === 'atcoder'"
                :href="`https://atcoder.jp/users/${account.identifier}`"
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
              >
                主页
                <ExternalLink class="h-3 w-3" />
              </a>
              <a
                v-else-if="account.platform === 'luogu'"
                :href="`https://www.luogu.com.cn/user/${account.identifier}`"
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
              >
                主页
                <ExternalLink class="h-3 w-3" />
              </a>
              <a
                v-else-if="account.platform === 'nowcoder'"
                :href="`https://ac.nowcoder.com/acm/contest/profile/${account.identifier}`"
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
              >
                主页
                <ExternalLink class="h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 最近 30 天练习 -->
      <Card>
        <CardHeader class="pb-3">
          <div class="flex items-baseline justify-between">
            <CardTitle class="text-sm font-medium">最近 30 天练习</CardTitle>
            <span v-if="trend" class="text-xs text-muted-foreground">
              共 {{ trend.total }} 题
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div v-if="!trend" class="text-sm text-muted-foreground">
            这 30 天没有记录。
          </div>
          <div v-else class="flex items-end gap-0.5" style="height: 48px">
            <span
              v-for="day in trend.days"
              :key="day.date"
              class="flex-1 rounded-sm"
              :class="day.count > 0 ? 'bg-primary/70' : 'bg-muted'"
              :style="{
                height: day.count > 0 ? `${Math.max(4, (day.count / maxDaily) * 48)}px` : '2px',
              }"
              :title="`${day.date}：${day.count} 题`"
            />
          </div>
          <p v-if="trend" class="mt-2 text-xs text-muted-foreground">
            {{ trend.days[0].date }} ~ {{ trend.days[trend.days.length - 1].date }}
          </p>
        </CardContent>
      </Card>

      <Separator />
      <p class="text-xs text-muted-foreground">
        练习数据由后台定时同步，不是实时值。
      </p>
    </template>
  </div>
</template>
