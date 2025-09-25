<template>
  <!-- 主容器，填充高度并居中 -->
  <v-container class="fill-height d-flex align-center justify-center">
    <!-- 卡片组件，设置最小宽度 -->
    <v-card :min-width="$vuetify.display.mobile ? '100%' : '800px'">
      <!-- 卡片标题区域 -->
      <v-card-title class="d-flex align-center">
        <span class="text-h5">{{
          $vuetify.display.mobile ? "CF RK" : "SGU CodeForces Rank"
        }}</span>
        <v-spacer></v-spacer>
        <!-- 导出按钮 -->
        <v-btn
          color="primary"
          @click="exportToXLSX"
          prepend-icon="mdi-file-excel"
        >
          {{ $vuetify.display.mobile ? "Export" : "Export to XLSX" }}
        </v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <!-- 数据表格 -->
      <v-data-table
        v-model:sort-by="sortBy"
        v-model:expanded="expanded"
        :headers="headers"
        :items="userItems"
        :server-items-length="totalUsers"
        :loading="loading"
        item-value="name"
        loading-text="Fetching data from Codeforces API..."
        @update:items-per-page="onItemsPerPageChange"
        items-per-page="0"
        class="elevation-1"
        hide-default-footer
        show-expand
      >
        <!-- <template v-slot:item.name="{ item }">
            {{ item.name }}
          </template> -->

        <!-- 头像列模板 -->
        <template v-slot:item.avatar="{ item }">
          <v-avatar size="35" class="my-1">
            <v-img
              :src="item.avatar || 'https://via.placeholder.com/40'"
              :alt="item.name"
            />
          </v-avatar>
        </template>
        <template v-slot:item.handle="{ item }">
          {{ item.handle }}
          <v-btn
            density="compact"
            icon="mdi-link"
            :href="`https://codeforces.com/profile/${item.handle}`"
            target="_blank"
            title="Open Codeforces Profile"
            variant="text"
            size="small"
          />
          <v-btn
            density="compact"
            icon="mdi-information"
            @click="
              router.push({
                name: '/codeforces/profile',
                query: { handle: item.handle },
              })
            "
            target="_blank"
            title="Open Local Profile"
            variant="text"
            size="small"
          />
        </template>
        <!-- 年级列模板 -->
        <template v-slot:item.enrollment_year="{ item }">
          {{ item.enrollment_year > 0 ? item.enrollment_year : "?" }}
        </template>
        <!-- Rating列模板，显示彩色标签 -->
        <template v-slot:item.rating="{ item }">
          <v-chip
            :border="`${getColor(item.rating)} thin opacity-25`"
            :color="getColor(item.rating)"
            size="small"
            >{{ item.rating || "N/A" }}</v-chip
          >
        </template>
        <!-- 展开行按钮模板 -->
        <template
          v-slot:item.data-table-expand="{
            internalItem,
            isExpanded,
            toggleExpand,
            item,
          }"
        >
          <v-btn
            v-if="item.handles.length > 1"
            @click="toggleExpand(internalItem)"
            :icon="
              isExpanded(internalItem) ? 'mdi-chevron-up' : 'mdi-chevron-down'
            "
            variant="text"
          />
        </template>
        <!-- 展开行内容模板 -->
        <template v-slot:expanded-row="{ columns, item }">
          <td :colspan="columns.length">
            <v-list density="compact">
              <v-list-item
                v-for="(cfProfile, index) in item.cfProfiles"
                :key="index"
                :title="`└ ` + cfProfile.handle"
              >
                <template v-slot:append>
                  <v-chip
                    :border="`${getColor(cfProfile.rating)} thin opacity-25`"
                    :color="getColor(cfProfile.rating)"
                    size="small"
                    >{{ cfProfile.rating || "N/A" }}</v-chip
                  >
                </template>
              </v-list-item>
            </v-list>
          </td>
        </template>
      </v-data-table>
    </v-card>
  </v-container>
</template>

<script lang="ts" setup>
import { ref, onMounted, type PropType } from "vue";

// 导入工具函数和类型
import {
  fetchUserInfo,
  fetchUserInfoStructured,
  fetchUserStatus,
  processUserSubmissions,
  getColor,
} from "@/utils/CFAPI";
import { DefaultMap } from "@/utils/Collections";

import type { Submission, User } from "@/interface/CFAPI";

// 导入XLSX库用于导出Excel
import * as XLSX from "xlsx";
import router from "@/router";

// 定义接口
interface BaseStudentInfo {
  handles: string[]; // 学生的Codeforces handle列表
  enrollment_year: number; // 入学年份
}

// 扩展的学生信息接口
interface StudentInfo extends BaseStudentInfo {
  cfProfiles: User[]; // Codeforces用户信息列表
  rating: number; // 最高rating
  handle: string; // 主账号handle
  name: string; // 学生姓名
  avatar: string; // 头像URL
  todaySolve: number; // 今日解题数
  allSolve: number; // 总解题数
}

// 定义组件props
const props = defineProps({
  students: {
    type: Object as PropType<Record<string, BaseStudentInfo>>,
    required: true,
  },
});

// 将props转为响应式引用
const students = ref(props.students);

let mapping: Record<string, string> = {};

for (const key in students.value) {
  const student = students.value[key];
  for (const handle of student.handles) {
    // 将handle转换为小写并存储到映射中
    mapping[handle.toLowerCase()] = key;
  }
}

// 初始化排序状态
const sortBy = ref<Array<{ key: string; order: "asc" | "desc" }>>([
  { key: "rating", order: "desc" }, // 默认按rating降序
]);

// 展开行状态
const expanded = ref<string[]>([]);
// 表格数据
const userItems = ref<StudentInfo[]>([]);
// 加载状态
const loading = ref(false);
// 总用户数
const totalUsers = ref(0);
// 分页状态
const page = ref(1);
const itemsPerPage = ref(10);
// 表头配置
const headers = ref([
  {
    title: "Avatar",
    key: "avatar",
    value: (item: StudentInfo) => item.avatar,
    sortable: false,
  },
  { title: "Name", key: "name", sortable: false },
  { title: "Grade", key: "enrollment_year" },
  { title: "Handle", key: "handle", sortable: false },
  { title: "Rating", key: "rating" },
  { title: "Today Solve", key: "todaySolve" },
  { title: "All Solve", key: "allSolve" },
]);

/**
 * 获取用户信息并处理
 * @param param0 分页参数
 */
const fetchUsers = async ({
  page: newPage,
  itemsPerPage: newItemsPerPage,
}: {
  page: number;
  itemsPerPage: number;
}) => {
  page.value = newPage;

  const CONCURRENT_LIMIT = 2; // 并发请求限制，避免过多请求
  itemsPerPage.value = newItemsPerPage;
  loading.value = true;
  // 获取所有学生handle
  const handles = mapping ? Object.keys(mapping) : [];
  console.log("Fetching users for handles:", handles);
  // 临时存储用户信息的映射
  const tmpUserMp: Record<string, StudentInfo> = {};
  const userData = [];
  try {
    // 处理API返回的用户数据
    for await (const user of fetchUserInfoStructured(handles))
      userData.push(user);
  } catch (error) {
    console.error("Error during API call:", error);
    loading.value = false;
    return;
  }
  totalUsers.value = userData.length;
  for await (const cfProfile of userData) {
    // 获取对应的学生信息
    const name = mapping[cfProfile.handle.toLowerCase()];
    // 如果学生不存在于临时映射中，则初始化
    tmpUserMp.hasOwnProperty(name) ||
      (tmpUserMp[name] = {
        handles: [],
        cfProfiles: [],
        handle: cfProfile.handle,
        name: name,
        avatar: cfProfile.avatar || "",
        rating: 0,
        todaySolve: 0,
        allSolve: 0,
        enrollment_year: students.value[name].enrollment_year || -1,
      });
    // 添加用户信息
    tmpUserMp[name].cfProfiles.push(cfProfile);

    // 更新最高rating和对应的handle、avatar
    if (cfProfile.rating > tmpUserMp[name].rating) {
      tmpUserMp[name].rating = cfProfile.rating;
      tmpUserMp[name].handle = cfProfile.handle;
      tmpUserMp[name].avatar = cfProfile.avatar;
    }
  }
  // 初始化所有用户的解题数
  for (const userName in tmpUserMp) {
    tmpUserMp[userName].todaySolve = 0;
    tmpUserMp[userName].allSolve = 0;
  }

  // 准备所有需要获取提交记录的handle
  const allHandlesToFetch: { userName: string; cfHandle: string }[] = [];
  for (const userName in tmpUserMp) {
    for (const cfProfile of tmpUserMp[userName].cfProfiles) {
      allHandlesToFetch.push({ userName, cfHandle: cfProfile.handle });
    }
  }

  // 分批获取用户提交记录
  const statusResults = [];
  for (let i = 0; i < allHandlesToFetch.length; i += CONCURRENT_LIMIT) {
    const batch = allHandlesToFetch.slice(i, i + CONCURRENT_LIMIT);
    const batchPromises = batch.map(async ({ userName, cfHandle }) => {
      try {
        // 获取用户提交记录
        const statusResponse = await fetchUserStatus(cfHandle);
        if (statusResponse.data.status === "OK") {
          const submissions: Submission[] = statusResponse.data.result;
          // 处理提交记录，获取今日解题和总解题
          const { todaySolvedProblems, allSolvedProblems } =
            processUserSubmissions(submissions);
          return {
            userName,
            cfHandle,
            todaySolvedProblems,
            allSolvedProblems,
            error: null,
          };
        } else {
          console.error(
            `Error fetching user status for ${cfHandle}:`,
            statusResponse.data.comment
          );
          return {
            userName,
            cfHandle,
            error: statusResponse.data.comment,
            todaySolvedProblems: new Set<string>(),
            allSolvedProblems: new Set<string>(),
          };
        }
      } catch (error) {
        console.error(
          `Error during API call for user status ${cfHandle}:`,
          error
        );

        return {
          userName,
          cfHandle,
          error,
          todaySolvedProblems: new Set<string>(),
          allSolvedProblems: new Set<string>(),
        };
      }
    });
    const resultsFromBatch = await Promise.all(batchPromises);
    statusResults.push(...resultsFromBatch);
  }

  // 使用DefaultMap聚合解题信息
  const todaySolved: DefaultMap<string, Set<string>> = new DefaultMap(
    () => new Set<string>()
  );
  const allSolved: DefaultMap<string, Set<string>> = new DefaultMap(
    () => new Set<string>()
  );

  // 处理每个用户的结果
  for (const result of statusResults) {
    if (result.error) continue;

    // 添加今日解题
    result.todaySolvedProblems.forEach((problemName) =>
      todaySolved.get(result.userName).add(problemName)
    );

    // 添加总解题
    result.allSolvedProblems.forEach((problemName) =>
      allSolved.get(result.userName).add(problemName)
    );
  }

  userItems.value = Object.values(tmpUserMp);

  // 更新解题数到用户信息
  for (const userName in tmpUserMp) {
    tmpUserMp[userName].todaySolve = todaySolved.get(userName).size || 0;
    tmpUserMp[userName].allSolve = allSolved.get(userName).size || 0;
  }

  userItems.value = Object.values(tmpUserMp);
  loading.value = false;
};

/**
 * 处理每页显示数量变化
 * @param newItemsPerPage 新的每页显示数量
 */
const onItemsPerPageChange = (newItemsPerPage: number) => {
  itemsPerPage.value = newItemsPerPage;
  fetchUsers({ page: page.value, itemsPerPage: newItemsPerPage });
};

// 组件挂载时获取数据
onMounted(() => {
  fetchUsers({ page: page.value, itemsPerPage: itemsPerPage.value });
});

/**
 * 导出数据到Excel
 */
const exportToXLSX = () => {
  if (!userItems.value || userItems.value.length === 0) {
    console.warn("No data to export.");
    return;
  }

  // 准备导出数据
  const dataToExport = userItems.value.map((user) => ({
    Name: user.name,
    "Handle (Primary)": user.handle,
    "Rating (Highest)": user.rating || "N/A",
  }));

  // 创建工作表和 workbook
  const worksheet = XLSX.utils.json_to_sheet(dataToExport);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "SGU CF Ranks");

  // 设置列宽
  worksheet["!cols"] = [
    { wch: 25 }, // Name列宽
    { wch: 25 }, // Handle列宽
    { wch: 15 }, // Rating列宽
  ];

  // 导出文件
  XLSX.writeFile(workbook, "sgu_codeforces_ranks.xlsx");
};
</script>
