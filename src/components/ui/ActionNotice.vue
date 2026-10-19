<script setup lang="ts">
import { computed } from 'vue'
import { AlertCircle, CheckCircle2, Info } from 'lucide-vue-next'
import { cn } from '../../lib/utils'

const props = withDefaults(
  defineProps<{
    message?: string
    variant?: 'success' | 'error' | 'info'
  }>(),
  { message: '', variant: 'success' },
)

const icon = computed(() => {
  if (props.variant === 'error') return AlertCircle
  if (props.variant === 'info') return Info
  return CheckCircle2
})

const tone = computed(() => {
  if (props.variant === 'error') {
    return 'border-destructive/30 bg-destructive/5 text-destructive'
  }
  if (props.variant === 'info') {
    return 'border-border/50 bg-muted/40 text-muted-foreground'
  }
  return 'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
})
</script>

<template>
  <Transition name="action-notice">
    <div
      v-if="props.message"
      :role="props.variant === 'error' ? 'alert' : 'status'"
      :class="cn('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm', tone)"
    >
      <component :is="icon" class="mt-0.5 h-4 w-4 shrink-0" />
      <span class="min-w-0 whitespace-pre-line break-words">{{ props.message }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.action-notice-enter-active,
.action-notice-leave-active {
  transition: opacity 150ms ease, transform 150ms var(--ease-out);
}

.action-notice-enter-from,
.action-notice-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .action-notice-enter-active,
  .action-notice-leave-active {
    transition: none;
  }
}
</style>
