<script setup lang="ts">
/**
 * 成员资料页 `/member?id=N`。
 *
 * 成员名录与详情仅对校内成员开放：先确认登录身份，再挂载 MemberProfileBody，
 * 避免对未登录或校外访客发出 401/403 请求。
 */
import { onMounted, ref } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import AccessGate from './AccessGate.vue'
import MemberProfileBody from './MemberProfileBody.vue'
import { useAuth } from '../lib/auth'

const { user, isCampusMember, ready, ensureLoaded } = useAuth()
const userId = ref(0)

onMounted(async () => {
  const fromQuery = new URLSearchParams(window.location.search).get('id')
  if (fromQuery) userId.value = Number(fromQuery)
  await ensureLoaded()
})
</script>

<template>
  <div v-if="!ready" class="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
    <Loader2 class="h-4 w-4 animate-spin" />
    正在读取…
  </div>

  <AccessGate
    v-else-if="!isCampusMember"
    :mode="user ? 'campus' : 'login'"
    title="成员资料仅对校内成员开放"
  />

  <MemberProfileBody v-else :user-id="userId" />
</template>
