<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import {
  honorDate,
  honorsApi,
  type HonorAward,
  type HonorImportRecord,
  type HonorPerson,
  type ImportResult,
} from '../lib/honors'
import AdminWorkspaceNav from './AdminWorkspaceNav.vue'
import ActionNotice from './ui/ActionNotice.vue'
import RefreshButton from './ui/RefreshButton.vue'
import { Button } from './ui/button'
import { Input } from './ui/input'

const { user, ready, ensureLoaded } = useAuth()
const people = ref<HonorPerson[]>([])
const awards = ref<HonorAward[]>([])
const section = ref<'people' | 'awards' | 'import'>('awards')
const active = ref<number | 'new' | null>(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const query = ref('')
let sequence = 0
const draft = reactive({
  name: '',
  aliases: '',
  user_id: '',
  study_start: '',
  study_end: '',
  note: '',
  revision: 0,
})
const review = reactive({ status: 'pending', person_ids: [] as (number | null)[], revision: 0 })
const eventDraft = reactive({
  occurred_on: '',
  date_precision: 'day',
  expected_occurred_on: null as string | null,
  expected_date_precision: 'day',
})
const importText = ref('')
const importResult = ref<ImportResult | null>(null)
const selectedAward = computed(() => awards.value.find((a) => a.id === active.value))
const items = computed(() =>
  (section.value === 'people'
    ? people.value.map((p) => ({ id: p.id, title: p.name, sub: p.study_start || '在校时间待核实' }))
    : awards.value.map((a) => ({
        id: a.id,
        title: a.event.title,
        sub: `${a.award} · ${
          a.status === 'verified' ? '已核实' : a.status === 'excluded' ? '不计入' : '待核实'
        } · ${a.recipients.map((p) => p.raw_name).join('、')}`,
      }))
  ).filter((r) => `${r.title} ${r.sub}`.includes(query.value.trim()))
)
function failure(e: unknown) {
  error.value = e instanceof ApiError || e instanceof Error ? e.message : '操作失败'
}
async function load() {
  const request = ++sequence
  loading.value = true
  error.value = ''
  try {
    const [p, a] = await Promise.all([honorsApi.people(), honorsApi.awards()])
    if (request !== sequence) return false
    people.value = p
    awards.value = a
    return true
  } catch (e) {
    if (request === sequence) failure(e)
    return false
  } finally {
    if (request === sequence) loading.value = false
  }
}
function switchSection(value: typeof section.value) {
  if (busy.value) return
  section.value = value
  active.value = null
  query.value = ''
  error.value = notice.value = ''
}
function open(id: number | 'new') {
  if (busy.value) return
  active.value = id
  error.value = notice.value = ''
  if (section.value === 'people') {
    const p = people.value.find((p) => p.id === id)
    Object.assign(draft, {
      name: p?.name || '',
      aliases: p?.aliases.join('、') || '',
      user_id: p?.user_id?.toString() || '',
      study_start: p?.study_start || '',
      study_end: p?.study_end || '',
      note: p?.note || '',
      revision: p?.revision || 0,
    })
  } else {
    const a = selectedAward.value
    if (a)
      Object.assign(eventDraft, {
        occurred_on: a.event.occurred_on || '',
        date_precision: a.event.date_precision,
        expected_occurred_on: a.event.occurred_on,
        expected_date_precision: a.event.date_precision,
      })
    if (a)
      Object.assign(review, {
        status: a.status,
        person_ids: a.recipients.map((r) => r.person_id),
        revision: a.revision,
      })
  }
}
function cancel() {
  if (busy.value) return
  if (active.value === 'new') active.value = null
  else if (active.value !== null) open(active.value)
}
async function savePerson() {
  if (busy.value || active.value === null || section.value !== 'people') return
  busy.value = true
  error.value = notice.value = ''
  const id = active.value
  try {
    const p = await honorsApi.savePerson(id === 'new' ? null : id, {
      ...draft,
      aliases: draft.aliases
        .split(/[、,，\n]/)
        .map((x) => x.trim())
        .filter(Boolean),
      user_id: draft.user_id ? Number(draft.user_id) : null,
      study_start: draft.study_start || null,
      study_end: draft.study_end || null,
    })
    people.value = [...people.value.filter((row) => row.id !== p.id), p]
    busy.value = false
    open(p.id)
    notice.value = '身份已保存，公开记录已按新的在校区间重新计算'
  } catch (e) {
    failure(e)
  } finally {
    busy.value = false
  }
}
async function saveAward() {
  if (busy.value || typeof active.value !== 'number' || section.value !== 'awards') return
  busy.value = true
  error.value = notice.value = ''
  const id = active.value
  try {
    await honorsApi.review(id, review.revision, review.status, [...review.person_ids])
    const refreshed = await load()
    busy.value = false
    if (!refreshed) return
    open(id)
    notice.value = '审核已保存；仅已核实且符合在校时间的获奖者会公开计入'
  } catch (e) {
    failure(e)
  } finally {
    busy.value = false
  }
}
async function saveEventDate() {
  const a = selectedAward.value
  if (busy.value || !a?.event.id) return
  const id = a.id
  busy.value = true
  error.value = notice.value = ''
  try {
    const event = await honorsApi.saveEventDate(a.event.id, {
      ...eventDraft,
      occurred_on: eventDraft.occurred_on || null,
    })
    if (active.value === id) {
      awards.value = awards.value.map((row) =>
        row.event.id === event.id ? { ...row, event } : row
      )
      eventDraft.expected_occurred_on = event.occurred_on
      eventDraft.expected_date_precision = event.date_precision
      notice.value = '比赛日期已保存，所有关联获奖记录已重新计算'
    }
  } catch (e) {
    failure(e)
  } finally {
    busy.value = false
  }
}
async function runImport(preview: boolean) {
  if (busy.value) return
  busy.value = true
  error.value = notice.value = ''
  try {
    const input: unknown = JSON.parse(importText.value)
    const records: HonorImportRecord[] = Array.isArray(input)
      ? input
      : (input as { records: HonorImportRecord[] }).records
    if (!Array.isArray(records) || records.length === 0)
      throw new Error('请提供非空记录数组或包含 records 的对象')
    const result = await honorsApi.import(records, preview)
    importResult.value = result
    if (!preview) {
      if (result.failed.length)
        importText.value = JSON.stringify({ records: result.failed.map((f) => f.record) }, null, 2)
      await load()
    }
  } catch (e) {
    failure(e)
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  await ensureLoaded()
  if (user.value && user.value.role !== 'member') await load()
})
onUnmounted(() => {
  sequence++
})
</script>

<template>
  <div class="min-w-0 space-y-5">
    <AdminWorkspaceNav active="honors"
      >
<RefreshButton
        :busy="loading"
        :disabled="busy || !user || user.role === 'member'"
        @click="load"
    />
</AdminWorkspaceNav>
    <p v-if="!ready" role="status">正在读取…</p>
    <ActionNotice
      v-else-if="!user || user.role === 'member'"
      message="需要管理员权限"
      variant="error"
    />
    <template v-else>
      <div class="flex flex-wrap gap-2" aria-label="荣誉管理分区">
        <Button
          v-for="tab in ([['awards', '获奖审核'], ['people', '获奖者身份'], ['import', '导入记录']] as const)"
          :key="tab[0]"
          variant="outline"
          class="choice-button"
          :aria-pressed="section === tab[0]"
          :disabled="busy"
          @click="switchSection(tab[0])"
          >
{{ tab[1] }}
</Button
        >
      </div>
      <ActionNotice :message="error" variant="error" /><ActionNotice :message="notice" />
      <section v-if="section === 'import'" class="min-w-0 space-y-4 rounded-lg border bg-card p-4">
        <h2 class="font-semibold">追加获奖记录</h2>
        <p class="text-sm text-muted-foreground">
          按来源编号去重；新增记录进入待核实队列，不自动匹配姓名。单次最多 500 条。
        </p>
        <form class="space-y-3" @submit.prevent="runImport(true)">
          <label for="honor-import" class="block text-sm">采集数据（JSON）</label>
          <textarea
            id="honor-import"
            v-model="importText"
            class="form-textarea min-h-64 w-full font-mono text-sm"
            :disabled="busy"
            required
            @input="importResult = null"
          />
          <div class="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" :disabled="busy">预览导入</Button
            ><Button
              :disabled="busy || !importResult?.preview || !importResult.added.length"
              @click="runImport(false)"
              >
确认追加
</Button
            >
          </div>
        </form>
        <ActionNotice
          v-if="importResult"
          :variant="importResult.preview || importResult.failed.length ? 'info' : 'success'"
          :message="`${importResult.preview ? '预览' : '导入完成'}：新增 ${
            importResult.added.length
          } 条，重复 ${importResult.duplicates.length} 条，失败 ${importResult.failed.length} 条${
            importResult.failed.length
              ? '\n' + importResult.failed.map((f) => `第 ${f.row} 行：${f.reason}`).join('\n')
              : ''
          }`"
        />
      </section>
      <div v-else class="grid min-w-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <section class="min-w-0 space-y-3" :class="active !== null && 'hidden lg:block'">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-semibold">{{ section === 'people' ? '获奖者身份' : '获奖审核' }}</h2>
            <Button v-if="section === 'people'" :disabled="busy" @click="open('new')"
              >
添加身份
</Button
            >
          </div>
          <Input v-model="query" aria-label="筛选当前列表" placeholder="筛选当前列表" />
          <p v-if="loading" class="text-sm text-muted-foreground">正在读取…</p>
          <p v-else-if="!items.length" class="text-sm text-muted-foreground">暂无记录</p>
          <div class="max-h-[65vh] space-y-1 overflow-y-auto">
            <button
              v-for="item in items"
              :key="item.id"
              type="button"
              class="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
              :class="active === item.id ? 'border-primary bg-muted' : 'border-transparent'"
              :disabled="busy"
              @click="open(item.id)"
            >
              <span class="block break-words text-sm font-medium">{{ item.title }}</span
              ><span class="mt-1 block break-words text-xs text-muted-foreground">{{
                item.sub
              }}</span>
            </button>
          </div>
        </section>
        <section
          class="min-w-0 space-y-4 rounded-lg border bg-card p-4"
          :class="active === null && 'hidden lg:block'"
        >
          <Button
            v-if="active !== null"
            variant="outline"
            class="lg:hidden"
            :disabled="busy"
            @click="active = null"
            >
返回列表
</Button
          >
          <p v-if="active === null" class="text-sm text-muted-foreground">选择一条记录开始核对</p>
          <form v-else-if="section === 'people'" class="space-y-4" @submit.prevent="savePerson">
            <h2 class="font-semibold">{{ active === 'new' ? '添加身份' : '编辑身份' }}</h2>
            <fieldset class="min-w-0 space-y-3" :disabled="busy">
              <label class="block space-y-1 text-sm"
                >当前姓名<Input v-model="draft.name" required maxlength="100"
              /></label>
              <label class="block space-y-1 text-sm"
                >曾用名（用顿号分隔）<Input v-model="draft.aliases"
              /></label>
              <label class="block space-y-1 text-sm"
                >关联站内成员 ID（可留空）<Input
                  v-model="draft.user_id"
                  type="number"
                  min="1"
                  step="1"
              /></label>
              <p class="text-xs text-muted-foreground">
                姓名与曾用名只作核对线索，不会自动关联同名账号。
              </p>
              <label class="block space-y-1 text-sm"
                >入学日期<Input v-model="draft.study_start" type="date"
              /></label>
              <label class="block space-y-1 text-sm"
                >离校日期（当天起不计入）<Input v-model="draft.study_end" type="date"
              /></label>
              <p class="text-xs text-muted-foreground">
                离校日期留空时按入学日期加四年计算；时间未核实的身份不计入公开记录。
              </p>
              <label for="honor-note" class="block text-sm">身份核对备注（仅管理员可见）</label
              ><textarea
                id="honor-note"
                v-model="draft.note"
                class="form-textarea w-full"
                maxlength="3000"
              />
            </fieldset>
            <div class="flex gap-2">
              <Button type="submit" :disabled="busy">保存身份</Button
              ><Button variant="outline" :disabled="busy" @click="cancel">取消</Button>
            </div>
          </form>
          <div v-else-if="selectedAward" class="min-w-0 space-y-4">
            <div class="space-y-2">
              <h2 class="break-words font-semibold">{{ selectedAward.event.title }}</h2>
              <p class="text-sm">
                {{ selectedAward.award }} · {{ honorDate(selectedAward.event) }} ·
                {{ selectedAward.event.category }}
              </p>
              <p v-if="selectedAward.team" class="break-words text-sm">
                队伍：{{ selectedAward.team }}
              </p>
              <a
                :href="selectedAward.source_url"
                class="inline-flex min-h-11 items-center text-sm underline"
                target="_blank"
                rel="noopener noreferrer"
                >核对来源</a
              >
              <p class="whitespace-pre-line break-words text-sm text-muted-foreground">
                {{ selectedAward.evidence }}
              </p>
            </div>
            <form class="space-y-3 rounded-lg border p-3" @submit.prevent="saveEventDate">
              <h3 class="text-sm font-medium">核对比赛日期（应用于本场所有获奖记录）</h3>
              <label class="block space-y-1 text-sm"
                >比赛日期<Input v-model="eventDraft.occurred_on" type="date" :disabled="busy"
              /></label>
              <div class="space-y-1">
                <label for="honor-event-precision" class="block text-sm">日期精度</label
                ><select
                  id="honor-event-precision"
                  v-model="eventDraft.date_precision"
                  class="form-select"
                  :disabled="busy"
                >
                  <option value="day">精确到日</option>
                  <option value="month">仅知月份</option>
                  <option value="year">仅知年份</option>
                </select>
              </div>
              <Button type="submit" variant="outline" :disabled="busy">保存比赛日期</Button>
            </form>
            <form class="space-y-4" @submit.prevent="saveAward">
              <fieldset class="min-w-0 space-y-4" :disabled="busy">
                <div
                  v-for="(recipient, index) in selectedAward.recipients"
                  :key="index"
                  class="space-y-1"
                >
                  <label :for="`honor-person-${index}`" class="block text-sm"
                    >原始姓名：{{ recipient.raw_name }}</label
                  >
                  <select
                    :id="`honor-person-${index}`"
                    v-model="review.person_ids[index]"
                    class="form-select w-full"
                  >
                    <option :value="null">待关联身份</option>
                    <option
                      v-for="p in people.filter((p) => !p.merged_into_id)"
                      :key="p.id"
                      :value="p.id"
                    >
                      #{{ p.id }} {{ p.name }} · {{ p.study_start || '入学时间待核实'
                      }}{{ p.aliases.length ? ` · 曾用名 ${p.aliases.join('、')}` : '' }}
                    </option>
                  </select>
                  <p class="text-xs text-muted-foreground">
                    上次保存结果：{{ recipient.eligibility }}
                  </p>
                </div>
                <div class="space-y-1">
                  <label for="honor-review-status" class="block text-sm">审核状态</label
                  ><select id="honor-review-status" v-model="review.status" class="form-select">
                    <option value="pending">待核实</option>
                    <option value="verified">已核实</option>
                    <option value="excluded">不计入</option>
                  </select>
                </div>
              </fieldset>
              <p class="text-xs text-muted-foreground">
                已核实的记录还须符合获奖者的在校区间；更正区间后会自动重新计算。
              </p>
              <div class="flex gap-2">
                <Button type="submit" :disabled="busy">保存审核</Button
                ><Button variant="outline" :disabled="busy" @click="cancel">取消</Button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
