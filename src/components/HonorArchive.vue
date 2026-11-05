<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Trophy } from 'lucide-vue-next'
import { ApiError } from '../lib/api'
import { HONOR_FAMILIES, honorDate, honorsApi, type HonorAward } from '../lib/honors'
import ActionNotice from './ui/ActionNotice.vue'
import RefreshButton from './ui/RefreshButton.vue'
import { Input } from './ui/input'

const props = defineProps<{ userId?: number }>()
const records = ref<HonorAward[]>([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const family = ref('')
const year = ref('')
let sequence = 0
const years = computed(() =>
  [...new Set(records.value.map((r) => r.event.occurred_on?.slice(0, 4)).filter(Boolean))]
    .sort()
    .reverse()
)
const filtered = computed(() =>
  records.value.filter(
    (r) =>
      (!family.value || r.event.family === family.value) &&
      (!year.value || r.event.occurred_on?.startsWith(year.value)) &&
      (!search.value.trim() ||
        [r.event.title, r.team, r.award, ...r.recipients.map((p) => p.name)]
          .join(' ')
          .includes(search.value.trim()))
  )
)
async function load() {
  const request = ++sequence
  records.value = []
  loading.value = true
  error.value = ''
  try {
    const rows =
      props.userId === undefined ? await honorsApi.list() : await honorsApi.user(props.userId)
    if (request === sequence) records.value = rows
  } catch (e) {
    if (request === sequence) error.value = e instanceof ApiError ? e.message : '读取获奖记录失败'
  } finally {
    if (request === sequence) loading.value = false
  }
}
watch(() => props.userId, load, { immediate: true })
onUnmounted(() => {
  sequence++
})
</script>

<template>
  <section class="min-w-0 space-y-4" aria-label="历史获奖记录">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="space-y-1">
        <h2 class="flex items-center gap-2 text-lg font-semibold">
          <Trophy class="h-5 w-5" />{{ userId === undefined ? '荣誉殿堂' : '历史获奖记录' }}
        </h2>
        <p class="text-sm text-muted-foreground">
          {{ userId === undefined ? '韶关学院学子的竞赛获奖档案' : '在校期间经核实的竞赛获奖' }}
        </p>
      </div>
      <RefreshButton :busy="loading" @click="load" />
    </div>
    <div
      v-if="userId === undefined"
      class="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3"
    >
      <label class="space-y-1 text-sm"
        >姓名、队伍或赛事<Input v-model="search" placeholder="搜索获奖记录"
      /></label>
      <div class="space-y-1">
        <label for="honor-family" class="block text-sm">赛事</label
        ><select id="honor-family" v-model="family" class="form-select">
          <option value="">全部赛事</option>
          <option v-for="(name, key) in HONOR_FAMILIES" :key="key" :value="key">{{ name }}</option>
        </select>
      </div>
      <div class="space-y-1">
        <label for="honor-year" class="block text-sm">年份</label
        ><select id="honor-year" v-model="year" class="form-select">
          <option value="">全部年份</option>
          <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
    </div>
    <ActionNotice :message="error" variant="error" />
    <p v-if="loading" class="py-8 text-sm text-muted-foreground" role="status">正在读取获奖记录…</p>
    <p
      v-else-if="!error && !filtered.length"
      class="rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
    >
      {{ records.length ? '没有符合筛选条件的记录' : '暂无经核实且符合在校时间的获奖记录' }}
    </p>
    <div v-else-if="!error" class="divide-y rounded-lg border bg-card">
      <article v-for="row in filtered" :key="row.id" class="min-w-0 space-y-2 p-4">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="text-sm font-semibold">{{ row.award }}</span>
          <time class="text-xs text-muted-foreground">{{ honorDate(row.event) }}</time>
        </div>
        <h3 class="break-words font-medium">{{ row.event.title }}</h3>
        <p v-if="row.event.category" class="text-sm text-muted-foreground">
          {{ row.event.category }}
        </p>
        <p class="break-words text-sm">
          {{ row.recipients.map((p) => p.name).join('、')
          }}<span v-if="row.team" class="text-muted-foreground"> · {{ row.team }}</span>
        </p>
        <a
          :href="row.source_url"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >查看获奖来源</a
        >
      </article>
    </div>
  </section>
</template>
