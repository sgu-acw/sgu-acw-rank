<script setup lang="ts">
/**
 * 首页的个人数据面板。
 *
 * 所有数字一次请求拿齐（/practice/dashboard），避免开好几个口子各自加载、
 * 各自闪一下。
 *
 * 未登录时显示引导，而不是空白或报错——首页是站点的门面，第一眼不该是
 * 一个错误提示。
 */
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, BarChart3, Loader2, LogIn } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { ApiError, practiceApi, type Dashboard } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatEnrollYear } from '../lib/format'
import WorkshopStatusCard from './WorkshopStatusCard.vue'
import DailyProblem from './DailyProblem.vue'

const { user, ensureLoaded } = useAuth()

const loading = ref(true)
const error = ref('')
const data = ref<Dashboard | null>(null)

const maxDaily = computed(() => {
  if (!data.value) return 1
  return Math.max(1, ...data.value.days.map((d) => d.count))
})

/** 最近 14 天画成柱状图，30 天在小屏上太密。 */
const recentDays = computed(() => data.value?.days.slice(-14) ?? [])

function go(path: string) {
  window.location.href = path
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await practiceApi.dashboard()
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      data.value = null
    } else {
      error.value = err instanceof ApiError ? err.message : '加载失败'
    }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await ensureLoaded()
  await load()
})
</script>

<template>
  <div class="space-y-4">
    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <!-- 未登录：工作坊状态 + 引导。状态是公开信息，不登录也该看得到。 -->
    <template v-else-if="!user">
      <DailyProblem />
      <WorkshopStatusCard />
      <Card class="py-10 text-center">
        <CardContent>
          <Button @click="go('/login')">
            <LogIn class="mr-2 h-4 w-4" />
            登录后查看练习数据
          </Button>
        </CardContent>
      </Card>
    </template>

    <template v-else>
      <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
        <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
        <span class="text-sm">{{ error }}</span>
      </Alert>

      <div v-if="data" class="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
        <section class="min-w-0 space-y-4">
        <!--
          抬头。只留姓名。

          原来这里还有一行「练习日 X · 凌晨 4 点换天」和一个刷新按钮。
          练习日属于口径说明，不该占首页一行的位置；刷新是低频运维动作，
          放在首页会让人以为需要经常手动同步，已移除。
        -->
        <div>
          <h1 class="text-xl font-semibold tracking-tight">
            {{ user.display_name }}
            <span v-if="formatEnrollYear(user.enroll_year)" class="ml-1.5 text-sm font-normal text-muted-foreground">
              {{ formatEnrollYear(user.enroll_year) }}
            </span>
          </h1>
        </div>

        <!--
          今天的主线。

          不另外套一层卡：DailyProblem compact 自己就是一块带标题的区域，
          外面再包一层会出现两个标题。它自己的标题在 compact 下已经加重，
          这里不再加一行 kicker，免得两个标签互相打架。
        -->
        <DailyProblem compact />

        <!-- 今日/近况汇总。四个数字放在一张卡里，用分隔线切分。 -->
        <Card>
          <CardContent class="grid grid-cols-2 divide-y divide-border/40 p-0 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <div v-for="stat in [
              { label: '今日完成', value: data.today },
              { label: '最近 7 天', value: data.week },
              { label: '最近 30 天', value: data.total },
            ]" :key="stat.label" class="px-5 py-4">
              <p class="text-xs text-muted-foreground">{{ stat.label }}</p>
              <p class="mt-1.5 font-mono text-2xl font-semibold tabular-nums">{{ stat.value }}</p>
            </div>

            <div class="px-5 py-4">
              <p class="text-xs text-muted-foreground">7 天排名</p>
              <p class="mt-1.5 font-mono text-2xl font-semibold tabular-nums">
                <template v-if="data.practice_rank">
                  {{ data.practice_rank }}
                  <span class="text-sm font-normal text-muted-foreground">/ {{ data.practice_total }}</span>
                </template>
                <span v-else class="text-base font-normal text-muted-foreground">未上榜</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- 趋势 -->
        <Card>
          <CardHeader class="pb-3">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2 text-sm font-medium">
                <BarChart3 class="h-4 w-4 text-muted-foreground" />
                最近 14 天
              </CardTitle>
              <a href="/practice" class="text-xs text-muted-foreground transition-colors hover:text-primary">
                看完整榜单 →
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div class="flex items-end gap-1" style="height: 64px">
              <span
                v-for="day in recentDays"
                :key="day.date"
                class="flex-1 rounded-sm transition-colors"
                :class="day.count > 0 ? 'bg-primary/70 hover:bg-primary' : 'bg-muted hover:bg-muted-foreground/30'"
                :style="{
                  height: day.count > 0 ? `${Math.max(5, (day.count / maxDaily) * 64)}px` : '2px',
                }"
                :title="`${day.date}：${day.count} 题`"
              />
            </div>
            <div v-if="recentDays.length" class="mt-1.5 flex justify-between text-[10px] text-muted-foreground/60">
              <span>{{ recentDays[0].date.slice(5) }}</span>
              <span>{{ recentDays[recentDays.length - 1].date.slice(5) }}</span>
            </div>
          </CardContent>
        </Card>
        </section>

        <aside class="min-w-0 space-y-4">
          <WorkshopStatusCard />

          <!-- 平台账号状态收进侧栏，不再与每日训练主线争夺注意力。 -->
          <Card>
            <CardHeader class="pb-3">
              <div class="flex items-center justify-between">
                <CardTitle class="text-sm font-medium">平台账号</CardTitle>
                <a href="/me" class="text-xs text-muted-foreground transition-colors hover:text-primary">
                  管理 →
                </a>
              </div>
            </CardHeader>
            <CardContent class="p-0">
            <div v-if="!data.accounts.length" class="p-4 text-sm text-muted-foreground">
              暂无已绑定账号
            </div>
            <div v-else class="divide-y divide-border/40">
              <div
                v-for="account in data.accounts"
                :key="`${account.platform}-${account.identifier}`"
                class="flex flex-wrap items-center gap-2 px-4 py-2.5"
              >
                <span class="text-sm font-medium">{{ account.label }}</span>
                <span class="font-mono text-xs text-muted-foreground">{{ account.identifier }}</span>
                <span
                  v-if="account.rating"
                  class="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {{ account.rating }}
                  <span v-if="account.max_rating && account.max_rating !== account.rating" class="text-muted-foreground">
                    / {{ account.max_rating }}
                  </span>
                </span>
                <span
                  v-if="!account.verified"
                  class="rounded border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  待验证
                </span>
              </div>
            </div>
          </CardContent>
          </Card>
        </aside>
      </div>
    </template>
  </div>
</template>
