<script setup lang="ts">
/**
 * 管理页：邀请码、成员管理、管理员备注。
 *
 * 只有 admin 或 root 能用。页面本身是静态的，拦不住人，真正的权限在
 * 后端——这里只是不给无权的人显示入口，每个请求失败都会照常提示。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { AlertCircle, Check, Copy, Link2, Loader2, Plus, Search, Trash2 } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Separator } from './ui/separator'
import {
  ApiError,
  adminApi,
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
} | null>(null)

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
const creating = ref(false)
const createForm = ref({
  student_id: '',
  display_name: '',
  password: '',
  role: 'member',
  admin_note: '',
})

// 成员编辑：只保存正在编辑的那一行的备注，避免整表联动。
const editingNote = ref<Record<number, string>>({})
const editingName = ref<Record<number, string>>({})
//: 学院名/专业名的人工覆盖。空串表示恢复成按学号查表。
const editingCollege = ref<Record<number, string>>({})
const editingMajor = ref<Record<number, string>>({})
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
    filters.value.has_account !== null,
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
    const [inviteList, userPage, summary] = await Promise.all([
      adminApi.invites(),
      adminApi.users(filters.value),
      adminApi.stats(),
    ])
    invites.value = inviteList
    page.value = userPage
    stats.value = summary
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
  if (!window.confirm(`把 ${target.display_name} 的身份改为「${label}」？`)) return
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
  if (!window.confirm(`确定删除 ${target.display_name}（${target.student_id}）？\n\n会同时删掉其平台绑定与练习记录，不可恢复。`)) return
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
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '创建失败'
  }
}

async function revoke(invite: Invite) {
  if (!window.confirm(`确定撤销 ${invite.code}？已经用掉的不会退回。`)) return
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

async function saveNote(target: AdminUser) {
  const payload: {
    admin_note?: string
    display_name?: string
    college_override?: string
    major_override?: string
  } = {}
  if (editingNote.value[target.id] !== undefined) payload.admin_note = editingNote.value[target.id]
  if (editingName.value[target.id] !== undefined) payload.display_name = editingName.value[target.id]
  if (editingCollege.value[target.id] !== undefined) {
    payload.college_override = editingCollege.value[target.id]
  }
  if (editingMajor.value[target.id] !== undefined) {
    payload.major_override = editingMajor.value[target.id]
  }
  if (!Object.keys(payload).length) return

  savingNote.value = target.id
  try {
    const updated = await adminApi.updateUser(target.id, payload)
    target.admin_note = updated.admin_note
    target.display_name = updated.display_name
    target.college_name = updated.college_name
    target.major_name = updated.major_name
    delete editingNote.value[target.id]
    delete editingName.value[target.id]
    delete editingCollege.value[target.id]
    delete editingMajor.value[target.id]
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
  if (!window.confirm(`确定${verb} ${target.display_name}？`)) return
  try {
    const updated = await adminApi.updateUser(target.id, { status: next })
    target.status = updated.status
    flash(`已${verb}`)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '操作失败'
  }
}

async function resetPassword(target: AdminUser) {
  if (!window.confirm(`重置 ${target.display_name} 的密码？对方会被登出。`)) return
  try {
    const result = await adminApi.resetPassword(target.id)
    window.alert(
      `${result.display_name}（${result.student_id}）的新密码：\n\n${result.temporary_password}\n\n` +
        '这串只显示这一次，请转告本人。',
    )
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '重置失败'
  }
}

function roleLabel(role: string): string {
  return role === 'root' ? 'root' : role === 'admin' ? '管理员' : '成员'
}

/** 当前登录者能否改动这个人的身份。
 *
 * 规则与后端一致，这里只是提前把不可用的控件置灰，免得点下去才报错：
 * root 的身份谁都改不了；只有 root 能授予或撤销管理员。
 */
/**
 * 能不能改这个人的角色。
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
  <div class="space-y-4">
    <div>
      <h1 class="text-lg font-semibold tracking-tight">管理</h1>
      <p class="mt-0.5 text-xs text-muted-foreground">邀请码、成员与备注。</p>
    </div>

    <div v-if="loading" class="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <Alert v-else-if="!isAdmin" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">这个页面只有管理员能看。</span>
    </Alert>

    <template v-else>
      <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
        <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
        <span class="text-sm">{{ error }}</span>
      </Alert>
      <Alert v-if="notice" class="flex items-start gap-2">
        <Check class="h-4 w-4 shrink-0 translate-y-0.5" />
        <span class="text-sm">{{ notice }}</span>
      </Alert>

      <div v-if="stats" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card v-for="item in [
          { label: '成员', value: stats.user_count },
          { label: '在用', value: stats.active_count },
          { label: '管理员', value: stats.admin_count },
          { label: '可用邀请码', value: stats.usable_invite_count },
        ]" :key="item.label">
          <CardContent class="p-4">
            <p class="text-xs text-muted-foreground">{{ item.label }}</p>
            <p class="mt-1 font-mono text-xl font-semibold">{{ item.value }}</p>
          </CardContent>
        </Card>
      </div>

      <!-- 邀请码 -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium">新建邀请码</CardTitle>
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
          <p class="text-xs text-muted-foreground">
            人数和时间谁先到谁生效。管理员之间平级，可以互相任命；root 不能通过邀请码授予。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium">邀请码</CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <div v-if="!invites.length" class="p-4 text-sm text-muted-foreground">还没有邀请码。</div>
          <div v-else class="divide-y divide-border/40">
            <div v-for="invite in invites" :key="invite.id" class="flex items-center gap-3 px-4 py-2.5">
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

              <span v-if="invite.note" class="truncate text-xs text-muted-foreground/70">
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
              新建
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

            <select
              v-model="filters.enroll_year"
              class="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option :value="null">全部年级</option>
              <option v-for="year in page?.enroll_years ?? []" :key="year" :value="year">
                {{ year }} 级
              </option>
            </select>

            <select
              v-model="filters.has_account"
              class="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option :value="null">全部</option>
              <option :value="true">已绑账号</option>
              <option :value="false">未绑账号</option>
            </select>

            <select
              v-model="filters.sort"
              class="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="enroll_year">按年级</option>
              <option value="student_id">按学号</option>
              <option value="display_name">按姓名</option>
              <option value="created_at">按注册时间</option>
            </select>

            <Button v-if="hasFilters" variant="ghost" size="sm" @click="clearFilters">
              清除
            </Button>
          </div>

          <!-- 新建成员 -->
          <div v-if="showCreate" class="space-y-2 rounded-md border border-border/40 p-3">
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
            没有符合条件的成员。
          </div>
          <div v-else class="divide-y divide-border/40">
            <div v-for="member in members" :key="member.id" class="space-y-2 px-4 py-3">
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

                <div class="ml-auto flex shrink-0 gap-1">
                  <Button
                    v-if="member.role !== 'root'"
                    variant="ghost"
                    size="sm"
                    @click="toggleStatus(member)"
                  >
                    {{ member.status === 'active' ? '停用' : '启用' }}
                  </Button>
                  <Button variant="ghost" size="sm" @click="resetPassword(member)">
                    重置密码
                  </Button>
                  <Button
                    v-if="member.role !== 'root' && member.id !== user?.id"
                    variant="ghost"
                    size="sm"
                    @click="deleteUser(member)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <!--
                姓名与备注。都是仅管理员可见可改。

                窄屏下换行堆叠：这几个输入框加起来近 700px，390px 的屏幕上
                横着排会全部挤在一起。
              -->
              <div class="flex flex-wrap items-center gap-2">
                <Input
                  :model-value="editingName[member.id] ?? member.display_name"
                  placeholder="姓名"
                  class="h-9 w-full text-sm sm:h-8 sm:w-32 sm:text-xs"
                  @update:model-value="(v: string) => (editingName[member.id] = v)"
                />
                <Input
                  :model-value="editingNote[member.id] ?? member.admin_note"
                  placeholder="备注（仅管理员可见）"
                  class="h-9 w-full text-sm sm:h-8 sm:flex-1 sm:text-xs"
                  @update:model-value="(v: string) => (editingNote[member.id] = v)"
                />

                <!-- 身份。只有 root 能改，且改不了 root 自己和自己的。 -->
                <select
                  v-if="canChangeRole(member)"
                  :value="member.role"
                  class="h-9 w-full shrink-0 rounded-md border border-input bg-background px-2 text-sm sm:h-8 sm:w-auto sm:text-xs"
                  @change="(e: Event) => changeRole(member, (e.target as HTMLSelectElement).value)"
                >
                  <option value="member">成员</option>
                  <option value="admin">管理员</option>
                </select>

                <Input
                  :model-value="editingCollege[member.id] ?? member.college_name ?? ''"
                  placeholder="学院（可改）"
                  class="h-9 w-full text-sm sm:h-8 sm:w-44 sm:text-xs"
                  @update:model-value="(v: string) => (editingCollege[member.id] = v)"
                />
                <Input
                  :model-value="editingMajor[member.id] ?? member.major_name ?? ''"
                  placeholder="专业（可改）"
                  class="h-9 w-full text-sm sm:h-8 sm:w-40 sm:text-xs"
                  @update:model-value="(v: string) => (editingMajor[member.id] = v)"
                />

                <Button
                  v-if="
                    editingNote[member.id] !== undefined ||
                    editingName[member.id] !== undefined ||
                    editingCollege[member.id] !== undefined ||
                    editingMajor[member.id] !== undefined
                  "
                  size="sm"
                  :disabled="savingNote === member.id"
                  @click="saveNote(member)"
                >
                  保存
                </Button>
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

      <Separator />
      <p class="text-xs text-muted-foreground">
        没有自助找回密码：账号以学号为名、没有绑定邮箱，忘记密码只能由管理员重置。
      </p>
    </template>
  </div>
</template>
