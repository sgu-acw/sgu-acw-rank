<script setup lang="ts">
import { cn } from '../../../lib/utils'

const props = withDefaults(defineProps<{
  class?: string
}>(), { class: '' })
</script>

<template>
  <div :class="cn('rounded-xl bg-card text-card-foreground border border-border/60', props.class)">
    <slot />
  </div>
</template>
