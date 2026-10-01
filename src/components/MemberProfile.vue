<script setup lang="ts">
/**
 * 成员资料页 `/member?id=N`。
 *
 * 页面是静态输出的，用不了 `/member/3` 这种路径——构建时不知道有哪些 id，
 * 动态路由会要求 getStaticPaths。所以走查询参数。
 *
 * 内容在 MemberProfileBody 里，与练习榜的弹窗共用。
 */
import { onMounted, ref } from 'vue'
import MemberProfileBody from './MemberProfileBody.vue'

const userId = ref(0)

// 必须放在 onMounted 里。服务端渲染时没有 window，若在 setup 顶层读，
// 服务端拿到 0 而客户端拿到真实值，hydration 时两边对不上。
onMounted(() => {
  const fromQuery = new URLSearchParams(window.location.search).get('id')
  if (fromQuery) userId.value = Number(fromQuery)
})
</script>

<template>
  <MemberProfileBody :user-id="userId" />
</template>
