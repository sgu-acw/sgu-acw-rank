<script setup lang="ts">
import { confirmAction } from '../lib/confirm'
/**
 * 管理页：邀请码、成员管理、管理员备注。
 *
 * 只有 admin 或 root 能用。页面本身是静态的，拦不住人，真正的权限在
 * 后端——这里只是不给无权的人显示入口，每个请求失败都会照常提示。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { AlertCircle, Check, ChevronDown, Copy, KeyRound, Link2, Loader2, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Trash2, Users, X } from 'lucide-vue-next'
import AdminWorkspaceNav from './AdminWorkspaceNav.vue'
import ActionNotice from './ui/ActionNotice.vue'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import {
  ApiError,
  PLATFORM_META,
  adminApi,
  type AcademicOptions,
  type AdminUser,
  type AdminUserPage,
  type Invite,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatEnrollYear } from '../lib/format'

const { user, ensureLoaded, isAdmin } = useAuth()

const loading = ref(true)
const error = ref('')
const notice = ref('')

const invites = ref<Invite[]>([])
const page = ref<AdminUserPage | null>(null)
const stats = ref<{
  user_count: number
  active_count: number
  admin_count: number
  usable_invite_count: number
  push_subscriber_count: number
  push_device_count: number
} | null>(null)
const academics = ref<AcademicOptions | null>(null)
const academicMajors = computed(() => [
  ...new Set(Object.values(academics.value?.majors ?? {}).flat()),
])

// 成员筛选条件。改动后重新拉取，搜索框做防抖。
const filters = ref({
  q: '',
  role: '',
  status: '',
  enroll_year: null as number | null,
  college_code: '',
  has_account: null as boolean | null,
  sort: 'enroll_year',
  page: 1,
  page_size: 20,
})

// 新建邀请码的表单
const form = ref({
  max_uses: 5,
  ttl_hours: 24,
  grants_role: 'member',
  note: '',
})

// 新建成员的表单
const showCreate = ref(false)
const showInviteCreate = ref(false)
const showAdvancedFilters = ref(false)
const activeSection = ref<'members' | 'invites'>('members')
const creating = ref(false)
const createForm = ref({
  student_id: '',
  display_name: '',
  password: '',
  role: 'member',
  admin_note: '',
})

// 成员资料编辑草稿：一次只展开一行，统一保存姓名、备注和学院/专业覆盖。
const editingMemberId = ref<number | null>(null)
const editingNote = ref<Record<number, string>>({})
const editingCanPost = ref<Record<number, boolean>>({})
const editingName = ref<Record<number, string>>({})
//: 学院名/专业名的人工覆盖。空串表示恢复成按学号查表。
const editingCollege = ref<Record<number, string>>({})
const editingMajor = ref<Record<number, string>>({})
const editingClassNo = ref<Record<number, string>>({})
const savingNote = ref<number | null>(null)
const copiedCode = ref<string | null>(null)

const members = computed(() => page.value?.items ?? [])
const totalPages = computed(() => {
  if (!page.value) return 1
  return Math.max(1, Math.ceil(page.value.total / page.value.page_size))
})

/** 是否有任何筛选条件生效，用于决定要不要显示「清除」。 */
const hasFilters = computed(
  () =>
    !!filters.value.q ||
    !!filters.value.role ||
    !!filters.value.status ||
    filters.value.enroll_year !== null ||
    !!filters.value.college_code ||
    filters.value.has_account !== null ||
    filters.value.sort !== 'enroll_year',
)

function flash(message: string) {
  notice.value = message
  window.setTimeout(() => {
    if (notice.value === message) notice.value = ''
  }, 2500)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [inviteList, userPage, summary, academicList] = await Promise.all([
      adminApi.invites(),
      adminApi.users(filters.value),
      adminApi.stats(),
      adminApi.academics(),
    ])
    invites.value = inviteList
    page.value = userPage
    stats.value = summary
    academics.value = academicList
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

/** 只重拉成员列表，不动邀请码和统计。筛选变动时用这个。 */
async function reloadMembers() {
  try {
    page.value = await adminApi.users(filters.value)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败'
  }
}

// 搜索框防抖：每敲一个字就发请求太浪费。
let searchTimer: number | undefined
watch(
  () => filters.value.q,
  () => {
    window.clearTimeout(searchTimer)
    searchTimer = window.setTimeout(() => {
      filters.value.page = 1
      reloadMembers()
    }, 300)
  },
)

// 其余筛选项立即生效，并回到第一页（否则可能停在一个空页上）。
watch(
  () => [
    filters.value.role,
    filters.value.status,
    filters.value.enroll_year,
    filters.value.college_code,
    filters.value.has_account,
    filters.value.sort,
  ],
  () => {
    filters.value.page = 1
    reloadMembers()
  },
)

function clearFilters() {
  filters.value.q = ''
  filters.value.role = ''
  filters.value.status = ''
  filters.value.enroll_year = null
  filters.value.college_code = ''
  filters.value.has_account = null
  filters.value.sort = 'enroll_year'
  showAdvancedFilters.value = false
}

function goPage(next: number) {
  if (next < 1 || next > totalPages.value) return
  filters.value.page = next
  reloadMembers()
}

async function createUser() {
  creating.value = true
  error.value = ''
  try {
    await adminApi.createUser({
      student_id: createForm.value.student_id.trim(),
      display_name: createForm.value.display_name.trim(),
      password: createForm.value.password,
      role: createForm.value.role,
      admin_note: createForm.value.admin_note,
    })
    createForm.value = { student_id: '', display_name: '', password: '', role: 'member', admin_note: '' }
    showCreate.value = false
    await load()
    flash('已创建')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '创建失败'
  } finally {
    creating.value = false
  }
}

async function changeRole(target: AdminUser, role: string) {
  if (role === target.role) return
  const label = roleLabel(role)
  if (!await confirmAction(`把 ${target.display_name} 的身份改为「${label}」？`)) return
  try {
    const updated = await adminApi.updateUser(target.id, { role })
    target.role = updated.role
    await load()
    flash(`已改为${label}`)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '修改失败'
  }
}

async function deleteUser(target: AdminUser) {
  if (!await confirmAction(`确定删除 ${target.display_name}（${target.student_id}）？\n\n会同时删掉其平台绑定与练习记录，不可恢复。`)) return
  try {
    await adminApi.deleteUser(target.id)
    await load()
    flash('已删除')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败'
  }
}

async function createInvite() {
  error.value = ''
  try {
    const created = await adminApi.createInvite({
      max_uses: form.value.max_uses,
      ttl_hours: form.value.ttl_hours,
      grants_role: form.value.grants_role,
      note: form.value.note,
    })
    invites.value = [created, ...invites.value]
    flash(`已创建邀请码 ${created.code}`)
    if (stats.value) stats.value.usable_invite_count += 1
    showInviteCreate.value = false
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '创建失败'
  }
}

async function revoke(invite: Invite) {
  if (!await confirmAction(`确定撤销 ${invite.code}？已经用掉的不会退回。`)) return
  try {
    await adminApi.revokeInvite(invite.id)
    invite.revoked_at = new Date().toISOString()
    if (stats.value && stats.value.usable_invite_count > 0) stats.value.usable_invite_count -= 1
    flash('已撤销')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '撤销失败'
  }
}

/** 邀请链接。成员点开就直接进注册页并填好码。 */
function inviteLink(code: string): string {
  return `${window.location.origin}/register?code=${code}`
}

async function copyText(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedCode.value = key
    window.setTimeout(() => {
      if (copiedCode.value === key) copiedCode.value = null
    }, 1500)
  } catch {
    // 剪贴板不可用（非 https 或未授权）时不去打扰用户，内容就在页面上。
  }
}

/** 复制码本身，用于手抄或贴在文字里。 */
const copyCode = (code: string) => copyText(code, code)

/** 复制整条链接，用于发到群里。 */
const copyLink = (code: string) => copyText(inviteLink(code), `link:${code}`)

function startEditMember(target: AdminUser) {
  editingMemberId.value = target.id
  editingName.value[target.id] = target.display_name
  editingNote.value[target.id] = target.admin_note ?? ''
  editingCanPost.value[target.id] = target.can_post ?? false
  editingCollege.value[target.id] = target.college_name ?? ''
  editingMajor.value[target.id] = target.major_name ?? ''
  editingClassNo.value[target.id] = target.class_no ? String(target.class_no) : ''
}

function cancelEditMember(target: AdminUser) {
  delete editingNote.value[target.id]
  delete editingName.value[target.id]
  delete editingCollege.value[target.id]
  delete editingMajor.value[target.id]
  delete editingClassNo.value[target.id]
  editingMemberId.value = null
}

async function saveNote(target: AdminUser) {
  const payload: {
    admin_note?: string
    display_name?: string
    college_override?: string
    major_override?: string
    can_post?: boolean
    class_no?: number
  } = {}
  if (editingNote.value[target.id] !== undefined) payload.admin_note = editingNote.value[target.id]
  if (editingCanPost.value[target.id] !== undefined) payload.can_post = editingCanPost.value[target.id]
  if (editingName.value[target.id] !== undefined) payload.display_name = editingName.value[target.id]
  if (editingCollege.value[target.id] !== undefined) {
    payload.college_override = editingCollege.value[target.id]
  }
  if (editingMajor.value[target.id] !== undefined) {
    payload.major_override = editingMajor.value[target.id]
  }
  if (editingClassNo.value[target.id] !== undefined) {
    const n = parseInt(editingClassNo.value[target.id], 10)
    payload.class_no = Number.isFinite(n) ? n : 0
  }
  if (!Object.keys(payload).length) return

  savingNote.value = target.id
  try {
    const updated = await adminApi.updateUser(target.id, payload)
    target.admin_note = updated.admin_note
    target.display_name = updated.display_name
    target.can_post = updated.can_post
    target.college_name = updated.college_name
    target.major_name = updated.major_name
    target.class_no = updated.class_no
    delete editingNote.value[target.id]
    delete editingName.value[target.id]
    delete editingCollege.value[target.id]
    delete editingMajor.value[target.id]
    delete editingClassNo.value[target.id]
    editingMemberId.value = null
    flash('已保存')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败'
  } finally {
    savingNote.value = null
  }
}

async function toggleStatus(target: AdminUser) {
  const next = target.status === 'active' ? 'disabled' : 'active'
  const verb = next === 'disabled' ? '停用' : '启用'
  if (!await confirmAction(`确定${verb} ${target.display_name}？`)) return
  try {
    const updated = await adminApi.updateUser(target.id, { status: next })
    target.status = updated.status
    flash(`已${verb}`)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '操作失败'
  }
}

async function resetPassword(target: AdminUser) {
  if (!await confirmAction(`重置 ${target.display_name} 的密码？对方会被登出。`)) return
  try {
    const result = await adminApi.resetPassword(target.id)
    await confirmAction(
      `${result.display_name}（${result.student_id}）的新密码：\n\n${result.temporary_password}\n\n` +
        '这串只显示这一次，请转告本人。',
      '密码已重置', true,
    )
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '重置失败'
  }
}

function roleLabel(role: string): string {
  return role === 'root' ? 'root' : role === 'admin' ? '管理员' : '成员'
}

/** 能不能改这个人的角色。
 *
 * 管理员之间是平级的，所以任何管理员都能改别人的角色。两个例外：
 * root 动不了（要转让得走别的路），以及自己——把自己降级会当场失去
 * 管理权限，多半是误操作。
 */
function canChangeRole(member: AdminUser): boolean {
  if (member.role === 'root') return false
  if (member.id === user.value?.id) return false
  return true
}

function inviteState(invite: Invite): { text: string; tone: string } {
  if (invite.revoked_at) return { text: '已撤销', tone: 'text-muted-foreground' }
  if (new Date(invite.expires_at) <= new Date()) return { text: '已过期', tone: 'text-muted-foreground' }
  if (invite.use_count >= invite.max_uses) return { text: '已用尽', tone: 'text-muted-foreground' }
  return { text: '可用', tone: 'text-emerald-600 dark:text-emerald-500' }
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
      <AdminWorkspaceNav active="people" />
      <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
        <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
        <span class="text-sm">{{ error }}</span>
      </Alert>
      <ActionNotice :message="notice" />

      <!--
        账号 / 邀请码。

        标签不叫「成员」：上面那排分段控件已经有「成员」了，同屏两个
        「成员」会分不清哪个管什么。这一层管的是账号（学号、密码重置、
        身份），叫「账号」更准确。

        图标配文字，不单用图标——图标在手机上只占二十几像素，孤零零
        两个认不出是切换器。
      -->
      <div class="flex flex-wrap items-center gap-1 border-b border-border/50" role="tablist" aria-label="管理内容分区">
        <button
          type="button"
          role="tab"
          :aria-selected="activeSection === 'members'"
          class="relative flex min-h-11 items-center gap-1.5 px-3 text-sm font-medium transition-colors"
          :class="activeSection === 'members' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeSection = 'members'"
        >
          <Users class="h-4 w-4" />
          账号
          <span v-if="activeSection === 'members'" class="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeSection === 'invites'"
          class="relative flex min-h-11 items-center gap-1.5 px-3 text-sm font-medium transition-colors"
          :class="activeSection === 'invites' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeSection = 'invites'"
        >
          <KeyRound class="h-4 w-4" />
          邀请码
          <span v-if="activeSection === 'invites'" class="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
        </button>

        <!--
          在用账号 / 管理员。原来这两项和成员数、邀请码数一起摆成一张
          四项统计卡，但后两项就在左边图标旁，那张卡看起来像在重复。
          现在只留这两个没有别处可看的数据，靠右放，与左边的分区切换分开。
        -->
        <div v-if="stats" class="ml-auto hidden items-center gap-3 pb-2 text-xs text-muted-foreground sm:flex">
          <span>
            在用
            <span class="ml-1 font-mono tabular-nums text-foreground">{{ stats.active_count }}</span>
          </span>
          <span class="text-border">·</span>
          <span>
            管理员
            <span class="ml-1 font-mono tabular-nums text-foreground">{{ stats.admin_count }}</span>
          </span>
          <span class="text-border">·</span>
          <span title="开了推送通知的成员数（一人多设备算一次）">
            开通知
            <span class="ml-1 font-mono tabular-nums text-foreground">{{ stats.push_subscriber_count }}</span>
          </span>
        </div>
      </div>

      <section v-if="activeSection === 'invites'" class="admin-section-content space-y-4">
      <!-- 表单默认收起，先展示现有邀请码；新建时再展开。 -->
      <Card v-if="showInviteCreate" class="admin-section-content">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium">创建邀请码</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="space-y-1.5">
              <label class="text-xs font-medium">人数上限</label>
              <Input v-model.number="form.max_uses" type="number" min="1" max="500" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium">有效小时</label>
              <Input v-model.number="form.ttl_hours" type="number" min="1" max="8760" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium">授予身份</label>
              <select
                v-model="form.grants_role"
                class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="member">成员</option>
                <option value="admin">管理员</option>
              </select>
            </div>
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium">备注（仅管理员可见）</label>
            <Input v-model="form.note" placeholder="给谁用的、什么时候发的" />
          </div>
          <Button size="sm" @click="createInvite">生成</Button>
          <!-- 规则，不是复述控件：谁先到谁生效、能不能授予 root。 -->
          <p class="text-xs text-muted-foreground">
            人数和时间谁先到谁生效。管理员之间平级，可以互相任命；root 不能通过邀请码授予。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle class="text-sm font-medium">
                邀请码
                <span v-if="stats" class="ml-1 font-normal text-muted-foreground">
                  {{ stats.usable_invite_count }} 个可用
                </span>
              </CardTitle>
            </div>
            <Button size="sm" variant="outline" @click="showInviteCreate = !showInviteCreate">
              <Plus class="mr-1.5 h-3.5 w-3.5" />
              {{ showInviteCreate ? '收起表单' : '新建邀请码' }}
            </Button>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <div v-if="!invites.length" class="p-4 text-sm text-muted-foreground">还没有邀请码</div>
          <div v-else class="divide-y divide-border/40">
            <div v-for="invite in invites" :key="invite.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/25">
              <button
                class="flex items-center gap-1.5 font-mono text-sm hover:text-primary"
                title="点击复制邀请码"
                @click="copyCode(invite.code)"
              >
                {{ invite.code }}
                <Copy v-if="copiedCode !== invite.code" class="h-3 w-3 text-muted-foreground/50" />
                <Check v-else class="h-3 w-3 text-emerald-500" />
              </button>

              <button
                class="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                title="复制邀请链接，成员点开即自动填入"
                @click="copyLink(invite.code)"
              >
                <Link2 class="h-3 w-3" />
                链接
                <Check v-if="copiedCode === `link:${invite.code}`" class="h-3 w-3 text-emerald-500" />
              </button>

              <span class="text-xs" :class="inviteState(invite).tone">{{ inviteState(invite).text }}</span>

              <span class="text-xs text-muted-foreground">
                {{ invite.use_count }}/{{ invite.max_uses }} 人 ·
                {{ invite.grants_role === 'admin' ? '管理员' : '成员' }}
              </span>

              <!--
                创建者。码被转发或发错人时，得知道找谁问。
                姓名可能重名，所以带上学号——名单里两个人同名的概率不低。
              -->
              <span v-if="invite.created_by_name" class="shrink-0 text-xs text-muted-foreground/70">
                {{ invite.created_by_name }}
                <span class="font-mono text-[10px]">{{ invite.created_by_student_id }}</span>
                创建
              </span>

              <span v-if="invite.note" class="max-w-56 truncate text-xs text-muted-foreground/70">
                {{ invite.note }}
              </span>

              <Button
                v-if="!invite.revoked_at"
                variant="ghost"
                size="sm"
                class="ml-auto shrink-0"
                @click="revoke(invite)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
        </section>

      <section v-else class="admin-section-content space-y-4">
      <!-- 成员 -->
      <Card>
        <CardHeader class="pb-3">
          <div class="flex items-center justify-between">
            <CardTitle class="text-sm font-medium">
              成员
              <span v-if="page" class="ml-1 font-normal text-muted-foreground">
                {{ page.total }} 人
              </span>
            </CardTitle>
            <Button size="sm" @click="showCreate = !showCreate">
              <Plus class="mr-1 h-3.5 w-3.5" />
              新建成员
            </Button>
          </div>
        </CardHeader>

        <CardContent class="space-y-3 pb-4">
          <!-- 搜索与筛选 -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative min-w-[180px] flex-1">
              <Search class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                v-model="filters.q"
                placeholder="搜学号或姓名"
                class="h-9 pl-8 text-xs"
              />
            </div>

            <select
              v-model="filters.role"
              class="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">全部身份</option>
              <option value="member">成员</option>
              <option value="admin">管理员</option>
              <option value="root">root</option>
            </select>

            <select
              v-model="filters.status"
              class="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">全部状态</option>
              <option value="active">在用</option>
              <option value="disabled">已停用</option>
            </select>

            <Button
            :aria-expanded="showAdvancedFilters"
            aria-controls="member-advanced-filters"
            variant="ghost"
            size="sm"
            @click="showAdvancedFilters = !showAdvancedFilters"
            >
              <SlidersHorizontal class="mr-1.5 h-3.5 w-3.5" />
              更多筛选
              <ChevronDown class="ml-1 h-3.5 w-3.5 transition-transform duration-150" :class="showAdvancedFilters && 'rotate-180'" />
            </Button>

            <Button v-if="hasFilters" variant="ghost" size="sm" @click="clearFilters">
              清除筛选
            </Button>
          </div>

          <div v-if="showAdvancedFilters" id="member-advanced-filters" class="admin-section-content grid gap-2 rounded-lg bg-muted/30 p-3 sm:grid-cols-4">
            <label class="space-y-1 text-[11px] font-medium text-muted-foreground">
              学院
              <select
                v-model="filters.college_code"
                class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                <option value="">全部学院</option>
                <option v-for="code in page?.college_codes ?? []" :key="code" :value="code">
                  {{ code }}
                </option>
              </select>
            </label>
            <label class="space-y-1 text-[11px] font-medium text-muted-foreground">
              年级
              <select
                v-model="filters.enroll_year"
                class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                <option :value="null">全部年级</option>
                <option v-for="year in page?.enroll_years ?? []" :key="year" :value="year">
                  {{ year }} 级
                </option>
              </select>
            </label>
            <label class="space-y-1 text-[11px] font-medium text-muted-foreground">
              平台账号
              <select
                v-model="filters.has_account"
                class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                <option :value="null">全部成员</option>
                <option :value="true">已绑定</option>
                <option :value="false">未绑定</option>
              </select>
            </label>
            <label class="space-y-1 text-[11px] font-medium text-muted-foreground">
              排序方式
              <select
                v-model="filters.sort"
                class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                <option value="enroll_year">按年级</option>
                <option value="student_id">按学号</option>
                <option value="display_name">按姓名</option>
                <option value="created_at">按注册时间</option>
              </select>
            </label>
          </div>

          <!-- 新建成员 -->
          <div v-if="showCreate" class="admin-section-content space-y-2 rounded-md border border-border/40 p-3">
            <p class="text-xs font-medium">新建成员（不需要邀请码）</p>
            <div class="grid gap-2 sm:grid-cols-2">
              <Input v-model="createForm.student_id" placeholder="学号" class="h-9 font-mono text-xs" />
              <Input v-model="createForm.display_name" placeholder="姓名" class="h-9 text-xs" />
              <Input
                v-model="createForm.password"
                type="password"
                placeholder="初始密码（至少 8 位）"
                class="h-9 text-xs"
              />
              <select
                v-model="createForm.role"
                class="h-9 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="member">成员</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <Input v-model="createForm.admin_note" placeholder="备注（可选）" class="h-9 text-xs" />
            <div class="flex gap-2">
              <Button
                size="sm"
                :disabled="creating || !createForm.student_id || !createForm.display_name || createForm.password.length < 8"
                @click="createUser"
              >
                <Loader2 v-if="creating" class="mr-1 h-3.5 w-3.5 animate-spin" />
                创建
              </Button>
              <Button variant="ghost" size="sm" @click="showCreate = false">取消</Button>
            </div>
            <p class="text-xs text-muted-foreground">
              年级、学院、专业由学号解析得出。只有 root 能创建管理员。
            </p>
          </div>
        </CardContent>

        <CardContent class="p-0">
          <div v-if="!members.length" class="p-4 text-sm text-muted-foreground">
            没有符合条件的成员
          </div>
          <div v-else class="divide-y divide-border/40">
            <div v-for="member in members" :key="member.id" class="space-y-2 px-4 py-3 transition-colors hover:bg-muted/25">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-medium">{{ member.display_name }}</span>
                <span class="font-mono text-xs text-muted-foreground">{{ member.student_id }}</span>
                <span
                  v-if="formatEnrollYear(member.enroll_year)"
                  class="text-xs text-muted-foreground"
                >
                  {{ formatEnrollYear(member.enroll_year) }}
                </span>

                <span
                  class="rounded border border-border/40 px-1.5 py-0.5 text-[10px]"
                  :class="member.role === 'root' ? 'text-primary' : 'text-muted-foreground'"
                >
                  {{ roleLabel(member.role) }}
                </span>
                <span v-if="member.status === 'disabled'" class="text-[10px] text-destructive">
                  已停用
                </span>

                <div class="ml-auto flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    @click="editingMemberId === member.id ? cancelEditMember(member) : startEditMember(member)"
                  >
                    <Pencil class="mr-1.5 h-3.5 w-3.5" />
                    {{ editingMemberId === member.id ? '取消编辑' : '编辑资料' }}
                  </Button>
                  <details class="group relative">
                    <summary class="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <MoreHorizontal class="h-4 w-4" />
                      更多
                    </summary>
                    <div class="absolute right-0 top-full z-30 mt-1 w-40 rounded-lg border border-border/60 bg-popover p-1 shadow-lg">
                      <Button
                        v-if="member.role !== 'root'"
                        variant="ghost"
                        size="sm"
                        class="w-full justify-start"
                        @click="toggleStatus(member)"
                      >
                        {{ member.status === 'active' ? '停用账号' : '启用账号' }}
                      </Button>
                      <Button variant="ghost" size="sm" class="w-full justify-start" @click="resetPassword(member)">
                        重置密码
                      </Button>
                      <Button
                        v-if="member.role !== 'root' && member.id !== user?.id"
                        variant="ghost"
                        size="sm"
                        class="w-full justify-start text-destructive hover:text-destructive"
                        @click="deleteUser(member)"
                      >
                        <Trash2 class="mr-2 h-3.5 w-3.5" />
                        删除成员
                      </Button>
                    </div>
                  </details>
                </div>
              </div>

              <!-- 学院信息与平台账号。不编辑时显示。 -->
              <div
                v-if="editingMemberId !== member.id"
                class="flex flex-wrap items-center gap-x-2 gap-y-1 pl-0.5 text-xs text-muted-foreground"
              >
                <span>
                  {{ [member.college_name, member.major_name, member.class_no ? `${member.class_no} 班` : ''].filter(Boolean).join(' · ') || '学院信息未设置' }}
                </span>

                <!--
                  平台账号。管理员最常看的两个信息：绑了没有、验没验过。

                  未验证的不计入榜单，所以用琥珀色标出来——和已验证的放在
                  一起看，一眼能挑出需要跟进的人。
                -->
                <template v-if="member.accounts.length">
                  <span class="text-border">|</span>
                  <span
                    v-for="account in member.accounts"
                    :key="account.id"
                    class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]"
                    :class="
                      account.verified_at
                        ? 'border-border/40'
                        : 'border-amber-500/40 text-amber-600 dark:text-amber-500'
                    "
                    :title="
                      account.verified_at
                        ? `${PLATFORM_META[account.platform].label} · 已验证`
                        : `${PLATFORM_META[account.platform].label} · 还没验证，不计入榜单`
                    "
                  >
                    <span class="text-muted-foreground">{{ PLATFORM_META[account.platform].label }}</span>
                    {{ account.identifier }}
                  </span>
                </template>
                <!--
                  「未绑定」用中性色，不用警告色：新成员还没绑是正常状态，
                  不是出错。用琥珀色会让整页看起来到处是问题。
                -->
                <template v-else>
                  <span class="text-border">|</span>
                  <span class="rounded border border-border/40 px-1.5 py-0.5 text-[10px]">
                    未绑定账号
                  </span>
                </template>
              </div>

              <div v-if="editingMemberId === member.id" class="admin-section-content space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3">
                <div class="grid gap-2 sm:grid-cols-2">
                  <label class="space-y-1 text-xs font-medium text-muted-foreground">
                    姓名
                    <Input
                      :model-value="editingName[member.id] ?? member.display_name"
                      class="h-9 text-sm text-foreground"
                      @update:model-value="(v: string) => (editingName[member.id] = v)"
                    />
                  </label>
                  <label class="space-y-1 text-xs font-medium text-muted-foreground">
                    管理员备注
                    <Input
                      :model-value="editingNote[member.id] ?? member.admin_note"
                      placeholder="仅管理员可见"
                      class="h-9 text-sm text-foreground"
                      @update:model-value="(v: string) => (editingNote[member.id] = v)"
                    />
                  </label>
                  <label class="space-y-1 text-xs font-medium text-muted-foreground">
                    学院名称
                    <Input
                      :model-value="editingCollege[member.id] ?? member.college_name ?? ''"
                      placeholder="留空使用学号解析值"
                      list="academic-colleges"
                      class="h-9 text-sm text-foreground"
                      @update:model-value="(v: string) => (editingCollege[member.id] = v)"
                    />
                  </label>
                  <label class="space-y-1 text-xs font-medium text-muted-foreground">
                    专业名称
                    <Input
                      :model-value="editingMajor[member.id] ?? member.major_name ?? ''"
                      placeholder="留空使用学号解析值"
                      list="academic-majors"
                      class="h-9 text-sm text-foreground"
                      @update:model-value="(v: string) => (editingMajor[member.id] = v)"
                    />
                  </label>
                  <label class="space-y-1 text-xs font-medium text-muted-foreground">
                    班级
                    <Input
                      :model-value="editingClassNo[member.id] ?? (member.class_no ? String(member.class_no) : '')"
                      placeholder="如 3，留空不分班"
                      class="h-9 text-sm text-foreground"
                      @update:model-value="(v: string) => (editingClassNo[member.id] = v)"
                    />
                  </label>
                  <label v-if="canChangeRole(member)" class="space-y-1 text-xs font-medium text-muted-foreground">
                    账号身份
                    <select
                      :value="member.role"
                      class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                      @change="(e: Event) => changeRole(member, (e.target as HTMLSelectElement).value)"
                    >
                      <option value="member">成员</option>
                      <option value="admin">管理员</option>
                    </select>
                  </label>
                  <!-- 管理员天然能发文章，开关只对普通成员有意义 -->
                  <label v-if="member.role === 'member'" class="flex items-end gap-2 pb-1 text-xs font-medium text-muted-foreground">
                    <input
                      type="checkbox"
                      :checked="editingCanPost[member.id] ?? member.can_post"
                      class="h-4 w-4 rounded border-input accent-primary"
                      @change="(e: Event) => (editingCanPost[member.id] = (e.target as HTMLInputElement).checked)"
                    />
                    <span>
                      可发文章
                      <span class="block text-[10px] font-normal text-muted-foreground/70">开了能进文章管理写博客，弹窗上下架仍是管理员的事</span>
                    </span>
                  </label>
                </div>
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" @click="cancelEditMember(member)">
                    <X class="mr-1 h-3.5 w-3.5" />
                    取消
                  </Button>
                  <Button size="sm" :disabled="savingNote === member.id" @click="saveNote(member)">
                    <Loader2 v-if="savingNote === member.id" class="mr-1 h-3.5 w-3.5 animate-spin" />
                    保存修改
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>

        <!-- 分页 -->
        <CardContent v-if="page && totalPages > 1" class="flex items-center justify-between border-t border-border/40 py-3">
          <span class="text-xs text-muted-foreground">
            第 {{ page.page }} / {{ totalPages }} 页
          </span>
          <div class="flex gap-1">
            <Button variant="outline" size="sm" :disabled="page.page <= 1" @click="goPage(page.page - 1)">
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="page.page >= totalPages"
              @click="goPage(page.page + 1)"
            >
              下一页
            </Button>
          </div>
        </CardContent>
      </Card>
        </section>
    </template>
    <datalist id="academic-colleges">
      <option v-for="college in academics?.colleges ?? []" :key="college" :value="college" />
    </datalist>
    <datalist id="academic-majors">
      <option
        v-for="major in academicMajors"
        :key="major"
        :value="major"
      />
    </datalist>
  </div>
</template>

<style scoped>
.admin-section-content {
  animation: admin-section-enter 150ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

@keyframes admin-section-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin-section-content {
    animation: none;
  }
}
</style>
