<script setup lang="ts">
import CodingWorkspace from './CodingWorkspace.vue'
import { ArrowUpRight, Code2 } from 'lucide-vue-next'
</script>
<template>
  <div class="learning-page">
    <header class="learning-page-heading">
      <div><div class="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Code2 class="h-4 w-4" />WORKSPACE</div><h1 class="text-2xl font-semibold tracking-tight">云端 IDE</h1></div>
      <a href="/learn" class="learning-text-link">去题库练习<ArrowUpRight class="h-4 w-4" /></a>
    </header>
    <CodingWorkspace />
  </div>
</template>
