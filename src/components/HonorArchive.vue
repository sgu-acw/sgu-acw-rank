<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ChevronRight, ExternalLink, Search, Trophy } from 'lucide-vue-next'
import { ApiError } from '../lib/api'
import { HONOR_FAMILIES, honorDate, honorsApi, type HonorAward } from '../lib/honors'
import { groupHonorContests, type HonorContestGroup } from '../lib/honorGroups'
import { contestHeading, contestMeta, honorCategory, medalKind, type MedalKind } from '../lib/honorPresentation'
import HonorMedal from './HonorMedal.vue'
import ActionNotice from './ui/ActionNotice.vue'
import RefreshButton from './ui/RefreshButton.vue'
import { Button } from './ui/button'
import { Input } from './ui/input'

const props = defineProps<{ userId?: number }>()
const records = ref<HonorAward[]>([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const family = ref('')
const year = ref('')
const medal = ref<MedalKind | ''>('')
const medals = [
  { key: 'gold', label: '金奖 / 一等奖', award: '金奖' },
  { key: 'silver', label: '银奖 / 二等奖', award: '银奖' },
  { key: 'bronze', label: '铜奖 / 三等奖', award: '铜奖' },
  { key: 'honorable', label: '其他奖项', award: '优秀奖' },
] as const
let sequence = 0
const years = computed(() =>
  [...new Set(records.value.map((r) => r.event.occurred_on?.slice(0, 4)).filter(Boolean))]
    .sort().reverse()
)
const matching = computed(() => records.value.filter((r) =>
  (!family.value || r.event.family === family.value) &&
  (!year.value || r.event.occurred_on?.startsWith(year.value)) &&
  (!search.value.trim() || [r.event.title, r.team, r.award, ...r.recipients.map((p) => p.name)]
    .join(' ').toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))
))
const filtered = computed(() => matching.value.filter((r) => !medal.value || medalKind(r.award) === medal.value))
const medalCounts = computed(() => matching.value.reduce((counts, row) => {
  counts[medalKind(row.award)]++
  return counts
}, { gold: 0, silver: 0, bronze: 0, honorable: 0 }))
const availableMedals = computed(() => medals.filter((m) => medalCounts.value[m.key] || medal.value === m.key))
const expandedContests = ref(new Set<string>())
const groups = computed(() => {
  const grouped = new Map<string, HonorContestGroup[]>()
  for (const contest of groupHonorContests(filtered.value)) {
    const key = contest.event.occurred_on?.slice(0, 4) || '日期待补'
    grouped.set(key, [...(grouped.get(key) || []), contest])
  }
  return [...grouped].sort(([a], [b]) => b.localeCompare(a)).map(([year, contests]) => ({
    year, contests, count: contests.reduce((total, contest) => total + contest.count, 0),
  }))
})
function contestMedals(contest: HonorContestGroup) {
  return medals.map((medal) => ({
    ...medal,
    count: contest.rows.reduce((total, row) => total + (medalKind(row.award) === medal.key ? row.count : 0), 0),
  })).filter((medal) => medal.count)
}
function contestSubtitle(contest: HonorContestGroup) {
  const stages = [...new Set(contest.rows.map((row) => contestMeta(row.event).split(' · ')[0]).filter(Boolean))]
  return stages.length === 1 ? stages[0] : ''
}
function toggleContest(key: string, event: Event) {
  // Search reveals every matching result; browsing keeps manually opened groups.
  if (search.value.trim()) return
  if ((event.currentTarget as HTMLElement).hasAttribute('open')) expandedContests.value.add(key)
  else expandedContests.value.delete(key)
}
function clearFilters() { search.value = family.value = year.value = medal.value = '' }
async function load(clear = false) {
  const request = ++sequence
  if (clear) records.value = []
  loading.value = true
  error.value = ''
  try {
    const rows = props.userId === undefined ? await honorsApi.list() : await honorsApi.user(props.userId)
    if (request === sequence) records.value = rows
  } catch (e) {
    if (request === sequence) error.value = e instanceof ApiError ? e.message : '读取获奖记录失败'
  } finally {
    if (request === sequence) loading.value = false
  }
}
watch(() => props.userId, () => { expandedContests.value.clear(); clearFilters(); load(true) }, { immediate: true })
onUnmounted(() => { sequence++ })
</script>

<template>
  <section class="honor-archive min-w-0" :class="userId !== undefined && 'personal'" aria-label="历史获奖记录" :aria-busy="loading">
    <header class="mb-6 flex items-center justify-between gap-4">
      <h2 class="flex items-center gap-2.5 text-xl font-semibold">
        <Trophy class="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        {{ userId === undefined ? '荣誉殿堂' : '历史获奖记录' }}
        <span v-if="records.length" class="ml-1 text-sm font-normal tabular-nums text-muted-foreground">{{ records.length }} 项</span>
      </h2>
      <RefreshButton :busy="loading" @click="load()" />
    </header>
    <template v-if="userId === undefined">
      <div class="mb-3 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_180px_140px]">
        <div class="relative col-span-2 min-w-0 sm:col-span-1">
          <Search class="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input v-model="search" class="pl-10 text-base sm:text-sm" aria-label="搜索姓名、队伍或赛事" placeholder="搜索姓名、队伍或赛事" />
        </div>
        <select v-model="family" class="form-select min-w-0" aria-label="赛事">
          <option value="">全部赛事</option>
          <option v-for="(name, key) in HONOR_FAMILIES" :key="key" :value="key">{{ name }}</option>
        </select>
        <select v-model="year" class="form-select min-w-0" aria-label="年份">
          <option value="">全部年份</option>
          <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
      <div class="mb-6 flex flex-wrap items-center gap-1" aria-label="按奖项筛选">
        <Button variant="ghost" class="choice-button gap-2 rounded-full px-3" :aria-pressed="medal === ''" @click="medal = ''">
          全部<span class="tabular-nums text-muted-foreground">{{ matching.length }}</span>
        </Button>
        <Button v-for="item in availableMedals" :key="item.key" variant="ghost" class="choice-button gap-1 rounded-full px-2.5"
          :aria-label="`${item.label}：${medalCounts[item.key]} 项`" :title="item.label" :aria-pressed="medal === item.key"
          @click="medal = medal === item.key ? '' : item.key">
          <HonorMedal :award="item.award" compact />
          <span class="tabular-nums">{{ medalCounts[item.key] }}</span>
        </Button>
      </div>
    </template>
    <ActionNotice :message="error" variant="error" />
    <p v-if="loading && !records.length" class="py-12 text-center text-sm text-muted-foreground" role="status">正在读取获奖记录…</p>
    <div v-else-if="(!error || records.length) && !filtered.length" class="rounded-lg border border-dashed px-4 py-12 text-center">
      <Trophy class="mx-auto mb-3 h-7 w-7 text-muted-foreground" aria-hidden="true" />
      <p class="text-sm text-muted-foreground">{{ records.length ? '没有找到相关荣誉' : '暂无获奖记录' }}</p>
      <Button v-if="records.length" variant="outline" class="mt-4" @click="clearFilters">清除筛选</Button>
    </div>
    <div v-else-if="filtered.length" class="space-y-8">
      <section v-for="group in groups" :key="group.year" class="honor-year-group" :aria-label="`${group.year} 年获奖`">
        <h3 class="year-label"><span>{{ group.year }}</span><span class="year-count">{{ group.count }} 项</span></h3>
        <div class="honor-contests min-w-0">
          <details v-for="contest in group.contests" :key="contest.key" class="honor-contest"
            :open="!!search.trim() || expandedContests.has(contest.key)" @toggle="toggleContest(contest.key, $event)">
            <summary class="contest-summary" :aria-label="`${contestHeading(contest.event)}，${contestSubtitle(contest)}，${honorDate(contest.event)}，${contest.count} 项获奖`">
              <div class="contest-overview min-w-0">
                <h4>{{ contestHeading(contest.event) }}</h4>
                <p v-if="contestSubtitle(contest)">{{ contestSubtitle(contest) }}</p>
              </div>
              <div class="contest-stats">
                <span class="contest-count">{{ contest.count }} 项</span>
                <span v-for="item in contestMedals(contest)" :key="item.key" class="medal-total" :aria-label="`${item.label} ${item.count} 项`">
                  <HonorMedal :award="item.award" compact /><span>{{ item.count }}</span>
                </span>
              </div>
              <time class="honor-date" :datetime="contest.event.occurred_on || undefined">{{ contest.event.date_precision === 'day' && contest.event.occurred_on ? honorDate(contest.event).slice(5) : honorDate(contest.event) }}</time>
              <ChevronRight class="contest-chevron h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </summary>
            <div class="contest-content">
              <p class="contest-full-title">{{ contest.event.title }}</p>
              <div class="honor-rows">
                <article v-for="row in contest.rows" :key="row.id" class="honor-row">
                  <HonorMedal :award="row.award" />
                  <div class="row-category min-w-0">
                    <h5>{{ row.team || honorCategory(row.event.category) || contestHeading(row.event) }}</h5>
                    <p v-if="row.team && honorCategory(row.event.category)">{{ honorCategory(row.event.category) }}</p>
                  </div>
                  <div class="recipients min-w-0"><span v-for="(recipient, index) in row.recipients" :key="index">{{ recipient.name }}</span></div>
                  <a :href="row.source_url" target="_blank" rel="noopener noreferrer" class="source-link"
                    :aria-label="`查看${row.team || honorCategory(row.event.category) || contestHeading(row.event)}${row.award}获奖来源`" title="查看获奖来源">
                    <ExternalLink class="h-4 w-4" aria-hidden="true" />
                  </a>
                </article>
              </div>
            </div>
          </details>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.honor-archive { container-type: inline-size; }
.honor-year-group { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 24px; }
.year-label { display: flex; flex-direction: column; gap: 4px; padding-top: 20px; font-variant-numeric: tabular-nums; }
.year-label > span:first-child { font-size: 28px; font-weight: 600; line-height: 36px; letter-spacing: -0.04em; }
.year-count { font-size: 13px; font-weight: 400; color: hsl(var(--muted-foreground)); }
.honor-contests { border-top: 1px solid hsl(var(--border)); }
.honor-contest { border-bottom: 1px solid hsl(var(--border) / .65); }
.contest-summary { display: grid; grid-template-columns: minmax(0, 1fr) auto 58px 18px; align-items: center; gap: 20px; min-height: 88px; padding: 18px 8px; cursor: pointer; list-style: none; border-radius: 6px; transition: background-color 150ms var(--ease-out); }
.contest-summary::-webkit-details-marker { display: none; }
.contest-summary:hover { background: hsl(var(--muted) / .45); }
.contest-summary:focus-visible, .source-link:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 3px; }
.contest-overview h4 { font-size: 16px; line-height: 1.5; font-weight: 600; overflow-wrap: anywhere; }
.contest-overview p { margin-top: 3px; font-size: 13px; line-height: 1.55; color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.contest-stats { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13px; font-variant-numeric: tabular-nums; }
.contest-count { color: hsl(var(--muted-foreground)); margin-right: 2px; white-space: nowrap; }
.medal-total { display: inline-flex; align-items: center; gap: 2px; }
.honor-date { font-size: 13px; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; text-align: right; }
.contest-chevron { transition: transform 180ms var(--ease-out); }
.honor-contest[open] > .contest-summary .contest-chevron { transform: rotate(90deg); }
.honor-contest[open] > .contest-summary { background: hsl(var(--muted) / .3); }
.contest-content { padding: 0 20px 12px; }
.contest-full-title { padding: 16px 0 8px; font-size: 13px; line-height: 1.65; color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.honor-row { display: grid; grid-template-columns: 44px minmax(140px, 220px) minmax(0, 1fr) 44px; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px dashed hsl(var(--border) / .65); }
.honor-row:last-child { border-bottom: 0; }
.row-category h5 { font-size: 14px; font-weight: 500; line-height: 1.65; overflow-wrap: anywhere; }
.row-category p { margin-top: 3px; font-size: 13px; line-height: 1.55; color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.recipients { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.source-link { display: inline-flex; width: 44px; height: 44px; align-items: center; justify-content: center; color: hsl(var(--muted-foreground)); border-radius: 6px; }
.source-link:hover { background: hsl(var(--muted) / .65); color: hsl(var(--foreground)); }
.personal .honor-year-group { grid-template-columns: 64px minmax(0,1fr); gap: 12px; }
.personal .year-label > span:first-child { font-size: 22px; }
@container (max-width: 760px) {
  .honor-year-group, .personal .honor-year-group { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .year-label { flex-direction: row; align-items: baseline; gap: 10px; padding-top: 0; }
  .year-label > span:first-child { font-size: 24px; line-height: 30px; }
  .contest-summary { grid-template-columns: minmax(0, 1fr) auto 18px; gap: 8px 12px; padding: 16px 8px; }
  .contest-overview { grid-column: 1; grid-row: 1; }
  .contest-stats { grid-column: 1 / span 2; grid-row: 2; gap: 8px; }
  .honor-date { grid-column: 2; grid-row: 1; }
  .contest-chevron { grid-column: 3; grid-row: 1 / span 2; }
  .contest-content { padding: 0 8px 8px; }
  .honor-row { grid-template-columns: 36px minmax(0, 1fr) 44px; gap: 2px 8px; }
  .honor-row > .honor-medal { grid-column: 1; grid-row: 1 / span 2; align-self: start; width: 36px; }
  .row-category { grid-column: 2; grid-row: 1; }
  .recipients { grid-column: 2; grid-row: 2; margin-top: 4px; }
  .source-link { grid-column: 3; grid-row: 1 / span 2; align-self: start; }
}
@media (prefers-reduced-motion: reduce) {
  .contest-chevron, .contest-summary { transition: none; }
}
</style>
