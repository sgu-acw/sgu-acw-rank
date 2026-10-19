<script setup lang="ts">
import { Button } from './button'

defineProps<{
  label: string
  destructive?: boolean
  disabled?: boolean
}>()
</script>

<template>
  <Button
    type="button"
    variant="ghost"
    size="icon"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    :class="destructive ? 'text-destructive hover:bg-destructive/10 hover:text-destructive' : 'text-muted-foreground'"
  >
    <slot />
  </Button>
</template>
