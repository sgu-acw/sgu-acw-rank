<script setup lang="ts">
import { cn } from '../../../lib/utils'

const props = withDefaults(defineProps<{
  class?: string
  variant?: 'default' | 'destructive'
}>(), { class: '', variant: 'default' })
</script>

<template>
  <div
    role="alert"
    :class="cn(
      'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
      variant === 'destructive' && 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
      props.class
    )"
  >
    <slot />
  </div>
</template>
