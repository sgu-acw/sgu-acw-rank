<script setup lang="ts">
defineProps<{
  name?: string | null
  signature?: string | null
}>()
</script>

<template>
  <span class="inline-flex max-w-full min-w-0 items-baseline gap-x-1.5 align-baseline">
    <span class="min-w-0 truncate" :title="name || undefined">{{ name }}</span>
    <span
      v-if="signature"
      class="max-w-[65%] shrink-0 truncate text-[length:min(0.75em,0.75rem)] font-normal text-muted-foreground"
      :title="signature"
    >{{ signature }}</span>
  </span>
</template>
