<script setup lang="ts">
defineProps<{
  name?: string | null
  signature?: string | null
}>()
</script>

<template>
  <span class="inline-flex max-w-full min-w-0 flex-wrap items-baseline gap-x-1.5 align-baseline">
    <span class="min-w-0 truncate" :title="name || undefined">{{ name }}</span>
    <span
      v-if="signature"
      class="min-w-0 max-w-full whitespace-normal break-words text-[length:min(0.75em,0.75rem)] font-normal leading-snug text-muted-foreground"
    >{{ signature }}</span>
  </span>
</template>
