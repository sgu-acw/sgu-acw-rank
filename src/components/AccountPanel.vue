<script setup lang="ts">
/**
 * 个人中心。目前只展示从学号解析出来的信息，并提供退出登录。
 *
 * 页面本身是公开的（静态站无法在服务端拦人），靠 /auth/me 的结果决定显示
 * 什么。未登录时提示去登录，而不是跳转，这样链接可以安全地分享。
 */
import { computed, onMounted, ref } from 'vue'
import { Check, LogOut, Loader2, Pencil, X } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import ActionNotice from './ui/ActionNotice.vue'
import HonorArchive from './HonorArchive.vue'
import ProfileChangeCard from './ProfileChangeCard.vue'
import PushSettings from './PushSettings.vue'
import SecuritySettings from './SecuritySettings.vue'
import SessionManager from './SessionManager.vue'
import { Separator } from './ui/separator'
import AccountBindings from './AccountBindings.vue'
import PasswordForm from './PasswordForm.vue'
import { ApiError, authApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatEnrollYear } from '../lib/format'

const { user, isExternal, isCampusMember, isAdmin, loading, ready, ensureLoaded, logout, setUser } = useAuth()

const profileChangeRef = ref<InstanceType<typeof ProfileChangeCard> | null>(null)
const profileChangeEl = ref<HTMLElement | null>(null)

function openProfileChange() {
  profileChangeRef.value?.openForm()
  profileChangeEl.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

const editingName = ref(false)
const draftName = ref('')
const nameBusy = ref(false)
const nameError = ref('')
const nameNotice = ref('')

function startEditName() {
  if (!user.value) return
  draftName.value = user.value.display_name
  nameError.value = ''
  editingName.value = true
}

function cancelEditName() {
  editingName.value = false
  nameError.value = ''
}

async function saveDisplayName() {
  const next = draftName.value.trim()
  if (!next || nameBusy.value) return
  nameBusy.value = true
  nameError.value = ''
  try {
    const updated = await authApi.updateMe({ display_name: next })
    setUser(updated)
    editingName.value = false
    nameNotice.value = '姓名已更新'
    window.setTimeout(() => {
      if (nameNotice.value === '姓名已更新') nameNotice.value = ''
    }, 3000)
  } catch (err) {
    nameError.value = err instanceof ApiError ? err.message : '更新失败'
  } finally {
    nameBusy.value = false
  }
}

onMounted(() => {
  void ensureLoaded()
})

const levelName = computed(() => {
  switch (user.value?.level) {
    case 1:
      return '普通本科'
    case 2:
      return '专科'
    case 3:
      return '专升本/协同育人'
    default:
      return '—'
  }
})

const roleName = computed(() => {
  switch (user.value?.role) {
    case 'root':
      return 'root'
    case 'admin':
      return '管理员'
    case 'external':
      return '校外账号'
    default:
      return '成员'
  }
})

const academicLabel = computed(() => {
  const u = user.value
  if (!u) return '—'
  const parts = [u.college_name, u.major_name, u.class_label].filter(Boolean)
  if (parts.length > 0) return parts.join(' · ')
  return `${u.college_code} / ${u.major_code}`
})

async function handleLogout() {
  await logout()
  window.location.href = '/'
}

// 静态站在构建时就渲染这些模板，那时没有 window，所以跳转必须走函数。
function go(path: string) {
  import('astro:transitions/client').then(({ navigate }) => navigate(path))
}
</script>

<template>
  <Card :class="ready && user ? 'w-full' : 'mx-auto w-full max-w-md'">
    <CardHeader class="flex flex-row items-center justify-between gap-2 space-y-0">
      <CardTitle class="text-lg">个人中心</CardTitle>
      <Button v-if="ready && user" variant="outline" size="sm" @click="handleLogout">
        <LogOut class="mr-1.5 h-4 w-4" />
        退出登录
      </Button>
    </CardHeader>

    <CardContent>
      <div v-if="loading || !ready" class="py-6 text-sm text-muted-foreground">
        <span class="flex items-center gap-2">
          <Loader2 class="h-4 w-4 animate-spin" />
          正在读取…
        </span>
      </div>

      <div v-else-if="!user" class="space-y-4 py-2">
        <p class="text-sm text-muted-foreground">
          登录后可保存个人做题记录与管理账号安全；校内成员还可绑定 OJ 账号、参与集训与查看练习榜单。
        </p>
        <div class="flex flex-wrap gap-2">
          <Button class="flex-1" @click="go('/login')">去登录</Button>
          <Button variant="outline" class="flex-1" @click="go('/register?channel=external')">校外注册</Button>
        </div>
      </div>

      <div v-else key="account" class="space-y-4">
        <ActionNotice :message="nameNotice" />
        <Alert v-if="nameError" variant="destructive" class="text-sm">{{ nameError }}</Alert>

        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <form
              v-if="editingName && isAdmin"
              class="flex flex-wrap items-center gap-2"
              @submit.prevent="saveDisplayName"
            >
              <Input
                v-model="draftName"
                aria-label="显示名称"
                placeholder="输入姓名"
                maxlength="32"
                class="min-h-10 max-w-xs"
              />
              <Button size="sm" type="submit" :disabled="nameBusy || !draftName.trim()">
                <Loader2 v-if="nameBusy" class="mr-1 h-3.5 w-3.5 animate-spin" />
                <Check v-else class="mr-1 h-3.5 w-3.5" />
                保存
              </Button>
              <Button size="sm" type="button" variant="ghost" :disabled="nameBusy" @click="cancelEditName">
                <X class="mr-1 h-3.5 w-3.5" />
                取消
              </Button>
            </form>
            <div v-else class="flex items-center gap-2">
              <p class="truncate text-xl font-semibold tracking-tight">{{ user.display_name }}</p>
              <Button
                v-if="isAdmin"
                size="sm"
                variant="ghost"
                class="h-8 px-2 text-xs text-muted-foreground"
                @click="startEditName"
              >
                <Pencil class="mr-1 h-3.5 w-3.5" />
                改名
              </Button>
              <Button
                v-else
                size="sm"
                variant="ghost"
                class="h-8 px-2 text-xs text-muted-foreground"
                @click="openProfileChange"
              >
                <Pencil class="mr-1 h-3.5 w-3.5" />
                {{ isExternal ? '申请改名' : '申请修改资料' }}
              </Button>
            </div>
            <p class="mt-0.5 font-mono text-xs text-muted-foreground">{{ user.student_id }}</p>
          </div>
          <span class="rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {{ roleName }}
          </span>
        </div>

        <Separator />

        <div v-if="isExternal" class="rounded-lg border border-border/50 bg-muted/30 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
          当前为校外体验账号（登录用户名：<span class="font-mono text-foreground">{{ user.student_id }}</span>），已开放题库云端记录、云端 IDE、每日一题与公开题单；校内学籍、OJ 榜单与内部活动暂不开放。
        </div>

        <dl v-else class="grid gap-3 text-sm sm:grid-cols-3">
          <div class="rounded-lg bg-muted/30 px-3 py-2">
            <dt class="text-xs text-muted-foreground">入学年份</dt>
            <dd class="mt-0.5 font-medium">{{ formatEnrollYear(user.enroll_year) || '—' }}</dd>
          </div>
          <div class="rounded-lg bg-muted/30 px-3 py-2">
            <dt class="text-xs text-muted-foreground">培养层次</dt>
            <dd class="mt-0.5 font-medium">{{ levelName }}</dd>
          </div>
          <div class="rounded-lg bg-muted/30 px-3 py-2">
            <dt class="text-xs text-muted-foreground">院系 / 班级</dt>
            <dd class="mt-0.5 truncate font-medium" :title="academicLabel">{{ academicLabel }}</dd>
          </div>
        </dl>
      </div>
    </CardContent>
  </Card>

  <div v-if="ready && user" class="mt-4 space-y-4">
    <div v-if="!isAdmin" ref="profileChangeEl">
      <ProfileChangeCard ref="profileChangeRef" />
    </div>

    <template v-if="isCampusMember">
      <div class="surface-card p-4">
        <HonorArchive :user-id="user.id" />
      </div>

      <!-- 账号绑定只在校内成员登录时显示。 -->
      <AccountBindings />
    </template>

    <SecuritySettings />

    <SessionManager />

    <PushSettings v-if="isCampusMember" />

    <PasswordForm />
  </div>
</template>
