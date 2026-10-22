<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose, useId } from 'radix-vue'
import { X } from 'lucide-vue-next'
import IconButton from '../ui/IconButton.vue'
defineProps<{ open: boolean; title: string; description: string }>()
const descriptionId = useId()
const emit = defineEmits<{ 'update:open': [boolean] }>()
</script>
<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[80] bg-black/50" />
      <DialogContent :aria-describedby="description ? descriptionId : undefined" class="fixed left-1/2 top-1/2 z-[81] flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-popover shadow-2xl">
        <div class="flex items-start gap-3 border-b p-4 sm:px-6">
          <div class="min-w-0 flex-1"><DialogTitle class="font-semibold">{{ title }}</DialogTitle><DialogDescription v-if="description" :id="descriptionId" class="mt-1 text-xs leading-5 text-muted-foreground">{{ description }}</DialogDescription></div>
          <DialogClose as-child><IconButton label="关闭对话框"><X class="h-4 w-4" /></IconButton></DialogClose>
        </div>
        <div class="min-h-0 overflow-y-auto p-4 sm:p-6"><slot /></div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
