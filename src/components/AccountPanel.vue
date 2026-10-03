<script setup lang="ts">
/**
 * 个人中心。目前只展示从学号解析出来的信息，并提供退出登录。
 *
 * 页面本身是公开的（静态站无法在服务端拦人），靠 /auth/me 的结果决定显示
 * 什么。未登录时提示去登录，而不是跳转，这样链接可以安全地分享。
 */
import { computed, onMounted } from 'vue'
import { LogOut, Loader2 } from 'lucide-vue-next'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Separator } from './ui/separator'
import AccountBindings from './AccountBindings.vue'
import PasswordForm from './PasswordForm.vue'
import { useAuth } from '../lib/auth'
import { formatEnrollYear } from '../lib/format'

const { user, loading, ready, ensureLoaded, logout } = useAuth()

onMounted(() => {
  ensureLoaded()
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
    default:
      return '成员'
  }
})

async function handleLogout() {
  await logout()
  window.location.href = '/'
}

// 静态站在构建时就渲染这些模板，那时没有 window，所以跳转必须走函数。
function go(path: string) {
  window.location.href = path
}
</script>

<template>
  <Card class="mx-auto w-full max-w-md">
    <CardHeader>
      <CardTitle class="text-lg">个人中心</CardTitle>
    </CardHeader>

    <CardContent>
      <!--
        三个分支的根元素都是普通块级 div，**不在这里放 flex**。
        加载态要横向排列图标和文字，所以把 flex 收进内层 span。

        原因：Vue 在 hydration 时会按位置复用节点，一旦根元素上有 flex，
        那个 flex 容器会被拿给别的分支用，登录后的 dl 就成了 flex item
        被挤成竖排（实测宽度只剩 48px）。加 key 不管用，试过。

        所以让根元素保持「无副作用」的普通 div，布局放在内部。
      -->
      <div v-if="loading || !ready" class="py-6 text-sm text-muted-foreground">
        <span class="flex items-center gap-2">
          <Loader2 class="h-4 w-4 animate-spin" />
          正在读取…
        </span>
      </div>

      <div v-else-if="!user" class="space-y-4 py-2">
        <p class="text-sm text-muted-foreground">你还没有登录</p>
        <div class="flex gap-2">
          <Button class="flex-1" @click="go('/login')">去登录</Button>
          <Button variant="outline" class="flex-1" @click="go('/register')">去注册</Button>
        </div>
      </div>

      <div v-else key="account" class="space-y-4">
        <div>
          <p class="text-xl font-semibold tracking-tight">{{ user.display_name }}</p>
          <p class="font-mono text-xs text-muted-foreground">{{ user.student_id }}</p>
        </div>

        <Separator />

        <dl class="space-y-2 text-sm">
          <div class="flex justify-between">
            <dt class="text-muted-foreground">入学年份</dt>
            <dd>{{ formatEnrollYear(user.enroll_year) || '—' }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted-foreground">培养层次</dt>
            <dd>{{ levelName }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted-foreground">学院码 / 专业号</dt>
            <dd class="font-mono">{{ user.college_code }} / {{ user.major_code }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted-foreground">身份</dt>
            <dd>{{ roleName }}</dd>
          </div>
        </dl>

        <Separator />

        <Button variant="outline" class="w-full" @click="handleLogout">
          <LogOut class="mr-2 h-4 w-4" />
          退出登录
        </Button>
      </div>
    </CardContent>
  </Card>

  <!-- 账号绑定只在已登录时显示，它需要会话。 -->
  <div v-if="ready && user" class="mt-4">
    <AccountBindings />
  </div>

  <div v-if="ready && user" class="mt-4">
    <PasswordForm />
  </div>
</template>
