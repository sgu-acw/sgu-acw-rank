<script setup lang="ts">
/**
 * 成员个人资料 / 改名修改申请卡片。
 *
 * 成员与校外账号修改姓名或学籍信息（学院、专业、班级）统一提交管理员审核，
 * 审核通过后生效并自动留存曾用名。当前已有待审核申请时，展示进度并支持撤回。
 */
import MemberName from './MemberName.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { AlertCircle, CheckCircle2, Clock, FileEdit, Loader2, Undo2, XCircle } from 'lucide-vue-next'
import ActionNotice from './ui/ActionNotice.vue'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import {
  ApiError,
  authApi,
  type AcademicOptions,
  type ReviewRequestRecord,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { confirmAction } from '../lib/confirm'

const props = withDefaults(
  defineProps<{
    /** 外部点“申请修改资料”时可展开表单。 */
    defaultOpen?: boolean
  }>(),
  { defaultOpen: false },
)

const { user, isExternal, isAdmin } = useAuth()

const loading = ref(true)
const submitting = ref(false)
const cancellingId = ref<number | null>(null)
const formOpen = ref(props.defaultOpen)
const error = ref('')
const notice = ref('')

const requests = ref<ReviewRequestRecord[]>([])
const academics = ref<AcademicOptions | null>(null)

const draftName = ref('')
const draftCollege = ref('')
const draftMajor = ref('')
const draftClassNo = ref('')
const draftReason = ref('')

const pendingRequest = computed(
  () => requests.value.find((item) => item.status === 'pending') ?? null,
)

const majorSuggestions = computed(() => {
  const map = academics.value?.majors ?? {}
  const college = draftCollege.value.trim()
  if (college && map[college]?.length) {
    return map[college]
  }
  return [...new Set(Object.values(map).flat())]
})

function resetDraftFromUser() {
  const u = user.value
  if (!u) return
  draftName.value = u.display_name
  draftCollege.value = u.college_name ?? ''
  draftMajor.value = u.major_name ?? ''
  draftClassNo.value = String(u.class_no ?? 0)
  draftReason.value = ''
}

function openForm() {
  resetDraftFromUser()
  error.value = ''
  formOpen.value = true
}

defineExpose({ openForm })

watch(
  () => props.defaultOpen,
  (val) => {
    if (val && !pendingRequest.value) {
      openForm()
    }
  },
)

function flash(msg: string) {
  notice.value = msg
  window.setTimeout(() => {
    if (notice.value === msg) notice.value = ''
  }, 3500)
}

async function load() {
  if (!user.value) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const [list, academicOpts] = await Promise.all([
      authApi.changeRequests(),
      !isExternal.value ? authApi.academics().catch(() => null) : Promise.resolve(null),
    ])
    requests.value = list
    academics.value = academicOpts
    resetDraftFromUser()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '读取申请记录失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** 计算真正发生改动的字段载荷；无改动时返回空对象。 */
const changedPayload = computed(() => {
  const u = user.value
  if (!u) return {} as Record<string, unknown>

  const payload: {
    display_name?: string
    college_override?: string
    major_override?: string
    class_no?: number
    reason?: string
  } = {}

  const nextName = draftName.value.trim()
  if (nextName && nextName !== u.display_name) {
    payload.display_name = nextName
  }

  if (!isExternal.value) {
    const nextCollege = draftCollege.value.trim()
    const currentCollege = (u.college_name ?? '').trim()
    if (nextCollege !== currentCollege) {
      payload.college_override = nextCollege
    }

    const nextMajor = draftMajor.value.trim()
    const currentMajor = (u.major_name ?? '').trim()
    if (nextMajor !== currentMajor) {
      payload.major_override = nextMajor
    }

    const parsedClass = Number.parseInt(draftClassNo.value.trim(), 10)
    if (!Number.isNaN(parsedClass) && parsedClass >= 0 && parsedClass <= 99 && parsedClass !== u.class_no) {
      payload.class_no = parsedClass
    }
  }

  return payload
})

const hasChanges = computed(() => Object.keys(changedPayload.value).length > 0)

const classNoInvalid = computed(() => {
  if (isExternal.value) return false
  const raw = draftClassNo.value.trim()
  if (!raw) return true
  const n = Number(raw)
  return !Number.isInteger(n) || n < 0 || n > 99
})

async function submitRequest() {
  if (submitting.value || !hasChanges.value || classNoInvalid.value) return
  submitting.value = true
  error.value = ''
  try {
    const payload = {
      ...changedPayload.value,
      reason: draftReason.value.trim(),
    }
    const created = await authApi.submitChangeRequest(payload)
    requests.value = [created, ...requests.value]
    formOpen.value = false
    draftReason.value = ''
    flash('资料修改申请已提交，请等待管理员审核')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '提交申请失败'
  } finally {
    submitting.value = false
  }
}

async function cancelRequest(item: ReviewRequestRecord) {
  if (cancellingId.value !== null) return
  if (!await confirmAction('确定撤回这条资料修改申请？撤回后可重新填写提交。')) return
  cancellingId.value = item.id
  error.value = ''
  try {
    await authApi.cancelChangeRequest(item.id)
    item.status = 'cancelled'
    flash('已撤回申请')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '撤回失败'
  } finally {
    cancellingId.value = null
  }
}

function formatDiffLines(item: ReviewRequestRecord): string[] {
  const lines: string[] = []
  const b = item.before ?? {}
  const a = item.after ?? {}
  if (typeof a.display_name === 'string') {
    lines.push(`${isExternal.value ? '昵称' : '姓名'}：${String(b.display_name ?? '—')} → ${a.display_name}`)
  }
  if ('college_name' in a || 'college_override' in a) {
    const next = String(a.college_name || a.college_override || '（按学号识别）')
    lines.push(`学院：${String(b.college_name || '—')} → ${next}`)
  }
  if ('major_name' in a || 'major_override' in a) {
    const next = String(a.major_name || a.major_override || '（按学号识别）')
    lines.push(`专业：${String(b.major_name || '—')} → ${next}`)
  }
  if (typeof a.class_no === 'number') {
    const beforeClass = typeof b.class_no === 'number' && b.class_no > 0 ? `${b.class_no} 班` : '未分班'
    const afterClass = a.class_no > 0 ? `${a.class_no} 班` : '未分班'
    lines.push(`班级：${beforeClass} → ${afterClass}`)
  }
  return lines
}

function statusMeta(status: ReviewRequestRecord['status']) {
  switch (status) {
    case 'pending':
      return { label: '待审核', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400', icon: Clock }
    case 'approved':
      return { label: '已通过', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', icon: CheckCircle2 }
    case 'rejected':
      return { label: '已驳回', cls: 'border-destructive/40 bg-destructive/10 text-destructive', icon: XCircle }
    default:
      return { label: '已撤回', cls: 'border-border/60 bg-muted/40 text-muted-foreground', icon: Undo2 }
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
      <div class="space-y-0.5">
        <CardTitle class="text-base">
          {{ isExternal ? '昵称修改申请' : '个人资料与改名申请' }}
        </CardTitle>
        <p class="text-xs text-muted-foreground">
          <template v-if="isAdmin">
            管理员可在顶部直接改名；此处仅展示历史提交记录。
          </template>
          <template v-else-if="isExternal">
            修改昵称需提交管理员审核，通过后自动更新并留存曾用名记录。
          </template>
          <template v-else>
            修改姓名或转专业/更正学院、班级需提交管理员审核，通过后生效并自动归档曾用名。
          </template>
        </p>
      </div>
      <Button
        v-if="!isAdmin && !pendingRequest && !formOpen"
        size="sm"
        variant="outline"
        @click="openForm"
      >
        <FileEdit class="mr-1.5 h-3.5 w-3.5" />
        发起申请
      </Button>
    </CardHeader>

    <CardContent class="space-y-4">
      <ActionNotice :message="notice" />
      <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
        <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
        <span class="text-sm">{{ error }}</span>
      </Alert>

      <div v-if="loading" class="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 class="h-3.5 w-3.5 animate-spin" />
        正在加载申请记录…
      </div>

      <template v-else>
        <!-- 当前待审核申请 -->
        <div
          v-if="pendingRequest"
          class="space-y-2.5 rounded-lg border border-amber-500/35 bg-amber-500/5 p-3.5"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Clock class="h-3.5 w-3.5" />
              有 1 条申请正在等待管理员审核
            </span>
            <span class="text-[11px] text-muted-foreground">
              提交于 {{ formatTime(pendingRequest.created_at) }}
            </span>
          </div>

          <ul class="space-y-1 text-xs text-foreground">
            <li v-for="line in formatDiffLines(pendingRequest)" :key="line">
              {{ line }}
            </li>
          </ul>
          <p v-if="pendingRequest.reason" class="text-xs text-muted-foreground">
            说明：{{ pendingRequest.reason }}
          </p>

          <div class="pt-1">
            <Button
              size="sm"
              variant="outline"
              :disabled="cancellingId === pendingRequest.id"
              @click="cancelRequest(pendingRequest)"
            >
              <Loader2 v-if="cancellingId === pendingRequest.id" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
              <Undo2 v-else class="mr-1.5 h-3.5 w-3.5" />
              撤回申请
            </Button>
          </div>
        </div>

        <!-- 资料修改表单 -->
        <form
          v-else-if="!isAdmin && formOpen"
          class="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3.5"
          @submit.prevent="submitRequest"
        >
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1">
              <label for="change-display-name" class="text-xs font-medium">
                {{ isExternal ? '新昵称' : '姓名' }}
              </label>
              <Input
                id="change-display-name"
                v-model="draftName"
                maxlength="32"
                :placeholder="isExternal ? '输入新昵称' : '输入真实姓名'"
                class="h-9 text-sm"
              />
            </div>

            <div v-if="!isExternal" class="space-y-1">
              <label for="change-class-no" class="text-xs font-medium">班级序号</label>
              <Input
                id="change-class-no"
                v-model="draftClassNo"
                type="number"
                min="0"
                max="99"
                inputmode="numeric"
                class="h-9 text-sm"
              />
              <p v-if="classNoInvalid" class="text-[11px] text-destructive">
                请输入 0 到 99 之间的整数（0 表示未分班）
              </p>
            </div>

            <div v-if="!isExternal" class="space-y-1">
              <label for="change-college" class="text-xs font-medium">学院</label>
              <Input
                id="change-college"
                v-model="draftCollege"
                list="member-college-options"
                maxlength="64"
                placeholder="选择或输入学院（留空则按学号识别）"
                class="h-9 text-sm"
              />
              <datalist id="member-college-options">
                <option v-for="c in academics?.colleges ?? []" :key="c" :value="c" />
              </datalist>
            </div>

            <div v-if="!isExternal" class="space-y-1">
              <label for="change-major" class="text-xs font-medium">专业</label>
              <Input
                id="change-major"
                v-model="draftMajor"
                list="member-major-options"
                maxlength="64"
                placeholder="选择或输入专业（留空则按学号识别）"
                class="h-9 text-sm"
              />
              <datalist id="member-major-options">
                <option v-for="m in majorSuggestions" :key="m" :value="m" />
              </datalist>
            </div>
          </div>

          <div class="space-y-1">
            <label for="change-reason" class="text-xs font-medium">修改原因（选填）</label>
            <Input
              id="change-reason"
              v-model="draftReason"
              maxlength="300"
              placeholder="例如：转专业、更正录入错误等，便于管理员快速通过"
              class="h-9 text-sm"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" size="sm" :disabled="submitting || !hasChanges || classNoInvalid">
              <Loader2 v-if="submitting" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
              提交审核
            </Button>
            <Button type="button" size="sm" variant="ghost" :disabled="submitting" @click="formOpen = false">
              取消
            </Button>
            <span v-if="!hasChanges" class="text-xs text-muted-foreground">
              请至少修改一项资料后再提交
            </span>
          </div>
        </form>

        <!-- 历史申请列表 -->
        <div v-if="requests.length" class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">最近申请记录</p>
          <div class="divide-y divide-border/40 rounded-lg border border-border/50">
            <div
              v-for="item in requests.slice(0, 8)"
              :key="item.id"
              class="space-y-1 px-3 py-2.5 text-xs"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium"
                  :class="statusMeta(item.status).cls"
                >
                  <component :is="statusMeta(item.status).icon" class="h-3 w-3" />
                  {{ statusMeta(item.status).label }}
                </span>
                <span class="text-muted-foreground">{{ formatTime(item.created_at) }}</span>
                <span v-if="item.reviewer_name" class="ml-auto text-[11px] text-muted-foreground">
                  审核人：<MemberName :name="item.reviewer_name" :signature="item.reviewer_signature" />
                </span>
              </div>
              <p class="text-foreground/90">
                {{ formatDiffLines(item).join('；') || '资料变更' }}
              </p>
              <p v-if="item.review_note" class="text-[11px] text-muted-foreground">
                审核备注：{{ item.review_note }}
              </p>
            </div>
          </div>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
