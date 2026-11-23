<script setup lang="ts">
import CodingWorkspace from './CodingWorkspace.vue'
import { ArrowUpRight, Code2 } from 'lucide-vue-next'
</script>
<template>
  <div class="learning-page">
    <header class="page-header mb-5">
      <div>
        <h1 class="page-title flex items-center gap-2">
          <Code2 class="h-5 w-5 text-muted-foreground" />
          云端 IDE
        </h1>
        <p class="page-subtitle">浏览器内免配置编写与运行代码</p>
      </div>
      <a href="/learn" class="learning-text-link">去题库练习<ArrowUpRight class="h-4 w-4" /></a>
    </header>
    <CodingWorkspace />
  </div>
</template>
