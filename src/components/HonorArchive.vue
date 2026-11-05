<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ChevronRight, ExternalLink, Search, Trophy } from 'lucide-vue-next'
import { ApiError } from '../lib/api'
import { HONOR_FAMILIES, honorDate, honorsApi, type HonorAward } from '../lib/honors'
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
type DisplayAward = HonorAward & { count: number }
const groups = computed(() => {
  const combined = new Map<string, DisplayAward>()
  for (const row of filtered.value) {
    // Individual awards from one official list share a row; team awards remain distinct.
    const key = row.team ? `team:${row.id}` : JSON.stringify([row.event.key, row.award, row.source_url])
    const previous = combined.get(key)
    if (previous) {
      previous.recipients.push(...row.recipients)
      previous.count++
    } else combined.set(key, { ...row, recipients: [...row.recipients], count: 1 })
  }
  const grouped = new Map<string, DisplayAward[]>()
  for (const row of combined.values()) {
    const key = row.event.occurred_on?.slice(0, 4) || '日期待补'
    grouped.set(key, [...(grouped.get(key) || []), row])
  }
  return [...grouped].sort(([a], [b]) => b.localeCompare(a)).map(([year, rows]) => ({
    year, rows, count: rows.reduce((total, row) => total + row.count, 0),
  }))
})
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
watch(() => props.userId, () => { clearFilters(); load(true) }, { immediate: true })
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
        <div class="honor-rows min-w-0">
          <details v-for="row in group.rows" :key="row.id" class="honor-row group">
            <summary :aria-label="`${row.award}，${row.event.title}，${row.recipients.map((p) => p.name).join('、')}`">
              <HonorMedal :award="row.award" />
              <div class="contest min-w-0">
                <h4>{{ contestHeading(row.event) }}</h4>
                <p v-if="contestMeta(row.event)">{{ contestMeta(row.event) }}</p>
              </div>
              <div class="recipients min-w-0"><span v-for="(recipient, index) in row.recipients" :key="index">{{ recipient.name }}</span></div>
              <time class="honor-date" :datetime="row.event.occurred_on || undefined">{{ honorDate(row.event).slice(5) || group.year }}</time>
              <ChevronRight class="detail-chevron h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </summary>
            <div class="honor-detail">
              <p class="break-words font-medium">{{ row.event.title }}</p>
              <dl class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt>奖项</dt><dd>{{ row.award }}</dd>
                <template v-if="honorCategory(row.event.category)"><dt>组别</dt><dd>{{ honorCategory(row.event.category) }}</dd></template>
                <dt>日期</dt><dd>{{ honorDate(row.event) }}</dd>
                <template v-if="userId !== undefined"><dt>获奖者</dt><dd class="break-words">{{ row.recipients.map((p) => p.name).join('、') }}</dd></template>
                <template v-if="row.team"><dt>队伍</dt><dd class="break-words">{{ row.team }}</dd></template>
              </dl>
              <a :href="row.source_url" target="_blank" rel="noopener noreferrer" class="source-link">
                获奖来源<ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
              </a>
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
.year-label { display: flex; flex-direction: column; gap: 4px; padding-top: 16px; font-variant-numeric: tabular-nums; }
.year-label > span:first-child { font-size: 28px; font-weight: 600; line-height: 36px; letter-spacing: -0.04em; }
.year-count { font-size: 13px; font-weight: 400; color: hsl(var(--muted-foreground)); }
.honor-rows { border-top: 1px solid hsl(var(--border)); }
.honor-row { border-bottom: 1px solid hsl(var(--border) / .65); }
.honor-row summary { display: grid; grid-template-columns: 44px minmax(0, 1fr) minmax(140px, 190px) 58px 18px; align-items: center; gap: 16px; padding: 16px 8px; cursor: pointer; list-style: none; border-radius: 6px; transition: background-color 150ms var(--ease-out); }
.honor-row summary::-webkit-details-marker { display: none; }
.honor-row summary:hover { background: hsl(var(--muted) / .45); }
.honor-row summary:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 3px; }
.contest h4 { font-size: 16px; line-height: 1.5; font-weight: 500; overflow-wrap: anywhere; }
.contest p { margin-top: 3px; font-size: 13px; line-height: 1.55; color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.recipients { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.honor-date { font-size: 13px; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; text-align: right; }
.detail-chevron { transition: transform 180ms var(--ease-out); }
.honor-row[open] .detail-chevron { transform: rotate(90deg); }
.honor-detail { margin: 0 8px 18px 68px; padding: 14px 0 0; border-top: 1px dashed hsl(var(--border)); font-size: 14px; line-height: 1.65; animation: detail-in 160ms var(--ease-out); }
.honor-detail dt { color: hsl(var(--muted-foreground)); }
.source-link { display: inline-flex; min-height: 44px; align-items: center; gap: 6px; margin-top: 8px; text-decoration: underline; text-underline-offset: 4px; }
.source-link:hover { color: hsl(var(--muted-foreground)); }
.personal .honor-year-group { grid-template-columns: 64px minmax(0,1fr); gap: 12px; }
.personal .year-label > span:first-child { font-size: 22px; }
.personal summary { grid-template-columns: 44px minmax(0, 1fr) 58px 18px; }
.personal .recipients { display: none; }
@container (max-width: 760px) {
  .honor-year-group, .personal .honor-year-group { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .year-label { flex-direction: row; align-items: baseline; gap: 10px; padding-top: 0; }
  .year-label > span:first-child { font-size: 24px; line-height: 30px; }
  .honor-row summary, .personal summary { grid-template-columns: 44px minmax(0, 1fr) 18px; gap: 4px 12px; padding: 14px 0; }
  .honor-row summary > :first-child { grid-column: 1; grid-row: 1 / span 2; align-self: start; }
  .contest { grid-column: 2; grid-row: 1; }
  .contest p { padding-right: 4px; }
  .recipients { grid-column: 2; grid-row: 2; margin-top: 3px; }
  .honor-date { grid-column: 2; grid-row: 3; text-align: left; margin-top: 2px; }
  .detail-chevron { grid-column: 3; grid-row: 1 / span 3; }
  .honor-detail { margin-left: 56px; margin-right: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .detail-chevron, .honor-row summary { transition: none; }
  .honor-detail { animation: none; }
}
@keyframes detail-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
</style>
