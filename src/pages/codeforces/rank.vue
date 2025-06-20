<template>
  <Ranks :students="users" />
</template>
<script setup lang="ts">
import { ref } from "vue";

const users = ref({
  hsn8086: { handle: "hsn8086", name: "hsn" },
});
</script>
