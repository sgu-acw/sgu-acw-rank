<script setup lang="ts">
/**
 * 管理页：邀请码、成员管理、管理员备注。
 *
 * 只有 admin 或 root 能用。页面本身是静态的，拦不住人，真正的权限在
 * 后端——这里只是不给无权的人显示入口，每个请求失败都会照常提示。
 */
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, Check, Copy, Loader2, Trash2 } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Separator } from './ui/separator'
import {
  ApiError,
  adminApi,
  type AdminUser,
  type Invite,
} from '../lib/api'
import { useAuth } from '../lib/auth'

const { user, ensureLoaded, isAdmin } = useAuth()

const loading = ref(true)
const error = ref('')
const notice = ref('')

const invites = ref<Invite[]>([])
const users = ref<AdminUser[]>([])
const stats = ref<{ user_count: number; active_count: number; admin_count: number; usable_invite_count: number } | null>(null)

// 新建邀请码的表单
const form = ref({
  max_uses: 5,
  ttl_hours: 24,
  grants_role: 'member',
  note: '',
})

// 成员编辑：只保存正在编辑的那一行的备注，避免整表联动。
const editingNote = ref<Record<number, string>>({})
const savingNote = ref<number | null>(null)
const copiedCode = ref<string | null>(null)

const isRoot = computed(() => user.value?.role === 'root')

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
    const [inviteList, userList, summary] = await Promise.all([
      adminApi.invites(),
      adminApi.users(),
      adminApi.stats(),
    ])
    invites.value = inviteList
    users.value = userList
    stats.value = summary
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败'
  } finally {
    loading.value = false
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

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    copiedCode.value = code
    window.setTimeout(() => {
      if (copiedCode.value === code) copiedCode.value = null
    }, 1500)
  } catch {
    // 剪贴板不可用（非 https 或未授权）时不去打扰用户，码就在页面上。
  }
}

async function saveNote(target: AdminUser) {
  const value = editingNote.value[target.id]
  if (value === undefined) return
  savingNote.value = target.id
  try {
    const updated = await adminApi.updateUser(target.id, { admin_note: value })
    target.admin_note = updated.admin_note
    delete editingNote.value[target.id]
    flash('备注已保存')
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
                <option v-if="isRoot" value="admin">管理员</option>
              </select>
            </div>
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium">备注（仅管理员可见）</label>
            <Input v-model="form.note" placeholder="给谁用的、什么时候发的" />
          </div>
          <Button size="sm" @click="createInvite">生成</Button>
          <p class="text-xs text-muted-foreground">
            人数和时间谁先到谁生效。只有 root 能生成管理员邀请码。
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
                :title="'点击复制'"
                @click="copyCode(invite.code)"
              >
                {{ invite.code }}
                <Copy v-if="copiedCode !== invite.code" class="h-3 w-3 text-muted-foreground/50" />
                <Check v-else class="h-3 w-3 text-emerald-500" />
              </button>

              <span class="text-xs" :class="inviteState(invite).tone">{{ inviteState(invite).text }}</span>

              <span class="text-xs text-muted-foreground">
                {{ invite.use_count }}/{{ invite.max_uses }} 人 ·
                {{ invite.grants_role === 'admin' ? '管理员' : '成员' }}
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
          <CardTitle class="text-sm font-medium">成员</CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <div class="divide-y divide-border/40">
            <div v-for="member in users" :key="member.id" class="space-y-2 px-4 py-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-medium">{{ member.display_name }}</span>
                <span class="font-mono text-xs text-muted-foreground">{{ member.student_id }}</span>
                <span class="text-xs text-muted-foreground">{{ member.enroll_year }} 级</span>

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
                </div>
              </div>

              <!-- 管理员备注。仅管理员可见可改。 -->
              <div class="flex items-center gap-2">
                <Input
                  :model-value="editingNote[member.id] ?? member.admin_note"
                  placeholder="备注（仅管理员可见）"
                  class="h-8 text-xs"
                  @update:model-value="(v: string) => (editingNote[member.id] = v)"
                />
                <Button
                  v-if="editingNote[member.id] !== undefined"
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
      </Card>

      <Separator />
      <p class="text-xs text-muted-foreground">
        没有自助找回密码：账号以学号为名、没有绑定邮箱，忘记密码只能由管理员重置。
      </p>
    </template>
  </div>
</template>
