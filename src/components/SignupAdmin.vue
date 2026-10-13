<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  ArrowLeft,
  Download,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-vue-next'
import { adminApi, ApiError, PLATFORM_META, signupAdminApi, type Platform, type SignupEntry, type SignupFieldDef, type SignupSummary } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import AdminWorkspaceNav from './AdminWorkspaceNav.vue'
import ActionNotice from './ui/ActionNotice.vue'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'

const list = ref<SignupSummary[]>([])
const activeId = ref<number | null>(null)
const detail = ref<SignupSummary | null>(null)
const entries = ref<SignupEntry[]>([])
const loading = ref(true)
const detailLoading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')

// ------------------------------------------------------------------ 表单编辑

type FieldForm = { label: string; type: SignupFieldDef['type']; required: boolean; optionsText: string; hint: string }

const editing = ref(false)
const editName = ref('')
const editDesc = ref('')
const editOpen = ref('')
const editClose = ref('')
const editCapacity = ref('')
const editFields = ref<FieldForm[]>([])
const editPlatforms = ref<Platform[]>([])
const editYears = ref<number[]>([])
const yearOptions = ref<number[]>([])

const PLATFORM_OPTIONS = Object.keys(PLATFORM_META) as Platform[]

function togglePlatform(p: Platform) {
  const i = editPlatforms.value.indexOf(p)
  if (i >= 0) editPlatforms.value.splice(i, 1)
  else editPlatforms.value.push(p)
}

function toggleYear(y: number) {
  const i = editYears.value.indexOf(y)
  if (i >= 0) editYears.value.splice(i, 1)
  else editYears.value.push(y)
}

const FIELD_TYPE_LABEL: Record<SignupFieldDef['type'], string> = {
  text: '单行文本',
  textarea: '多行文本',
  number: '数字',
  select: '单选',
  multiselect: '多选',
  checkbox: '勾选',
  phone: '手机号',
  email: '邮箱',
}

function toLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null
}

function startCreate() {
  editing.value = true
  activeId.value = null
  detail.value = null
  editName.value = ''
  editDesc.value = ''
  const now = new Date()
  editOpen.value = toLocal(now.toISOString())
  editClose.value = ''
  editCapacity.value = ''
  editPlatforms.value = []
  editYears.value = []
  editFields.value = [{ label: '', type: 'text', required: false, optionsText: '', hint: '' }]
  error.value = ''
}

function startEdit() {
  const d = detail.value
  if (!d) return
  editing.value = true
  editName.value = d.name
  editDesc.value = d.description
  editOpen.value = toLocal(d.open_at)
  editClose.value = toLocal(d.close_at)
  editCapacity.value = d.capacity !== null ? String(d.capacity) : ''
  editPlatforms.value = [...(d.required_platforms ?? [])]
  editYears.value = [...(d.required_years ?? [])]
  editFields.value = d.fields.map((f) => ({
    label: f.label,
    type: f.type,
    required: f.required,
    optionsText: f.options.join('、'),
    hint: f.hint,
  }))
  if (!editFields.value.length) {
    editFields.value = [{ label: '', type: 'text', required: false, optionsText: '', hint: '' }]
  }
  error.value = ''
}

function addField() {
  editFields.value.push({ label: '', type: 'text', required: false, optionsText: '', hint: '' })
}
function removeField(i: number) {
  editFields.value.splice(i, 1)
}
function moveField(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= editFields.value.length) return
  const t = editFields.value[i]
  editFields.value[i] = editFields.value[j]
  editFields.value[j] = t
}

function buildFields(): Omit<SignupFieldDef, 'key'>[] | null {
  const out: Omit<SignupFieldDef, 'key'>[] = []
  for (const [i, f] of editFields.value.entries()) {
    const label = f.label.trim()
    if (!label && f.type === 'text' && !f.required && !f.optionsText.trim() && !f.hint.trim()) continue
    if (!label) {
      error.value = `第 ${i + 1} 个字段标题为空`
      return null
    }
    if ((f.type === 'select' || f.type === 'multiselect') && !f.optionsText.trim()) {
      error.value = `「${label}」是选择但候选为空`
      return null
    }
    out.push({
      label,
      type: f.type,
      required: f.required,
      options: f.optionsText.split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean),
      hint: f.hint.trim(),
    })
  }
  return out
}

async function save() {
  const name = editName.value.trim()
  if (!name) { error.value = '名称不能为空'; return }
  if (!editOpen.value) { error.value = '选一下开放时间'; return }
  if (editClose.value && editClose.value <= editOpen.value) {
    error.value = '截止时间要晚于开放时间'
    return
  }
  const fields = buildFields()
  if (fields === null) return
  busy.value = true
  error.value = ''
  try {
    const payload = {
      name,
      description: editDesc.value.trim(),
      fields,
      open_at: new Date(editOpen.value).toISOString(),
      close_at: toIso(editClose.value),
      capacity: editCapacity.value.trim() ? parseInt(editCapacity.value, 10) : null,
      required_platforms: [...editPlatforms.value],
      required_years: [...editYears.value],
    }
    if (activeId.value) {
      detail.value = await signupAdminApi.update(activeId.value, payload)
    } else {
      const created = await signupAdminApi.create(payload)
      detail.value = created
      activeId.value = created.id
    }
    editing.value = false
    notice.value = '已保存'
    window.setTimeout(() => { if (notice.value === '已保存') notice.value = '' }, 3000)
    await load()
    await loadDetail()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败'
  } finally {
    busy.value = false
  }
}

// ------------------------------------------------------------------ 列表 / 名单

async function load() {
  loading.value = true
  error.value = ''
  try {
    list.value = await signupAdminApi.list()
    if (activeId.value) await loadDetail()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '读取失败'
  } finally {
    loading.value = false
  }
}

async function loadDetail() {
  if (!activeId.value) return
  detailLoading.value = true
  try {
    entries.value = await signupAdminApi.entries(activeId.value)
    if (!detail.value) {
      detail.value = list.value.find((s) => s.id === activeId.value) ?? null
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '读取名单失败'
  } finally {
    detailLoading.value = false
  }
}

async function select(id: number) {
  if (id === activeId.value && window.innerWidth < 1024) {
    activeId.value = null
    detail.value = null
    return
  }
  activeId.value = id
  detail.value = list.value.find((s) => s.id === id) ?? null
  editing.value = false
  await loadDetail()
}

async function remove() {
  if (!activeId.value || !detail.value) return
  if (!await confirmAction(`删掉「${detail.value.name}」？报名记录会一起删。`)) return
  busy.value = true
  try {
    await signupAdminApi.remove(activeId.value)
    activeId.value = null
    detail.value = null
    entries.value = []
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败'
  } finally {
    busy.value = false
  }
}

async function removeEntry(e: SignupEntry) {
  if (!activeId.value) return
  if (!await confirmAction(`撤销 ${e.display_name} 的报名？`)) return
  busy.value = true
  try {
    await signupAdminApi.removeEntry(activeId.value, e.id)
    await load()
    await loadDetail()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '操作失败'
  } finally {
    busy.value = false
  }
}

function fmtRange(s: SignupSummary): string {
  const f = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  const open = `${f(s.open_at)} 开放`
  const close = s.close_at ? ` — ${f(s.close_at)}` : ''
  return open + close
}
function statusLabel(s: SignupSummary): string {
  return s.status === 'open' ? '报名中' : s.status === 'upcoming' ? '未开始' : '已截止'
}

function fieldLabelOf(f: SignupFieldDef): string {
  return f.label
}

onMounted(async () => {
  await load()
  try {
    const page = await adminApi.users({ page_size: 500 })
    yearOptions.value = [...new Set(page.items.map((u) => u.enroll_year).filter((y): y is number => !!y))].sort((a, b) => b - a)
  } catch {
    yearOptions.value = []
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl space-y-4">
    <AdminWorkspaceNav active="signups" />

    <p v-if="error" class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{{ error }}</p>
    <ActionNotice :message="notice" />

    <p v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" />正在读取…</p>

    <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <!-- 左：报名列表 -->
      <div :class="activeId || editing ? 'hidden lg:block' : ''">
        <div class="flex items-center justify-between gap-2 px-1 pb-2">
          <h2 class="text-sm font-semibold">报名活动 <span class="text-xs font-normal text-muted-foreground">{{ list.length }} 个</span></h2>
          <Button size="sm" @click="startCreate"><Plus class="mr-1 h-3.5 w-3.5" />新建</Button>
        </div>
        <div class="space-y-1.5">
          <button
            v-for="s in list"
            :key="s.id"
            class="flex w-full flex-col gap-0.5 rounded-lg border border-border/40 bg-card px-3 py-2.5 text-left transition-colors"
            :class="activeId === s.id ? 'border-primary/50 bg-accent/40' : 'hover:bg-accent/40'"
            @click="select(s.id)"
          >
            <span class="flex items-center gap-2 text-sm font-medium">
              {{ s.name }}
              <span class="text-[11px] font-normal text-muted-foreground">{{ statusLabel(s) }}</span>
            </span>
            <span class="text-xs text-muted-foreground">{{ fmtRange(s) }} · {{ s.entry_count }}{{ s.capacity ? `/${s.capacity}` : '' }} 人</span>
          </button>
          <p v-if="!list.length" class="px-2 py-6 text-center text-xs text-muted-foreground">还没有报名活动</p>
        </div>
      </div>

      <!-- 右：详情/编辑 -->
      <div :class="activeId || editing ? '' : 'hidden lg:block'">
        <!-- 编辑/新建表单 -->
        <Card v-if="editing">
          <CardHeader class="flex flex-row items-center gap-2 pb-3">
            <button class="rounded p-1 text-muted-foreground hover:text-foreground lg:hidden" @click="editing = false; startCreate()">
              <ArrowLeft class="h-4 w-4" />
            </button>
            <CardTitle class="text-sm">{{ activeId ? '编辑报名' : '新建报名' }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="space-y-1 text-sm"><span>名称</span><Input v-model="editName" class="min-h-11" maxlength="100" /></label>
              <label class="space-y-1 text-sm"><span>名额（留空不限）</span><Input v-model="editCapacity" type="number" min="1" class="min-h-11" placeholder="不限" /></label>
            </div>
            <label class="block space-y-1 text-sm"><span>说明</span><textarea v-model="editDesc" rows="3" class="w-full rounded-md border border-input bg-background p-3 text-sm" /></label>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="space-y-1 text-sm"><span>开放时间</span><Input v-model="editOpen" type="datetime-local" required class="min-h-11" /></label>
              <label class="space-y-1 text-sm"><span>截止时间（留空 = 一直开）</span><Input v-model="editClose" type="datetime-local" class="min-h-11" /></label>
            </div>

            <!-- 前置条件：和集训一样，至少绑一个平台的已验证账号；
                 年级限制是给「新生赛」这类只面向某一级的活动。 -->
            <div class="space-y-3">
              <p class="text-sm font-medium">报名前置条件</p>
              <div class="space-y-1">
                <p class="text-xs text-muted-foreground">平台账号</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="p in PLATFORM_OPTIONS"
                    :key="p"
                    type="button"
                    class="min-h-9 rounded-md border px-3 text-xs transition-colors"
                    :class="editPlatforms.includes(p) ? 'border-primary bg-primary/10 font-medium' : 'border-input text-muted-foreground hover:text-foreground'"
                    @click="togglePlatform(p)"
                  >
                    {{ PLATFORM_META[p]?.label ?? p }}
                  </button>
                </div>
                <p class="text-xs text-muted-foreground">
                  {{ editPlatforms.length ? `所选平台都要绑定并验证（${editPlatforms.map((p) => PLATFORM_META[p]?.label).join('、')}）` : '不限平台' }}
                </p>
              </div>
              <div class="space-y-1">
                <p class="text-xs text-muted-foreground">入学年级</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="y in yearOptions"
                    :key="y"
                    type="button"
                    class="min-h-9 rounded-md border px-3 text-xs transition-colors"
                    :class="editYears.includes(y) ? 'border-primary bg-primary/10 font-medium' : 'border-input text-muted-foreground hover:text-foreground'"
                    @click="toggleYear(y)"
                  >
                    {{ y }} 级
                  </button>
                </div>
                <p class="text-xs text-muted-foreground">
                  {{ editYears.length ? `仅限 ${editYears.slice().sort().join('、')} 级` : '不限年级' }}
                </p>
              </div>
            </div>

            <!-- 表单字段构建器 -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium">表单字段</p>
                <Button size="sm" variant="outline" @click="addField"><Plus class="mr-1 h-3.5 w-3.5" />加字段</Button>
              </div>
              <div v-for="(f, i) in editFields" :key="i" class="space-y-2 rounded-md border border-border/40 p-3">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-muted-foreground">#{{ i + 1 }}</span>
                  <Input v-model="f.label" placeholder="字段标题，如「年级」" class="h-9 flex-1 text-sm" />
                  <button class="p-1 text-muted-foreground hover:text-foreground" title="上移" :disabled="i === 0" @click="moveField(i, -1)">↑</button>
                  <button class="p-1 text-muted-foreground hover:text-foreground" title="下移" :disabled="i === editFields.length - 1" @click="moveField(i, 1)">↓</button>
                  <button class="p-1 text-muted-foreground hover:text-destructive" title="删除字段" @click="removeField(i)"><X class="h-4 w-4" /></button>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <select v-model="f.type" class="h-9 rounded-md border border-input bg-background px-2.5 text-sm">
                    <option v-for="(l, t) in FIELD_TYPE_LABEL" :key="t" :value="t">{{ l }}</option>
                  </select>
                  <label class="flex items-center gap-1.5 text-xs"><input v-model="f.required" type="checkbox" class="h-4 w-4 accent-primary" />必填</label>
                  <Input v-model="f.hint" placeholder="提示语（可选）" class="h-9 flex-1 min-w-36 text-sm" />
                </div>
                <Input
                  v-if="f.type === 'select' || f.type === 'multiselect'"
                  v-model="f.optionsText"
                  placeholder="候选项，用顿号或逗号隔开：男、女"
                  class="h-9 text-sm"
                />
              </div>
            </div>

            <div class="flex gap-2">
              <Button size="sm" :disabled="busy" @click="save"><Loader2 v-if="busy" class="mr-1 h-3.5 w-3.5 animate-spin" />保存</Button>
              <Button size="sm" variant="ghost" :disabled="busy" @click="editing = false; if (!activeId) startCreate()">取消</Button>
            </div>
          </CardContent>
        </Card>

        <!-- 详情：名单 -->
        <template v-else-if="detail">
          <div class="flex flex-wrap items-center gap-2 px-1 pb-2">
            <button class="rounded p-1 text-muted-foreground hover:text-foreground lg:hidden" @click="activeId = null; detail = null">
              <ArrowLeft class="h-4 w-4" />
            </button>
            <h2 class="text-sm font-semibold">{{ detail.name }}</h2>
            <span class="text-xs text-muted-foreground">{{ statusLabel(detail) }} · {{ entries.length }} 人报名</span>
            <div class="ml-auto flex gap-1.5">
              <a :href="`/admin/signups/export?id=${activeId}`" class="hidden" />
              <Button size="sm" variant="outline" @click="startEdit">编辑</Button>
              <Button size="sm" variant="outline" :disabled="!entries.length" @click="() => window.open(signupAdminApi.exportUrl(activeId!), '_blank')">
                <Download class="mr-1 h-3.5 w-3.5" />导出
              </Button>
              <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" :disabled="busy" @click="remove">
                <Trash2 class="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <Card>
            <CardContent class="p-0">
              <p v-if="detailLoading" class="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" />读取名单…</p>
              <p v-else-if="!entries.length" class="px-4 py-8 text-center text-sm text-muted-foreground">还没有人报名</p>
              <div v-else class="overflow-x-auto" tabindex="0" role="region" aria-label="报名名单">
                <table class="w-full whitespace-nowrap text-sm">
                  <thead>
                    <tr class="border-b border-border/40 text-left text-xs text-muted-foreground">
                      <th class="px-3 py-2.5 font-medium">姓名</th>
                      <th class="px-3 py-2.5 font-medium">学号</th>
                      <th class="px-3 py-2.5 font-medium">班级</th>
                      <th v-for="f in detail.fields" :key="f.key" class="px-3 py-2.5 font-medium">{{ fieldLabelOf(f) }}</th>
                      <th class="px-3 py-2.5 font-medium">报名时间</th>
                      <th class="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border/40">
                    <tr v-for="e in entries" :key="e.id" class="row-action">
                      <td class="px-3 py-2.5 font-medium">{{ e.display_name }}</td>
                      <td class="px-3 py-2.5 font-mono text-xs">{{ e.student_id }}</td>
                      <td class="px-3 py-2.5 text-xs text-muted-foreground">{{ e.class_label || '—' }}</td>
                      <td v-for="f in detail.fields" :key="f.key" class="px-3 py-2.5 text-xs">
                        {{ f.type === 'checkbox' ? (e.answers[f.key] ? '是' : '—') : Array.isArray(e.answers[f.key]) ? (e.answers[f.key] as string[]).join('、') || '—' : (e.answers[f.key] || '—') }}
                      </td>
                      <td class="px-3 py-2.5 text-xs text-muted-foreground">{{ new Date(e.created_at).toLocaleString('zh-CN', { hour12: false }) }}</td>
                      <td class="px-3 py-2.5">
                        <button class="rounded p-1 text-muted-foreground hover:text-destructive" title="撤销这条报名" :disabled="busy" @click="removeEntry(e)"><Trash2 class="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </template>

        <div v-else class="hidden rounded-lg border border-dashed border-border/60 py-16 text-center text-sm text-muted-foreground lg:block">
          选择一个报名，或新建一个
        </div>
      </div>
    </div>
  </div>
</template>
