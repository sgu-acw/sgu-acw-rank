<script setup lang="ts">
/**
 * 个人中心。查看个人资料、修改签名和管理账号安全。
 *
 * 页面本身是公开的（静态站无法在服务端拦人），靠 /auth/me 的结果决定显示
 * 什么。未登录时提示去登录，而不是跳转，这样链接可以安全地分享。
 */
import MemberName from './MemberName.vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { LogOut, Loader2, Pencil } from 'lucide-vue-next'
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
import { PROFILE_SIGNATURE_MAX_LENGTH, useAuth } from '../lib/auth'
import { formatEnrollYear } from '../lib/format'

const { user, isExternal, isCampusMember, loading, ready, ensureLoaded, logout, patchUser } = useAuth()

const profileChangeRef = ref<InstanceType<typeof ProfileChangeCard> | null>(null)
const profileChangeEl = ref<HTMLElement | null>(null)

function openProfileChange() {
  profileChangeRef.value?.openForm()
  profileChangeEl.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

const editingSignature = ref(false)
const signatureButton = ref<InstanceType<typeof Button> | null>(null)
const signatureDraft = ref('')
const signatureBusy = ref(false)
const signatureError = ref('')
const signatureNotice = ref('')
const signatureLength = computed(() => Array.from(signatureDraft.value.trim()).length)
const signatureChanged = computed(() => signatureDraft.value.trim() !== (user.value?.signature ?? ''))

watch(() => user.value?.id, () => {
  editingSignature.value = false
  signatureDraft.value = user.value?.signature ?? ''
  signatureError.value = ''
  signatureNotice.value = ''
}, { immediate: true })

async function openSignature() {
  if (!user.value || signatureBusy.value) return
  if (!editingSignature.value) {
    signatureDraft.value = user.value.signature ?? ''
    signatureError.value = ''
    signatureNotice.value = ''
    editingSignature.value = true
  }
  await nextTick()
  document.getElementById('profile-signature')?.focus()
}

async function closeSignature() {
  editingSignature.value = false
  signatureError.value = ''
  await nextTick()
  signatureButton.value?.$el.focus()
}

async function saveSignature() {
  const userId = user.value?.id
  if (userId == null || signatureBusy.value || !signatureChanged.value || signatureLength.value > PROFILE_SIGNATURE_MAX_LENGTH) return
  signatureBusy.value = true
  signatureError.value = ''
  signatureNotice.value = ''
  try {
    const updated = await authApi.updateMe({ signature: signatureDraft.value.trim() })
    if (user.value?.id !== userId) return
    patchUser({ signature: updated.signature })
    signatureDraft.value = updated.signature ?? ''
    signatureNotice.value = '个性签名已保存'
    signatureBusy.value = false
    await closeSignature()
  } catch (err) {
    if (user.value?.id === userId) signatureError.value = err instanceof ApiError ? err.message : '保存失败'
  } finally {
    signatureBusy.value = false
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
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="min-w-0 text-xl font-semibold tracking-tight">
              <MemberName :name="user.display_name" :signature="user.signature" />
            </p>
            <p class="mt-0.5 font-mono text-xs text-muted-foreground">{{ user.student_id }}</p>
          </div>
          <span class="rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {{ roleName }}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Button variant="ghost" class="text-muted-foreground" @click="openProfileChange">
            <Pencil class="mr-1 h-3.5 w-3.5" />
            申请改名
          </Button>
          <Button
            v-if="user.signature !== undefined"
            ref="signatureButton"
            variant="ghost"
            class="text-muted-foreground"
            :aria-expanded="editingSignature"
            :disabled="signatureBusy"
            @click="openSignature"
          >
            <Pencil class="mr-1 h-3.5 w-3.5" />
            改签名
          </Button>
        </div>
        <ActionNotice :message="signatureNotice" />

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
    <div ref="profileChangeEl">
      <ProfileChangeCard ref="profileChangeRef" />
    </div>

    <Card v-if="editingSignature">
      <CardHeader class="pb-3">
        <CardTitle class="text-base">修改个性签名</CardTitle>
      </CardHeader>
      <CardContent>
        <form class="min-w-0 space-y-3" @submit.prevent="saveSignature">
          <label for="profile-signature" class="sr-only">个性签名</label>
          <p id="profile-signature-help" class="text-xs text-muted-foreground">
            最多 {{ PROFILE_SIGNATURE_MAX_LENGTH }} 个字，留空可清除。
          </p>
          <div class="flex items-center gap-2">
            <Input
              id="profile-signature"
              v-model="signatureDraft"
              aria-describedby="profile-signature-help profile-signature-length"
              :aria-invalid="signatureLength > PROFILE_SIGNATURE_MAX_LENGTH"
              :disabled="signatureBusy"
              class="min-w-0 max-w-xs flex-1"
            />
            <span id="profile-signature-length" class="shrink-0 text-xs" :class="signatureLength > PROFILE_SIGNATURE_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'">
              {{ signatureLength }} / {{ PROFILE_SIGNATURE_MAX_LENGTH }}
            </span>
          </div>
          <ActionNotice :message="signatureError" variant="error" />
          <div class="flex gap-2">
            <Button type="submit" :disabled="signatureBusy || !signatureChanged || signatureLength > PROFILE_SIGNATURE_MAX_LENGTH">
              {{ signatureBusy ? '保存中…' : '保存签名' }}
            </Button>
            <Button type="button" variant="outline" :disabled="signatureBusy" @click="closeSignature">取消</Button>
          </div>
        </form>
      </CardContent>
    </Card>

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
