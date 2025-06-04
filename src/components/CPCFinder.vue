<template>
  <v-container>
    <v-card>
      <!-- <v-card-title class="text-h5"> CPC Finder Ranks - 韶关学院 </v-card-title> -->
      <v-divider></v-divider>
      <v-data-table
        :headers="headers"
        :items="students"
        :loading="loading"
        item-value="studentId"
        class="elevation-1"
        items-per-page="-1"
        hide-default-footer
      >
        <template v-slot:loading>
          <v-skeleton-loader type="table-row@10"></v-skeleton-loader>
        </template>
        <template v-slot:no-data>
          <v-alert type="info" prominent>
            No data available or failed to load.
          </v-alert>
        </template>
      </v-data-table>
    </v-card>
  </v-container>
</template>

<script lang="ts" setup>
import { ref, onMounted } from "vue";
import axios from "axios";

interface Student {
  studentId: string;
  name: string;
  schoolName: string;
  championCount: number;
  secCount: number;
  thiCount: number;
  goldCount: number;
  silverCount: number;
  bronzeCount: number;
}

interface ApiResponse {
  data: Student[];
  pagination: {
    current: number;
    pageSize: number;
    total: number;
    pages: number;
  };
}

const students = ref<Student[]>([]);
const loading = ref(true);

const headers = ref([
  { title: "姓名", key: "name", align: "start" as const, sortable: true },
  // { title: "学校", key: "schoolName", sortable: true }, // 没用
  // { title: "冠军", key: "championCount", align: "end" as const, sortable: true },
  // { title: "亚军", key: "secCount", align: "end" as const, sortable: true },
  // { title: "季军", key: "thiCount", align: "end" as const, sortable: true }, // 就你sgu还想捧杯?
  { title: "金牌", key: "goldCount", align: "end" as const, sortable: true },
  { title: "银牌", key: "silverCount", align: "end" as const, sortable: true },
  { title: "铜牌", key: "bronzeCount", align: "end" as const, sortable: true },
]);

const fetchStudents = async () => {
  loading.value = true;
  try {
    // 使用代理路径
    const response = await axios.get<ApiResponse>(
      "https://cpcfinder-api.zh314.xyz/student?school=韶关学院&pageSize=1000"
    );
    if (response.data && response.data.data) {
      students.value = response.data.data;
    } else {
      console.error("No data received from API or data format is incorrect.");
      students.value = [];
    }
  } catch (error) {
    console.error("Error fetching student data:", error);
    students.value = []; // Clear students or set an error state to be handled by no-data slot
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchStudents();
});
</script>

<style scoped>
.v-card {
  margin-top: 20px;
}
</style>
