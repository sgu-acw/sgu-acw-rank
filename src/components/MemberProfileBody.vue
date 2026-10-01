<script setup lang="ts">
/**
 * 成员资料的内容。被两个地方复用：
 *
 * * `/member?id=N` 页面
 * * 练习榜里点名字弹出的窗口
 *
 * 弹窗那条路径会传 ``entry`` 进来——榜单里已经有这个人的姓名、学院、每日
 * 明细了，没必要再拉一遍整个榜单。只有直接开页面时才需要自己取。
 */
import { computed, ref, watch } from 'vue'
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
  type PracticeEntry,
} from '../lib/api'
import { formatEnrollYear } from '../lib/format'

const props = withDefaults(
  defineProps<{
    userId: number
    /** 榜单里已加载的那一行。有它就不必再拉榜单。 */
    entry?: PracticeEntry | null
  }>(),
  { entry: null },
)

interface MemberInfo {
  id: number
  display_name: string
  student_id: string
  enroll_year: number
  college_code: string
  major_code: string
  college_name: string | null
  major_name: string | null
  class_label: string | null
  role: string
}

const loading = ref(true)
const error = ref('')
const member = ref<MemberInfo | null>(null)
const accounts = ref<PlatformAccount[]>([])
/** 自己拉到的榜单行。传了 entry 的话这里一直是空。 */
const fetchedEntry = ref<PracticeEntry | null>(null)

const trend = computed(() => props.entry ?? fetchedEntry.value)

const maxDaily = computed(() => {
  const entry = trend.value
  if (!entry) return 1
  return Math.max(1, ...entry.days.map((d) => d.count))
})

/** 平台账号的站内主页。各平台路径不同，统一在这里映射。 */
function profileUrl(account: PlatformAccount): string | null {
  switch (account.platform) {
    case 'codeforces':
      return `https://codeforces.com/profile/${account.identifier}`
    case 'atcoder':
      return `https://atcoder.jp/users/${account.identifier}`
    case 'luogu':
      return `https://www.luogu.com.cn/user/${account.identifier}`
    case 'nowcoder':
      return `https://ac.nowcoder.com/acm/contest/profile/${account.identifier}`
    default:
      return null
  }
}

async function load(id: number) {
  if (!id) {
    error.value = '缺少成员编号'
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''
  try {
    // 账号必须单独取；榜单行可能已经由调用方给了。
    const requests: [Promise<MemberInfo>, Promise<PlatformAccount[]>] = [
      api.get<MemberInfo>(`/users/${id}`),
      accountsApi.of(id),
    ]
    const [info, accountList] = await Promise.all(requests)
    member.value = info
    accounts.value = accountList

    if (!props.entry) {
      const rank = await practiceApi.rank({ days: 30 })
      fetchedEntry.value = rank.entries.find((e) => e.user_id === id) ?? null
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

watch(() => props.userId, load, { immediate: true })
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
      <div class="flex flex-wrap items-baseline gap-2">
        <span class="text-lg font-semibold tracking-tight">{{ member.display_name }}</span>
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

      <p
        v-if="member.college_name || member.major_name || member.class_label"
        class="text-xs text-muted-foreground"
      >
        {{ [member.college_name, member.major_name, member.class_label].filter(Boolean).join(' · ') }}
      </p>

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
                v-if="profileUrl(account)"
                :href="profileUrl(account)!"
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
            <span v-if="trend" class="text-xs text-muted-foreground">共 {{ trend.total }} 题</span>
          </div>
        </CardHeader>
        <CardContent>
          <div v-if="!trend" class="text-sm text-muted-foreground">这 30 天没有记录。</div>
          <template v-else>
            <div class="flex items-end gap-0.5" style="height: 48px">
              <span
                v-for="day in trend.days"
                :key="day.date"
                class="flex-1 rounded-sm transition-all duration-150 hover:bg-primary"
                :class="day.count > 0 ? 'bg-primary/70' : 'bg-muted'"
                :style="{
                  height: day.count > 0 ? `${Math.max(4, (day.count / maxDaily) * 48)}px` : '2px',
                }"
                :title="`${day.date}：${day.count} 题`"
              />
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              {{ trend.days[0].date }} ~ {{ trend.days[trend.days.length - 1].date }}
            </p>
          </template>
        </CardContent>
      </Card>

      <Separator />
      <p class="text-xs text-muted-foreground">练习数据由后台定时同步，不是实时值。</p>
    </template>
  </div>
</template>
