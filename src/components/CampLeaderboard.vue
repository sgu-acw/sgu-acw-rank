<script setup lang="ts">
import { computed, ref } from 'vue'
import { CircleCheck, Minus, Search, Trophy } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import type { CampLeaderboardEntry, Platform } from '../lib/api'

const props = defineProps<{
  entries: CampLeaderboardEntry[]
  problems: { platform: Platform | 'learn'; key: string; name?: string }[]
}>()

// 筛选参考练习榜：学院、年级、姓名/学号搜索。纯客户端过滤——榜单已经在手上了。
const college = ref('')
const year = ref<number | null>(null)
const search = ref('')

const scoredProblems = computed(() => props.problems)

const colleges = computed(() =>
  [...new Set(props.entries.map((e) => e.college_name).filter(Boolean))].sort() as string[],
)
const years = computed(() =>
  [...new Set(props.entries.map((e) => e.enroll_year).filter(Boolean))].sort((a, b) => b - a),
)

const hasFilters = computed(() => !!college.value || year.value !== null || !!search.value.trim())

const filtered = computed(() =>
  props.entries.filter((e) => {
    if (college.value && e.college_name !== college.value) return false
    if (year.value !== null && e.enroll_year !== year.value) return false
    const q = search.value.trim().toLowerCase()
    if (q && !(e.display_name.toLowerCase().includes(q) || e.student_id.includes(q))) return false
    return true
  }),
)

function clearFilters() {
  college.value = ''
  year.value = null
  search.value = ''
}
</script>

<template>
  <Card class="min-w-0">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between gap-3">
        <CardTitle class="flex items-center gap-2 text-sm"><Trophy class="h-4 w-4" />排行榜</CardTitle>
        <span class="text-xs text-muted-foreground">
          {{ hasFilters ? `${filtered.length}/${entries.length}` : entries.length }} 人
        </span>
      </div>
      <p class="text-xs text-muted-foreground" data-export-hidden>历史完成也计分；同分按学号排序。左右滑动查看每题成绩。</p>
    </CardHeader>
    <CardContent class="p-0">
      <!-- 筛选条：和练习榜同一套模式——学院、年级、搜索。导出图不带。 -->
      <div class="flex flex-wrap items-center gap-2 border-t border-border/40 px-3 py-2.5" data-export-hidden>
        <select
          v-model="college"
          class="form-select w-auto max-w-full"
          aria-label="按学院筛选"
        >
          <option value="">全部学院</option>
          <option v-for="c in colleges" :key="c" :value="c">{{ c }}</option>
        </select>
        <select
          v-model="year"
          class="form-select w-auto max-w-full"
          aria-label="按年级筛选"
        >
          <option :value="null">全部年级</option>
          <option v-for="y in years" :key="y" :value="y">{{ y }} 级</option>
        </select>
        <div class="relative min-w-0 flex-1 sm:min-w-[140px] sm:flex-none">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="search"
            type="search"
            placeholder="姓名 / 学号"
            class="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm sm:w-36"
          />
        </div>
        <button
          v-if="hasFilters"
          class="h-9 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          @click="clearFilters"
        >
          清除
        </button>
      </div>

      <p v-if="!filtered.length" class="px-6 py-8 text-sm text-muted-foreground">
        {{ entries.length ? '没有符合筛选的成员' : '暂无报名成员的成绩' }}
      </p>
      <div v-else class="overflow-x-auto border-t border-border/40" tabindex="0" role="region" aria-label="集训排行榜，可横向滚动">
        <table class="camp-leaderboard w-full whitespace-nowrap text-sm">
          <thead>
            <tr class="border-b border-border/40 text-left text-xs text-muted-foreground">
              <th class="px-3 py-3 font-medium">#</th>
              <th class="px-3 py-3 font-medium">姓名</th>
              <th class="px-3 py-3 font-medium">年级</th>
              <th class="px-3 py-3 text-right font-medium">过题</th>
              <th v-for="p in scoredProblems" :key="`${p.platform}:${p.key}`" class="px-3 py-3 text-center font-mono font-medium" :title="`${p.platform} ${p.name || p.key}`">{{ p.key }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/40">
            <tr v-for="entry in filtered" :key="entry.user_id" class="row-action">
              <td class="px-3 py-3 font-mono text-xs">{{ entry.rank }}</td>
              <td class="px-3 py-1">
                <a :href="`/member?id=${entry.user_id}`" class="inline-flex min-h-11 items-center font-medium hover:underline">{{ entry.display_name }}</a>
                <span v-if="entry.class_label" class="ml-2 text-xs text-muted-foreground">{{ entry.class_label }}</span>
              </td>
              <td class="px-3 py-3 text-xs text-muted-foreground">{{ entry.enroll_year ? `${entry.enroll_year} 级` : '—' }}</td>
              <td class="px-3 py-3 text-right font-mono font-semibold">{{ entry.solved_count }}</td>
              <td v-for="p in scoredProblems" :key="`${p.platform}:${p.key}`" class="px-3 py-3 text-center">
                <CircleCheck v-if="entry.per_problem[`${p.platform}:${p.key}`]" class="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-500" aria-label="已通过" />
                <Minus v-else class="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="未通过" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
</template>
