<template>
  <v-container class="fill-height d-flex align-center justify-center">
    <v-card class="pa-4" max-width="1000" style="width: 100%">
      <Ranks :users="users" />
    </v-card>
  </v-container>
</template>
<script setup lang="ts">
import { ref } from "vue";

const users = ref({
  nannan_servant: { handle: "nannan_servant", name: "康丁魁" }, // Keep the comma here
  magiccat: { handle: "magiccat", name: "康丁魁" },
});
</script>
