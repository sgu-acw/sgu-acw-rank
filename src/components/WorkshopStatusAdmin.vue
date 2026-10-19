<script setup lang="ts">
/**
 * 工作坊状态的管理界面。
 *
 * 状态本身是大家看的（/status 页、首页卡片），管理是管理员的事——
 * 所以这张表只出现在管理工作台，公共页面只读。
 */
import { computed, onMounted, ref } from 'vue'
import { CalendarDays, Loader2, Pencil, Plus, X } from 'lucide-vue-next'
import RefreshButton from './ui/RefreshButton.vue'
import IconButton from './ui/IconButton.vue'
import { ApiError, workshopApi, type WorkshopOverride } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import AdminWorkspaceNav from './AdminWorkspaceNav.vue'
import ActionNotice from './ui/ActionNotice.vue'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useNow } from '../lib/useNow'
const clock = useNow()

const schedule = ref<WorkshopOverride[]>([])
const loading = ref(true)
const editing = ref(false)
/** null = 新建；数字 = 正在编辑那条的 id。 */
const editingId = ref<number | null>(null)
const editLabel = ref('')
const editNote = ref('')
const editStart = ref('')
const editUntil = ref('')
const saving = ref(false)
const notice = ref('')
const error = ref('')
const currentId = computed(() => schedule.value.filter(isCurrent).reduce((id, r) => Math.max(id, r.id), 0))

function fmtRange(r: WorkshopOverride): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const s = r.start_at ? new Date(r.start_at) : null
  const e = r.until ? new Date(r.until) : null
  if (!s && !e) return '立即生效 · 直到手动关闭'
  if (s && e && s.toDateString() === e.toDateString())
    return `${s.getMonth() + 1}/${s.getDate()} ${hm(s)} – ${hm(e)}`
  const sp = s ? `${s.getMonth() + 1}/${s.getDate()} ${hm(s)}` : '现在'
  const ep = e ? `${e.getMonth() + 1}/${e.getDate()} ${hm(e)}` : '手动关闭'
  return `${sp} – ${ep}`
}

function isCurrent(r: WorkshopOverride): boolean {
  const now = clock.value
  if (r.start_at && new Date(r.start_at).getTime() > now) return false
  if (r.until && new Date(r.until).getTime() <= now) return false
  return true
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    schedule.value = await workshopApi.adminSchedule()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '读取失败'
  } finally {
    loading.value = false
  }
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function startCreate() {
  if (saving.value) return
  editingId.value = null
  editLabel.value = ''
  editNote.value = ''
  editStart.value = ''
  editUntil.value = ''
  error.value = ''
  editing.value = true
}

function startEdit(r: WorkshopOverride) {
  if (saving.value) return
  editingId.value = r.id
  editLabel.value = r.label
  editNote.value = r.note
  editStart.value = r.start_at ? toLocalInput(r.start_at) : ''
  editUntil.value = r.until ? toLocalInput(r.until) : ''
  error.value = ''
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  editingId.value = null
}

async function save() {
  if (saving.value) return
  const label = editLabel.value.trim()
  if (!label) {
    error.value = '状态词不能为空'
    return
  }
  if (editStart.value && editUntil.value && editUntil.value <= editStart.value) {
    error.value = '结束时间要晚于开始时间'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload = {
      label,
      note: editNote.value.trim(),
      start_at: editStart.value ? new Date(editStart.value).toISOString() : null,
      until: editUntil.value ? new Date(editUntil.value).toISOString() : null,
    }
    if (editingId.value === null) {
      await workshopApi.setOverride(payload)
    } else {
      await workshopApi.updateOverride(editingId.value, payload)
    }
    editing.value = false
    editingId.value = null
    notice.value = '已保存'
    window.setTimeout(() => { if (notice.value === '已保存') notice.value = '' }, 3000)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function remove(r: WorkshopOverride) {
  if (saving.value) return
  if (!await confirmAction(`删掉「${r.label}」这条状态？`)) return
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    await workshopApi.deleteOverride(r.id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-6xl space-y-4">
    <AdminWorkspaceNav active="status">
      <RefreshButton :busy="loading || saving" @click="() => { if (!saving) load() }" />
    </AdminWorkspaceNav>

    <ActionNotice :message="notice" />
    <ActionNotice :message="error" variant="error" />
    <p v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" />正在读取…</p>

    <template v-else>
      <div class="rounded-lg border border-border/40 bg-card p-6">
        <div class="flex items-center justify-between gap-3">
          <h2 class="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarDays class="h-4 w-4" />状态时间表
          </h2>
          <Button v-if="!editing" :disabled="saving" @click="startCreate">
            <Plus class="mr-1 h-3.5 w-3.5" />添加状态
          </Button>
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground">
          到点自动生效、过点自动恢复。比如「明天下午两点集训队比赛」。<a href="/status" class="text-primary hover:underline">查看公开页面 →</a>
        </p>

        <div v-if="schedule.length" class="mt-4 divide-y divide-border/40">
          <div v-for="r in schedule" :key="r.id" class="flex items-start gap-3 py-3">
            <span
              class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              :class="r.id === currentId ? 'bg-violet-500' : 'bg-muted-foreground/40'"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{{ r.label }}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ fmtRange(r) }}
                <span v-if="r.id === currentId" class="text-violet-600 dark:text-violet-400"> · 生效中</span>
                <span v-else-if="isCurrent(r)"> · 被较新状态覆盖</span>
                <span v-else>{{ r.until && Date.parse(r.until) <= clock ? ' · 已结束' : ' · 未开始' }}</span>
              </p>
              <p v-if="r.note" class="mt-0.5 text-xs text-muted-foreground/80">{{ r.note }}</p>
            </div>
            <div class="mt-1 flex shrink-0 items-center">
              <IconButton :label="`编辑状态 ${r.label}`" :disabled="saving" @click="startEdit(r)"><Pencil class="h-4 w-4" /></IconButton>
              <IconButton :label="`删除状态 ${r.label}`" destructive :disabled="saving" @click="remove(r)"><X class="h-4 w-4" /></IconButton>
            </div>
          </div>
        </div>
        <p v-else class="mt-4 text-xs text-muted-foreground">暂时没有排期。</p>
      </div>

      <div v-if="editing" class="rounded-lg border border-border/40 bg-card p-6">
        <p class="mb-1 text-xs font-medium text-muted-foreground">
          {{ editingId === null ? '添加状态' : `编辑「${schedule.find((s) => s.id === editingId)?.label ?? ''}」` }}
        </p>
        <div class="space-y-3">
          <Input v-model="editLabel" placeholder="状态词，如：集训队比赛" maxlength="40" class="min-h-11" />
          <Input v-model="editNote" placeholder="补充说明（可选）" maxlength="200" class="min-h-11" />
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs text-muted-foreground">开始（留空 = 立即生效）</label>
              <Input v-model="editStart" type="datetime-local" aria-label="开始时间" :disabled="saving" />
            </div>
            <div>
              <label class="mb-1 block text-xs text-muted-foreground">结束（留空 = 手动关闭）</label>
              <Input v-model="editUntil" type="datetime-local" aria-label="结束时间" :disabled="saving" />
            </div>
          </div>
          <div class="flex gap-2">
            <Button :disabled="saving" @click="save">
              <Loader2 v-if="saving" class="mr-1 h-3.5 w-3.5 animate-spin" />保存
            </Button>
            <Button variant="outline" :disabled="saving" @click="cancelEdit">取消</Button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
