<script setup lang="ts">
import { cn } from '../../../lib/utils'

const props = withDefaults(defineProps<{
  class?: string
  type?: string
  placeholder?: string
  modelValue?: string
}>(), { class: '', type: 'text' })

defineEmits(['update:modelValue', 'keyup'])
</script>

<template>
  <input
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :class="cn('flex h-11 min-w-0 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', props.class)"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    @keyup="$emit('keyup', $event)"
  />
</template>
