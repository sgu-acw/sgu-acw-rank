<template>
  <Ranks :students="users" />
</template>
<script setup lang="ts">
import { ref } from "vue";

const users = ref({
  nannan_servant: { handle: "nannan_servant", name: "康丁魁" }, // Keep the comma here
  magiccat: { handle: "magiccat", name: "康丁魁" },
});
</script>
