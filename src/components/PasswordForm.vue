<script setup lang="ts">
/**
 * 改密码。
 *
 * 没有自助找回：账号以学号为名、没有绑定邮箱，忘了只能找管理员重置。
 * 所以这里要求先验证当前密码，改完其他设备的登录会被踢掉。
 */
import { computed, ref } from 'vue'
import { AlertCircle, Check, Loader2 } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { ApiError, authApi } from '../lib/api'

const current = ref('')
const next = ref('')
const confirm = ref('')

const submitting = ref(false)
const error = ref('')
const done = ref(false)

const mismatch = computed(() => confirm.value !== '' && next.value !== confirm.value)

const canSubmit = computed(
  () =>
    !submitting.value &&
    current.value !== '' &&
    next.value.length >= 8 &&
    next.value === confirm.value,
)

/** 按钮为何不可点，免得用户对着灰按钮猜。 */
const blockedReason = computed(() => {
  if (submitting.value) return ''
  if (!current.value) return '请填写当前密码'
  if (next.value.length < 8) return '新密码至少 8 位'
  if (mismatch.value) return '两次输入的新密码不一致'
  return ''
})

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = ''
  done.value = false
  try {
    await authApi.changePassword(current.value, next.value)
    done.value = true
    current.value = ''
    next.value = ''
    confirm.value = ''
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '修改失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <CardTitle class="text-sm font-medium">修改密码</CardTitle>
    </CardHeader>

    <CardContent class="space-y-4">
      <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
        <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
        <span class="text-sm">{{ error }}</span>
      </Alert>
      <Alert v-if="done" class="flex items-start gap-2">
        <Check class="h-4 w-4 shrink-0 translate-y-0.5" />
        <span class="text-sm">密码已修改，其他设备的登录已退出</span>
      </Alert>

      <form class="space-y-3" @submit.prevent="submit">
        <div class="space-y-1.5">
          <label for="current-password" class="text-xs font-medium">当前密码</label>
          <Input
            id="current-password"
            v-model="current"
            type="password"
            autocomplete="current-password"
          />
        </div>

        <div class="space-y-1.5">
          <label for="new-password" class="text-xs font-medium">新密码</label>
          <Input
            id="new-password"
            v-model="next"
            type="password"
            placeholder="至少 8 位"
            autocomplete="new-password"
          />
        </div>

        <div class="space-y-1.5">
          <label for="confirm-password" class="text-xs font-medium">再输一次</label>
          <Input
            id="confirm-password"
            v-model="confirm"
            type="password"
            autocomplete="new-password"
          />
          <p v-if="mismatch" class="text-xs text-destructive">两次输入不一致</p>
        </div>

        <Button type="submit" class="w-full" :disabled="!canSubmit">
          <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
          修改密码
        </Button>

        <p v-if="blockedReason" class="text-center text-xs text-muted-foreground">
          {{ blockedReason }}
        </p>
      </form>

      <p class="text-xs text-muted-foreground">
        忘记密码只能找管理员重置——账号以学号为名，没有绑定邮箱，无法自助找回。
      </p>
    </CardContent>
  </Card>
</template>
