<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'radix-vue'
import { confirmation, closeConfirmation } from '../../lib/confirm'
import { Button } from './button'
const cancel = () => closeConfirmation(false)
onMounted(() => document.addEventListener('astro:before-swap', cancel))
onUnmounted(() => { document.removeEventListener('astro:before-swap', cancel); cancel() })
</script>

<template>
  <DialogRoot :open="!!confirmation" @update:open="value => { if (!value) cancel() }">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[100] bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-[101] max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-popover p-6 shadow-xl">
        <DialogTitle class="text-base font-semibold">{{ confirmation?.title }}</DialogTitle>
        <DialogDescription class="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{{ confirmation?.message }}</DialogDescription>
        <div class="mt-6 flex justify-end gap-2">
          <Button v-if="!confirmation?.informational" variant="outline" class="min-h-11" @click="cancel">取消</Button>
          <Button class="min-h-11" @click="closeConfirmation(true)">{{ confirmation?.informational ? '知道了' : '确认' }}</Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
