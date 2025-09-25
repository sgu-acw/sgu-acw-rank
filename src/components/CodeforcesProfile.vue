<template>
  <v-container class="fill-height d-flex align-center justify-center">
    <v-card
      :min-width="$vuetify.display.mobile ? '100%' : '600px'"
      class="pa-6 elevation-3"
      outlined
      v-if="user"
    >
      <!-- 用户头像和基本信息 -->
      <v-row align="center">
        <v-col cols="12" md="4" class="d-flex justify-center">
          <v-avatar size="120" class="mb-4">
            <v-img :src="user.titlePhoto" alt="User Avatar"></v-img>
          </v-avatar>
        </v-col>

        <v-col cols="12" md="8">
          <h5 :style="{ color: rankColor, marginBottom: '-8px' }">
            {{ user.rank }}
          </h5>
          <h2 :style="{ color: rankColor, marginTop: '-8px' }">
            {{ user.handle }}
          </h2>

          <strong>Rating:</strong>
          <span :style="{ color: rankColor, marginLeft: '8px' }">
            {{ user.rating }}
          </span>
          <span class="ml-2">
            (max.
            <span :style="{ color: rankColor }">{{ user.maxRank }} | </span>
            <span :style="{ color: rankColor }">{{ user.maxRating }}</span
            >) </span
          ><br />

          <strong>Organization:</strong> {{ user.organization || "N/A" }}<br />

          <strong>Friends:</strong> {{ user.friendOfCount }}<br />

          <strong>Email:</strong> {{ user.email || "N/A" }}
        </v-col>
      </v-row>

      <!-- 分割线 -->
      <v-divider class="my-4"></v-divider>

      <!-- Rating Sparkline -->
      <v-row v-if="ratingHistory.length" class="mt-6">
        <v-col cols="12">
          <h5 class="text-center">Rating History</h5>
          <v-sparkline
            :model-value="ratingHistory"
            color="blue"
            fill
            smooth
            :gradient="['blue', 'cyan']"
            :line-width="2"
            :padding="8"
          ></v-sparkline>
        </v-col>
      </v-row>
    </v-card>
    <div v-else-if="!flag" style="min-width: 30vw">
      <!-- 搜索框 -->
      <v-row>
        <v-text-field
          v-model="searchHandle"
          label="Enter Codeforces Handle"
          outlined
          dense
          clearable
          density="compact"
          variant="solo-filled"
          @keyup.enter="searchUser"
        />
      </v-row>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import router from "../router";
import {
  fetchOneUserInfoStructured,
  fetchUserRating,
  getColor,
} from "@/utils/CFAPI";
import type { User, RatingChange } from "@/interface/CFAPI";

const searchHandle = ref<string>(""); // 搜索框绑定的值
const user = ref<User | null>(null);
const flag = ref<boolean>(false);
const ratingHistory = ref<number[]>([]);

// 根据用户评分获取颜色
const rankColor = computed(() => {
  return user.value ? getColor(user.value.rating) : "black";
});

// 搜索用户信息
async function searchUser() {
  if (!searchHandle.value) return;
  try {
    user.value = await fetchOneUserInfoStructured(searchHandle.value);
    const ratingChanges = await fetchUserRating(searchHandle.value);
    ratingHistory.value = ratingChanges.map((change) => change.newRating);
  } catch (error) {
    console.error("Failed to fetch user info or rating history:", error);
    user.value = null;
    ratingHistory.value = [];
  }
}

// 在组件挂载时读取 URL 中的 handle 参数
onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const handle = params.get("handle");
  const flag = true;
  if (handle) {
    searchHandle.value = handle;
    await searchUser();
  }
});
</script>
