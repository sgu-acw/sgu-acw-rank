<script setup lang="ts">
import type { CampResultStatus } from '../lib/api'
defineProps<{ status: CampResultStatus; admin?: boolean }>()
const labels = { scheduled: '未开始', running: '进行中', finalizing: '等待最终同步', finalized: '已封榜' }
</script>

<template>
  <div class="space-y-1 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-xs" role="status">
    <p class="font-medium">{{ labels[status.phase] || '正在读取状态' }}</p>
    <p v-if="status.phase === 'finalizing'" class="leading-relaxed text-muted-foreground">
      报名已截止，正在同步最终成绩；同步完成后封榜。
      <span v-if="admin && status.pending_accounts">还有 {{ status.pending_accounts }} 个账号等待同步，故障会通过站内信通知管理员。</span>
    </p>
    <p v-else-if="status.phase === 'finalized'" class="text-muted-foreground">
      成绩已固定，后续做题不会改变榜单。
      <span v-if="status.finalized_at">封榜于 {{ new Date(status.finalized_at).toLocaleString('zh-CN', { hour12: false }) }}。</span>
    </p>
</div>
</template>
