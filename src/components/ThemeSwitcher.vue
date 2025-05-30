<template>
  <v-btn icon @click="toggleTheme">
    <v-icon>{{ isDark ? 'mdi-brightness-7' : 'mdi-brightness-3' }}</v-icon>
  </v-btn>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useTheme } from 'vuetify';

const theme = useTheme();
const isDark = ref(false);

// Load theme preference from local storage on mount
onMounted(() => {
  const storedTheme = localStorage.getItem('theme');
  if (storedTheme) {
    isDark.value = storedTheme === 'dark';
    theme.global.name.value = isDark.value ? 'dark' : 'light';
  }
});

// Watch for changes in isDark and update the theme and local storage
watch(isDark, (newVal) => {
  theme.global.name.value = newVal ? 'dark' : 'light';
  localStorage.setItem('theme', newVal ? 'dark' : 'light');
});

function toggleTheme() {
  isDark.value = !isDark.value;
}
</script>