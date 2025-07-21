<template>
  <Ranks :students="users" />
</template>
<script setup lang="ts">
import { ref } from "vue";

// const users = ref([
//   { handle: "nannan_servant", name: "康丁魁" }, // Keep the comma here
//   { handle: "magiccat", name: "康丁魁" },
// ]);
const users = ref({
  康丁魁: {
    handles: ["nannan_servant", "magiccat"],
    enrollment_year: 21,
  },
});
</script>
