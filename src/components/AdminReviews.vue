<script setup lang="ts">
/**
 * 管理员审核工作台：统一处理新用户注册审核与成员改名/资料修改申请。
 */
import MemberName from './MemberName.vue'
import { computed, onMounted, ref, watch } from 'vue'
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  FileEdit,
  Loader2,
  Search,
  Undo2,
  UserPlus,
  X,
  XCircle,
} from 'lucide-vue-next'
import AdminWorkspaceNav from './AdminWorkspaceNav.vue'
import ActionNotice from './ui/ActionNotice.vue'
import RefreshButton from './ui/RefreshButton.vue'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import {
  ApiError,
  adminApi,
  type AdminReviewPage,
  type ReviewRequestRecord,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { confirmAction } from '../lib/confirm'

const { user, isAdmin, ensureLoaded } = useAuth()

const loading = ref(true)
const refreshing = ref(false)
const actingId = ref<number | null>(null)
const error = ref('')
const notice = ref('')

const pageData = ref<AdminReviewPage | null>(null)
const noteDrafts = ref<Record<number, string>>({})

const filters = ref({
  status: 'pending' as 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all',
  kind: '' as '' | 'registration' | 'profile_change',
  q: '',
  page: 1,
  page_size: 20,
})

const items = computed(() => pageData.value?.items ?? [])
const totalPages = computed(() => {
  if (!pageData.value) return 1
  return Math.max(1, Math.ceil(pageData.value.total / pageData.value.page_size))
})

const STATUS_TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
  { key: 'cancelled', label: '已撤回' },
  { key: 'all', label: '全部' },
] as const

const KIND_TABS = [
  { key: '', label: '全部类型' },
  { key: 'registration', label: '新用户注册' },
  { key: 'profile_change', label: '改名 / 资料修改' },
] as const

function flash(msg: string) {
  notice.value = msg
  window.setTimeout(() => {
    if (notice.value === msg) notice.value = ''
  }, 3000)
}

async function load(isRefresh = false) {
  if (isRefresh) refreshing.value = true
  else loading.value = true
  error.value = ''
  try {
    pageData.value = await adminApi.reviews({
      status: filters.value.status,
      kind: filters.value.kind || undefined,
      q: filters.value.q.trim() || undefined,
      page: filters.value.page,
      page_size: filters.value.page_size,
    })
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载审核列表失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

let searchTimer: number | undefined
watch(
  () => filters.value.q,
  () => {
    window.clearTimeout(searchTimer)
    searchTimer = window.setTimeout(() => {
      filters.value.page = 1
      void load(true)
    }, 300)
  },
)

watch(
  () => [filters.value.status, filters.value.kind],
  () => {
    filters.value.page = 1
    void load(true)
  },
)

function goPage(next: number) {
  if (next < 1 || next > totalPages.value) return
  filters.value.page = next
  void load(true)
}

async function approve(item: ReviewRequestRecord) {
  if (actingId.value !== null || item.user_id === user.value?.id) return
  actingId.value = item.id
  error.value = ''
  try {
    const note = (noteDrafts.value[item.id] ?? '').trim()
    await adminApi.approveReview(item.id, note)
    delete noteDrafts.value[item.id]
    flash(
      item.kind === 'registration'
        ? `已通过「${item.current_display_name}」的注册申请`
        : `已通过「${item.current_display_name}」的资料修改申请`,
    )
    await load(true)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '通过审核失败'
  } finally {
    actingId.value = null
  }
}

async function reject(item: ReviewRequestRecord) {
  if (actingId.value !== null || item.user_id === user.value?.id) return
  const hint =
    item.kind === 'registration'
      ? `确定驳回「${item.current_display_name}（${item.student_id}）」的注册申请？\n\n待审占位账号将被删除，若使用了邀请码其名额会自动退回。`
      : `确定驳回「${item.current_display_name}（${item.student_id}）」的资料修改申请？原资料将保持不变。`
  if (!await confirmAction(hint) || actingId.value !== null || item.user_id === user.value?.id) return
  if (!pageData.value?.items.some((row) => row.id === item.id && row.status === 'pending')) return

  actingId.value = item.id
  error.value = ''
  try {
    const note = (noteDrafts.value[item.id] ?? '').trim()
    await adminApi.rejectReview(item.id, note)
    delete noteDrafts.value[item.id]
    flash(`已驳回「${item.current_display_name}」的申请`)
    await load(true)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '驳回审核失败'
  } finally {
    actingId.value = null
  }
}

function roleLabel(role: string): string {
  if (role === 'root') return 'root'
  if (role === 'admin') return '管理员'
  if (role === 'external') return '校外账号'
  return '校内成员'
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
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function profileDiffs(item: ReviewRequestRecord): Array<{ label: string; before: string; after: string }> {
  const rows: Array<{ label: string; before: string; after: string }> = []
  const b = item.before ?? {}
  const a = item.after ?? {}
  if (typeof a.display_name === 'string') {
    rows.push({
      label: item.role === 'external' ? '昵称' : '姓名',
      before: String(b.display_name || '（空）'),
      after: a.display_name,
    })
  }
  if ('college_name' in a || 'college_override' in a) {
    rows.push({
      label: '学院',
      before: String(b.college_name || '（未设置）'),
      after: String(a.college_name || a.college_override || '（恢复按学号识别）'),
    })
  }
  if ('major_name' in a || 'major_override' in a) {
    rows.push({
      label: '专业',
      before: String(b.major_name || '（未设置）'),
      after: String(a.major_name || a.major_override || '（恢复按学号识别）'),
    })
  }
  if (typeof a.class_no === 'number') {
    const beforeClass = typeof b.class_no === 'number' && b.class_no > 0 ? `${b.class_no} 班` : '未分班'
    const afterClass = a.class_no > 0 ? `${a.class_no} 班` : '未分班'
    rows.push({ label: '班级', before: beforeClass, after: afterClass })
  }
  return rows
}

function registrationSummary(item: ReviewRequestRecord): string {
  const a = item.after ?? {}
  if (item.role === 'external') {
    return '校外自助注册（免邀请码，仅开放公开与在线练习功能）'
  }
  const parts: string[] = []
  if (a.enroll_year) parts.push(`${String(a.enroll_year)} 级`)
  if (a.college_name) parts.push(String(a.college_name))
  if (a.major_name) parts.push(String(a.major_name))
  if (a.class_label) parts.push(String(a.class_label))
  else if (typeof a.class_no === 'number' && a.class_no > 0) parts.push(`${a.class_no} 班`)
  return parts.join(' · ') || '校内邀请码注册'
}

onMounted(async () => {
  await ensureLoaded()
  if (isAdmin.value) await load()
  else loading.value = false
})
</script>

<template>
  <div class="space-y-6">
    <div v-if="loading" class="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <Alert v-else-if="!isAdmin" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">这个页面只有管理员能看</span>
    </Alert>

    <template v-else>
      <AdminWorkspaceNav active="reviews">
        <RefreshButton :busy="loading || refreshing || actingId !== null" @click="load(true)" />
      </AdminWorkspaceNav>

      <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
        <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
        <span class="text-sm">{{ error }}</span>
      </Alert>
      <ActionNotice :message="notice" />

      <!-- 待审概览 -->
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-border/60 bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">全部待审核</p>
          <p class="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {{ pageData?.pending_count ?? 0 }}
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:border-primary/50"
          @click="filters.status = 'pending'; filters.kind = 'registration'"
        >
          <p class="text-xs text-muted-foreground">新用户注册待审</p>
          <p class="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {{ pageData?.pending_registration_count ?? 0 }}
          </p>
        </button>
        <button
          type="button"
          class="rounded-lg border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:border-primary/50"
          @click="filters.status = 'pending'; filters.kind = 'profile_change'"
        >
          <p class="text-xs text-muted-foreground">改名 / 资料修改待审</p>
          <p class="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {{ pageData?.pending_profile_change_count ?? 0 }}
          </p>
        </button>
      </div>

      <!-- 筛选与列表 -->
      <Card>
        <CardHeader class="space-y-3 pb-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <CardTitle class="text-sm font-medium">
              审核列表
              <span v-if="pageData" class="ml-1 font-normal text-muted-foreground">
                {{ pageData.total }} 条
              </span>
            </CardTitle>

            <!-- 状态切换 -->
            <div class="flex flex-wrap gap-1">
              <button
                v-for="tab in STATUS_TABS"
                :key="tab.key"
                type="button"
                class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                :class="
                  filters.status === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                "
                @click="filters.status = tab.key"
              >
                {{ tab.label }}
              </button>
            </div>
          </div>

          <!-- 类型与关键词搜索 -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative min-w-[200px] flex-1">
              <Search class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                v-model="filters.q"
                placeholder="搜学号、用户名、姓名或修改内容"
                class="h-9 pl-8 text-xs"
              />
            </div>

            <div class="flex flex-wrap gap-1">
              <button
                v-for="tab in KIND_TABS"
                :key="tab.key"
                type="button"
                class="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
                :class="
                  filters.kind === tab.key
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border/60 bg-background text-muted-foreground hover:text-foreground'
                "
                @click="filters.kind = tab.key"
              >
                {{ tab.label }}
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent class="p-0">
          <div v-if="!items.length" class="px-4 py-10 text-center text-sm text-muted-foreground">
            {{ filters.status === 'pending' ? '当前没有待处理的审核申请' : '没有符合条件的审核记录' }}
          </div>

          <div v-else class="divide-y divide-border/50">
            <div v-for="item in items" :key="item.id" class="space-y-3 px-4 py-4">
              <!-- 头部标签与申请人 -->
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium"
                  :class="
                    item.kind === 'registration'
                      ? 'border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-400'
                      : 'border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-400'
                  "
                >
                  <UserPlus v-if="item.kind === 'registration'" class="h-3 w-3" />
                  <FileEdit v-else class="h-3 w-3" />
                  {{ item.kind === 'registration' ? '注册审核' : '资料修改' }}
                </span>

                <span
                  class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium"
                  :class="statusMeta(item.status).cls"
                >
                  <component :is="statusMeta(item.status).icon" class="h-3 w-3" />
                  {{ statusMeta(item.status).label }}
                </span>

                <span class="rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {{ roleLabel(item.role) }}
                </span>

                <a
                  v-if="item.user_id && item.role !== 'external'"
                  :href="`/member?id=${item.user_id}`"
                  class="text-sm font-semibold underline-offset-4 hover:underline"
                >
                  <MemberName :name="item.current_display_name" :signature="item.signature" />
                </a>
                <span v-else class="text-sm font-semibold">
                  <MemberName :name="item.current_display_name" :signature="item.signature" />
                </span>
                <span class="font-mono text-xs text-muted-foreground">{{ item.student_id }}</span>

                <span class="ml-auto text-xs text-muted-foreground">
                  {{ formatTime(item.created_at) }}
                </span>
              </div>

              <!-- 注册申请详情 -->
              <div
                v-if="item.kind === 'registration'"
                class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/50 bg-muted/25 px-3 py-2 text-xs text-muted-foreground"
              >
                <span class="text-foreground">{{ registrationSummary(item) }}</span>
                <span v-if="item.invite_code" class="font-mono">
                  邀请码：{{ item.invite_code }}
                </span>
              </div>

              <!-- 资料修改 diff -->
              <div
                v-else
                class="space-y-1.5 rounded-md border border-border/50 bg-muted/25 px-3 py-2.5 text-xs"
              >
                <div
                  v-for="diff in profileDiffs(item)"
                  :key="diff.label"
                  class="flex flex-wrap items-center gap-1.5"
                >
                  <span class="w-10 shrink-0 font-medium text-muted-foreground">{{ diff.label }}</span>
                  <span class="rounded bg-background px-1.5 py-0.5 text-muted-foreground line-through">
                    {{ diff.before }}
                  </span>
                  <ArrowRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span class="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-foreground">
                    {{ diff.after }}
                  </span>
                </div>
                <p v-if="item.reason" class="pt-1 text-muted-foreground">
                  申请说明：{{ item.reason }}
                </p>
              </div>

              <!-- 待审核操作区 -->
              <div
                v-if="item.status === 'pending'"
                class="flex flex-col gap-2 sm:flex-row sm:items-center"
              >
                <Input
                  v-model="noteDrafts[item.id]"
                  maxlength="300"
                  placeholder="审核备注（选填，例如驳回原因）"
                  class="h-9 flex-1 text-xs"
                />
                <div class="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    :disabled="actingId !== null || item.user_id === user?.id"
                    @click="approve(item)"
                  >
                    <Loader2 v-if="actingId === item.id" class="mr-1 h-3.5 w-3.5 animate-spin" />
                    <Check v-else class="mr-1 h-3.5 w-3.5" />
                    通过
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    class="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    :disabled="actingId !== null || item.user_id === user?.id"
                    @click="reject(item)"
                  >
                    <X class="mr-1 h-3.5 w-3.5" />
                    驳回
                  </Button>
                  <span v-if="item.user_id === user?.id" class="text-xs text-muted-foreground">请由其他管理员处理</span>
                </div>
              </div>

              <!-- 已处理结果 -->
              <div v-else class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span v-if="item.reviewer_name">
                  处理人：<MemberName :name="item.reviewer_name" :signature="item.reviewer_signature" />
                  <span v-if="item.reviewer_student_id" class="font-mono">({{ item.reviewer_student_id }})</span>
                </span>
                <span v-if="item.reviewed_at">处理时间：{{ formatTime(item.reviewed_at) }}</span>
                <span v-if="item.review_note" class="text-foreground/80">
                  备注：{{ item.review_note }}
                </span>
              </div>
            </div>
          </div>

          <!-- 分页 -->
          <div
            v-if="pageData && totalPages > 1"
            class="flex items-center justify-between border-t border-border/50 px-4 py-3 text-xs text-muted-foreground"
          >
            <span>第 {{ filters.page }} / {{ totalPages }} 页（共 {{ pageData.total }} 条）</span>
            <div class="flex gap-2">
              <Button size="sm" variant="outline" :disabled="filters.page <= 1" @click="goPage(filters.page - 1)">
                上一页
              </Button>
              <Button size="sm" variant="outline" :disabled="filters.page >= totalPages" @click="goPage(filters.page + 1)">
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
