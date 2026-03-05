<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Sun, Moon } from 'lucide-vue-next'

const isDark = ref(true)

onMounted(() => {
  isDark.value = document.documentElement.classList.contains('dark')
})

function toggle() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}
</script>

<template>
  <button
    @click="toggle"
    class="inline-flex items-center justify-center rounded-md p-2 hover:bg-accent hover:text-accent-foreground transition-colors"
  >
    <Sun v-if="isDark" class="h-5 w-5" />
    <Moon v-else class="h-5 w-5" />
  </button>
</template>
