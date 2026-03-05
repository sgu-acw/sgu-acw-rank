<script setup lang="ts">
import { cn } from '../../../lib/utils'

const props = withDefaults(defineProps<{
  class?: string
  src?: string
  alt?: string
  size?: string
}>(), { class: '', size: '40' })
</script>

<template>
  <span :class="cn('relative flex shrink-0 overflow-hidden rounded-full', props.class)" :style="{ width: size + 'px', height: size + 'px' }">
    <img v-if="src" :src="src" :alt="alt" class="aspect-square h-full w-full object-cover" />
    <span v-else class="flex h-full w-full items-center justify-center rounded-full bg-muted text-sm">
      <slot />
    </span>
  </span>
</template>
