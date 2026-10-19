<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ArrowDown, ArrowLeft, ArrowUp, Download, Loader2, Plus, Trash2, X } from 'lucide-vue-next'
import { adminApi, ApiError, PLATFORM_META, signupAdminApi, type Platform, type SignupEntry, type SignupFieldDef, type SignupPayload, type SignupSummary } from '../lib/api'
import { useAuth } from '../lib/auth'
import { confirmAction } from '../lib/confirm'
import AdminWorkspaceNav from './AdminWorkspaceNav.vue'
import ActionNotice from './ui/ActionNotice.vue'
import RefreshButton from './ui/RefreshButton.vue'
import IconButton from './ui/IconButton.vue'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'

const { isAdmin, ensureLoaded } = useAuth()
const list = ref<SignupSummary[]>([])
const activeId = ref<number | null>(null)
const detail = ref<SignupSummary | null>(null)
const entries = ref<SignupEntry[]>([])
const loading = ref(true)
const detailLoading = ref(false)
const refreshing = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const editing = ref(false)
const editName = ref('')
const editDesc = ref('')
const editOpen = ref('')
const editClose = ref('')
const editCapacity = ref('')
type FieldForm = { localId: string; key?: string; label: string; type: SignupFieldDef['type']; required: boolean; optionsText: string; hint: string }
const editFields = ref<FieldForm[]>([])
const editPlatforms = ref<Platform[]>([])
const editYears = ref<number[]>([])
const yearOptions = ref<number[]>([])
const availableYears = computed(() => [...new Set([...yearOptions.value, ...editYears.value])].sort((a, b) => b - a))
const PLATFORM_OPTIONS = Object.keys(PLATFORM_META) as Platform[]
const FIELD_TYPE_LABEL: Record<SignupFieldDef['type'], string> = {
  text: '单行文本', textarea: '多行文本', number: '数字', select: '单选',
  multiselect: '多选', checkbox: '勾选', phone: '手机号', email: '邮箱',
}
let requestId = 0
let disposed = false
const baseline = ref('')
const formSnapshot = computed(() => JSON.stringify({
  name: editName.value, description: editDesc.value, open: editOpen.value, close: editClose.value,
  capacity: editCapacity.value, fields: editFields.value, platforms: editPlatforms.value, years: editYears.value,
}))
const dirty = computed(() => editing.value && formSnapshot.value !== baseline.value)
const blocked = computed(() => busy.value || refreshing.value)
const message = (err: unknown) => err instanceof ApiError ? err.message : '操作失败，请稍后重试'
function updateUrl() {
  const url = new URL(location.href)
  if (activeId.value) url.searchParams.set('id', String(activeId.value))
  else url.searchParams.delete('id')
  history.replaceState(history.state, '', url)
}
function toLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso), pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function emptyField(): FieldForm {
  return { localId: window.crypto.randomUUID(), label: '', type: 'text', required: false, optionsText: '', hint: '' }
}
async function mayLeave() {
  return !dirty.value || await confirmAction('还有未保存的报名设置，离开后会丢失这些修改。', '放弃修改？')
}
async function startCreate() {
  if (blocked.value || !await mayLeave()) return
  ++requestId
  activeId.value = null; detail.value = null; entries.value = []; detailLoading.value = false
  editName.value = ''; editDesc.value = ''; editOpen.value = toLocal(new Date().toISOString())
  editClose.value = ''; editCapacity.value = ''; editPlatforms.value = []; editYears.value = []
  editFields.value = [emptyField()]
  editing.value = true; error.value = ''; notice.value = ''
  baseline.value = formSnapshot.value
  updateUrl()
}
function startEdit() {
  const d = detail.value
  if (!d || blocked.value) return
  editName.value = d.name; editDesc.value = d.description
  editOpen.value = toLocal(d.open_at); editClose.value = toLocal(d.close_at)
  editCapacity.value = d.capacity === null ? '' : String(d.capacity)
  editPlatforms.value = [...d.required_platforms]; editYears.value = [...d.required_years]
  editFields.value = d.fields.map(f => ({ ...f, localId: f.key, optionsText: f.options.join('、') }))
  editing.value = true; error.value = ''; notice.value = ''
  baseline.value = formSnapshot.value
}
async function cancelEdit() {
  if (blocked.value || !await mayLeave()) return
  editing.value = false; error.value = ''
}
async function back() {
  if (blocked.value || !await mayLeave()) return
  ++requestId
  activeId.value = null; detail.value = null; entries.value = []; editing.value = false
  detailLoading.value = false; error.value = ''; notice.value = ''; updateUrl()
}
function moveField(i: number, dir: -1 | 1) {
  if (blocked.value) return
  const j = i + dir
  if (j < 0 || j >= editFields.value.length) return
  const [f] = editFields.value.splice(i, 1)
  editFields.value.splice(j, 0, f)
}
function togglePlatform(p: Platform) {
  editPlatforms.value = editPlatforms.value.includes(p) ? editPlatforms.value.filter(x => x !== p) : [...editPlatforms.value, p]
}
function toggleYear(y: number) {
  editYears.value = editYears.value.includes(y) ? editYears.value.filter(x => x !== y) : [...editYears.value, y]
}
function buildFields(): NonNullable<SignupPayload['fields']> | null {
  const out: NonNullable<SignupPayload['fields']> = []
  for (const [i, f] of editFields.value.entries()) {
    const label = f.label.trim()
    if (!f.key && !label && f.type === 'text' && !f.required && !f.optionsText.trim() && !f.hint.trim()) continue
    if (!label) { error.value = `第 ${i + 1} 个字段标题为空`; return null }
    const options = [...new Set(f.optionsText.split(/[、,，\n]/).map(s => s.trim()).filter(Boolean))]
    if (['select', 'multiselect'].includes(f.type) && !options.length) {
      error.value = `「${label}」需要至少一个候选项`; return null
    }
    out.push({ key: f.key ?? `field_${f.localId.replaceAll('-', '')}`, label, type: f.type, required: f.required, options, hint: f.hint.trim() })
  }
  return out
}
async function loadDetail(id: number) {
  const token = ++requestId
  detailLoading.value = true
  try {
    const rows = await signupAdminApi.entries(id)
    if (disposed || token !== requestId || activeId.value !== id) return
    entries.value = rows
  } catch (err) {
    if (token === requestId) error.value = message(err)
  } finally {
    if (token === requestId) detailLoading.value = false
  }
}
async function load() {
  const rows = await signupAdminApi.list()
  if (disposed) return
  list.value = rows
  if (activeId.value) {
    detail.value = rows.find(s => s.id === activeId.value) ?? null
    if (!detail.value) {
      ++requestId; entries.value = []; detailLoading.value = false
      error.value = '这条报名活动已不存在，请返回列表。'
    } else await loadDetail(activeId.value)
  }
}
async function refresh() {
  if (blocked.value) return
  refreshing.value = true; error.value = ''
  try { await load() }
  catch (err) { error.value = message(err) }
  finally { loading.value = false; refreshing.value = false }
}
async function select(id: number) {
  if (blocked.value || !await mayLeave()) return
  activeId.value = id; detail.value = list.value.find(s => s.id === id) ?? null
  editing.value = false; entries.value = []; error.value = ''; notice.value = ''; updateUrl()
  await loadDetail(id)
}
async function save() {
  if (blocked.value) return
  const name = editName.value.trim()
  if (!name) { error.value = '名称不能为空'; return }
  const open = Date.parse(editOpen.value), close = editClose.value ? Date.parse(editClose.value) : null
  if (!Number.isFinite(open) || (close !== null && (!Number.isFinite(close) || close <= open))) {
    error.value = '请选择有效的时间，截止时间须晚于开放时间'; return
  }
  const capacity = editCapacity.value.trim() ? Number(editCapacity.value) : null
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 1)) {
    error.value = '名额须为正整数'; return
  }
  const fields = buildFields()
  if (fields === null) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const payload: SignupPayload = {
      name, description: editDesc.value.trim(), fields, open_at: new Date(open).toISOString(),
      close_at: close === null ? null : new Date(close).toISOString(), capacity,
      required_platforms: [...editPlatforms.value], required_years: [...editYears.value],
    }
    const saved = activeId.value ? await signupAdminApi.update(activeId.value, payload) : await signupAdminApi.create(payload)
    detail.value = saved; activeId.value = saved.id; editing.value = false; notice.value = '报名设置已保存'; updateUrl()
    await load()
  } catch (err) { error.value = message(err) }
  finally { busy.value = false }
}
async function remove() {
  if (blocked.value || !detail.value) return
  const target = detail.value
  if (!await confirmAction(`删除「${target.name}」及全部报名记录？此操作不可恢复。`, '删除报名活动')) return
  if (blocked.value || activeId.value !== target.id) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await signupAdminApi.remove(target.id)
    ++requestId; activeId.value = null; detail.value = null; entries.value = []; updateUrl()
    notice.value = '报名活动已删除'; await load()
  } catch (err) { error.value = message(err) }
  finally { busy.value = false }
}
async function removeEntry(e: SignupEntry) {
  if (blocked.value || !activeId.value) return
  const id = activeId.value
  if (!await confirmAction(`撤销 ${e.display_name} 的报名？`, '撤销报名')) return
  if (blocked.value || activeId.value !== id) return
  busy.value = true; error.value = ''; notice.value = ''
  try { await signupAdminApi.removeEntry(id, e.id); notice.value = '报名已撤销'; await load() }
  catch (err) { error.value = message(err) }
  finally { busy.value = false }
}
function statusLabel(s: SignupSummary) {
  return s.status === 'open' ? '报名中' : s.status === 'upcoming' ? '未开始' : '已截止'
}
function beforeUnload(event: Event) { if (dirty.value) event.preventDefault() }
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload)
  await ensureLoaded()
  if (!isAdmin.value) { loading.value = false; return }
  const id = Number(new URLSearchParams(location.search).get('id'))
  if (Number.isSafeInteger(id) && id > 0) activeId.value = id
  await refresh()
  try { yearOptions.value = (await adminApi.users({ page_size: 1 })).enroll_years }
  catch { yearOptions.value = [] }
})
onUnmounted(() => { disposed = true; ++requestId; window.removeEventListener('beforeunload', beforeUnload) })
</script>

<template>
  <div class="mx-auto w-full max-w-6xl space-y-4">
    <AdminWorkspaceNav active="signups"><RefreshButton :busy="loading || refreshing || busy" @click="refresh" /></AdminWorkspaceNav>
    <ActionNotice :message="error" variant="error" />
    <ActionNotice :message="notice" />
    <p v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" />正在读取报名活动…</p>
    <p v-else-if="!isAdmin" class="rounded-lg border p-6 text-sm text-muted-foreground">需要管理员权限才能管理报名。<a href="/login" class="underline">前往登录</a></p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="mr-auto text-base font-semibold">报名活动 <span class="text-sm font-normal text-muted-foreground">{{ list.length }} 个</span></h2>
        <Button :disabled="blocked" @click="startCreate"><Plus class="mr-2 h-4 w-4" />新建报名</Button>
      </div>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div class="min-w-0" :class="activeId || editing ? 'hidden lg:block' : ''">
          <Card v-if="list.length">
<CardContent class="p-1">
            <button v-for="s in list" :key="s.id" type="button" :disabled="blocked" :aria-current="activeId === s.id ? 'true' : undefined"
              class="row-action flex min-h-16 w-full flex-col justify-center gap-1 rounded-md px-3 py-3 text-left disabled:opacity-50"
              :class="activeId === s.id ? 'bg-accent' : ''" @click="select(s.id)">
              <span class="w-full truncate text-sm font-medium">{{ s.name }}</span>
              <span class="text-xs text-muted-foreground">{{ statusLabel(s) }} · {{ s.entry_count }}{{ s.capacity ? ` / ${s.capacity}` : '' }} 人</span>
            </button>
          </CardContent>
</Card>
          <p v-else class="py-10 text-center text-sm text-muted-foreground">还没有报名活动。</p>
        </div>
        <div class="min-w-0 space-y-4" :class="activeId || editing ? '' : 'hidden lg:block'">
          <Button v-if="activeId || editing" variant="ghost" :disabled="blocked" @click="back"><ArrowLeft class="mr-2 h-4 w-4" />返回报名列表</Button>
          <Card v-if="editing">
            <CardHeader><CardTitle class="text-base">{{ activeId ? '编辑报名' : '新建报名' }}</CardTitle></CardHeader>
            <CardContent>
              <form class="space-y-4" @submit.prevent="save">
                <fieldset :disabled="blocked" class="min-w-0 space-y-4">
                  <div class="grid gap-4 sm:grid-cols-2">
                    <label class="space-y-1 text-sm"><span>名称</span><Input v-model="editName" required maxlength="100" /></label>
                    <label class="space-y-1 text-sm"><span>名额（留空不限）</span><Input v-model="editCapacity" type="number" min="1" step="1" placeholder="不限" /></label>
                  </div>
                  <label class="block space-y-1 text-sm"><span>说明</span><textarea v-model="editDesc" rows="3" maxlength="5000" class="form-textarea" /></label>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <label class="space-y-1 text-sm"><span>开放时间（本地时间）</span><Input v-model="editOpen" type="datetime-local" required /></label>
                    <label class="space-y-1 text-sm"><span>截止时间（留空不限）</span><Input v-model="editClose" type="datetime-local" /></label>
                  </div>
                  <div class="space-y-3">
                    <p class="text-sm font-medium">报名前置条件</p>
                    <div class="space-y-2">
                      <p class="text-sm text-muted-foreground">平台账号</p>
                      <div class="flex flex-wrap gap-2">
                        <button v-for="p in PLATFORM_OPTIONS" :key="p" type="button" class="choice-button" :aria-pressed="editPlatforms.includes(p)" @click="togglePlatform(p)">{{ PLATFORM_META[p].label }}</button>
                      </div>
                      <p class="text-xs text-muted-foreground">{{ editPlatforms.length ? '所选平台都须绑定并验证。' : '不限平台。' }}</p>
                    </div>
                    <div class="space-y-2">
                      <p class="text-sm text-muted-foreground">入学年级</p>
                      <div class="flex flex-wrap gap-2">
                        <button v-for="y in availableYears" :key="y" type="button" class="choice-button" :aria-pressed="editYears.includes(y)" @click="toggleYear(y)">{{ y }} 级</button>
                      </div>
                      <p class="text-xs text-muted-foreground">{{ editYears.length ? `仅限 ${editYears.slice().sort().join('、')} 级。` : '不限年级。' }}</p>
                    </div>
                  </div>
                  <div class="space-y-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="mr-auto text-sm font-medium">表单字段</p>
                      <Button variant="outline" :disabled="editFields.length >= 20" @click="editFields.push(emptyField())"><Plus class="mr-2 h-4 w-4" />添加字段</Button>
                    </div>
                    <div v-for="(f, i) in editFields" :key="f.localId" class="space-y-3 rounded-lg border border-border/60 p-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <label class="min-w-0 flex-1 basis-40 space-y-1 text-sm"><span>字段 {{ i + 1 }} 标题</span><Input v-model="f.label" maxlength="60" placeholder="如：队名" /></label>
                        <div class="flex shrink-0 self-end">
                          <IconButton :label="`上移字段 ${i + 1}`" :disabled="i === 0" @click="moveField(i, -1)"><ArrowUp class="h-4 w-4" /></IconButton>
                          <IconButton :label="`下移字段 ${i + 1}`" :disabled="i === editFields.length - 1" @click="moveField(i, 1)"><ArrowDown class="h-4 w-4" /></IconButton>
                          <IconButton :label="`删除字段 ${i + 1}`" destructive @click="editFields.splice(i, 1)"><X class="h-4 w-4" /></IconButton>
                        </div>
                      </div>
                      <div class="grid gap-3 sm:grid-cols-2">
                        <label class="space-y-1 text-sm"><span>类型</span><select v-model="f.type" class="form-select"><option v-for="(label, type) in FIELD_TYPE_LABEL" :key="type" :value="type">{{ label }}</option></select></label>
                        <label class="space-y-1 text-sm"><span>提示语（可选）</span><Input v-model="f.hint" maxlength="200" /></label>
                      </div>
                      <label class="flex min-h-11 items-center gap-2 text-sm"><input v-model="f.required" type="checkbox" class="h-4 w-4 accent-primary" />必填</label>
                      <label v-if="f.type === 'select' || f.type === 'multiselect'" class="block space-y-1 text-sm"><span>候选项（用顿号、逗号或换行分隔）</span><textarea v-model="f.optionsText" rows="2" class="form-textarea" /></label>
                    </div>
                  </div>
                </fieldset>
                <div class="flex flex-wrap gap-2">
                  <Button type="submit" :disabled="blocked"><Loader2 v-if="busy" class="mr-2 h-4 w-4 animate-spin" />{{ activeId ? '保存修改' : '创建报名' }}</Button>
                  <Button variant="outline" :disabled="blocked" @click="cancelEdit">取消</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <template v-else-if="detail">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="min-w-0 mr-auto break-words text-base font-semibold">{{ detail.name }}</h2>
              <a :href="`/signup?id=${activeId}`" class="inline-flex min-h-11 items-center text-sm text-primary hover:underline">查看成员页面 →</a>
            </div>
            <Card>
              <CardHeader class="flex flex-row flex-wrap items-center gap-2 space-y-0">
                <CardTitle class="mr-auto text-sm">{{ statusLabel(detail) }} · {{ detail.entry_count }} 人报名</CardTitle>
                <Button variant="outline" :disabled="blocked" @click="startEdit">编辑报名</Button>
                <Button variant="outline" :disabled="blocked || detailLoading || !entries.length" @click="() => window.open(signupAdminApi.exportUrl(activeId!), '_blank')"><Download class="mr-2 h-4 w-4" />导出 XLSX</Button>
              </CardHeader>
              <CardContent class="p-0">
                <p v-if="detailLoading" class="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" />正在读取名单…</p>
                <p v-else-if="!entries.length" class="p-6 text-center text-sm text-muted-foreground">还没有人报名。</p>
                <div v-else class="overflow-x-auto" tabindex="0" role="region" aria-label="报名名单">
                  <table class="w-full whitespace-nowrap text-sm">
                    <thead>
<tr class="border-b border-border/40 text-left text-xs text-muted-foreground">
                      <th class="px-3 py-3 font-medium">姓名</th><th class="px-3 py-3 font-medium">学号</th><th class="px-3 py-3 font-medium">班级</th>
                      <th v-for="f in detail.fields" :key="f.key" class="px-3 py-3 font-medium">{{ f.label }}</th>
                      <th class="px-3 py-3 font-medium">报名时间</th><th class="px-3 py-3 font-medium">操作</th>
                    </tr>
</thead>
                    <tbody class="divide-y divide-border/40">
<tr v-for="e in entries" :key="e.id" class="row-action">
                      <td class="px-3 py-2 font-medium">{{ e.display_name }}</td><td class="px-3 py-2 font-mono text-xs">{{ e.student_id }}</td><td class="px-3 py-2 text-xs text-muted-foreground">{{ e.class_label || '—' }}</td>
                      <td v-for="f in detail.fields" :key="f.key" class="px-3 py-2 text-xs">{{ f.type === 'checkbox' ? (e.answers[f.key] ? '是' : '否') : Array.isArray(e.answers[f.key]) ? (e.answers[f.key] as string[]).join('、') || '—' : (e.answers[f.key] || '—') }}</td>
                      <td class="px-3 py-2 text-xs text-muted-foreground">{{ new Date(e.created_at).toLocaleString('zh-CN', { hour12: false }) }}</td>
                      <td class="px-3 py-2"><IconButton :label="`撤销 ${e.display_name} 的报名`" destructive :disabled="blocked" @click="removeEntry(e)"><Trash2 class="h-4 w-4" /></IconButton></td>
                    </tr>
</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 p-4">
              <p class="text-xs text-muted-foreground">删除会清除全部报名记录。</p>
              <Button variant="outline" class="text-destructive" :disabled="blocked" @click="remove"><Trash2 class="mr-2 h-4 w-4" />删除报名活动</Button>
            </div>
          </template>
          <p v-else class="py-20 text-center text-sm text-muted-foreground">选择一个报名活动，或新建报名。</p>
        </div>
      </div>
    </template>
  </div>
</template>
