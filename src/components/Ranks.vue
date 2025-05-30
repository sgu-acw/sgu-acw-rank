<template>
  <v-container class="fill-height d-flex align-center justify-center">
    <v-col>
      <!-- <br/>
      <div class="mb-8 text-center">
        <v-text class="text-h3 mb-4 text-center elevation-2">
          SGU CodeForces Rank
        </v-text>
      </div>
      <br/> -->
      <v-card min-width="800px">
        <v-data-table
          v-model:sort-by="sortBy"
          v-model:expanded="expanded"
          :headers="headers"
          :items="userItems"
          :server-items-length="totalUsers"
          :loading="loading"
          item-value="name"
          loading-text="Fetching data from Codeforces API..."
          @update:page="fetchUsers"
          @update:items-per-page="onItemsPerPageChange"
          items-per-page="0"
          class="elevation-1"
          hide-default-footer
          show-expand
        >
          <template v-slot:item.avatar="{ item }">
            <v-avatar
              size="35"
              class="my-1"
              
            >
              <v-img
                :src="item.avatar || 'https://via.placeholder.com/40'"
                :alt="item.name"
              />
            </v-avatar>
          </template>
          <template v-slot:item.rating="{ item }">
            <v-chip
              :border="`${getColor(item.rating)} thin opacity-25`"
              :color="getColor(item.rating)"
              size="small"
              >{{ item.rating || "N/A" }}</v-chip
            >
          </template>
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
          <template v-slot:expanded-row="{ columns, item }">
            <td :colspan="columns.length">
              <v-list density="compact">
                <v-list-item
                  v-for="(account, index) in item.handles"
                  :key="index"
                  :title="`└ ` + account.handle"
                >
                  <template v-slot:append>
                    <v-chip
                      :border="`${getColor(account.rating)} thin opacity-25`"
                      :color="getColor(account.rating)"
                      size="small"
                      >{{ account.rating || "N/A" }}</v-chip
                    >
                  </template>
                </v-list-item>
              </v-list>
            </td>
          </template>
        </v-data-table>
      </v-card>
    </v-col>
  </v-container>
</template>

<script lang="ts" setup>
import { defineComponent, ref, onMounted } from "vue";
import axios from "axios";
interface Account {
  handle: string;
  rating: number;
  avatar: string; // Optional avatar property

  [key: string]: any; // Allow other properties
}
interface User {
  handles: Array<Account>;
  handle: string;
  name: string;
  avatar: string; // Optional avatar property
  rating?: number;
  [key: string]: any; // Allow other properties
}

interface Info {
  handle: string;
  // firstName?: string;
  name: string;
  [key: string]: any; // Allow other properties
}
const sortBy = ref<Array<{ key: string; order: "asc" | "desc" }>>([
  { key: "rating", order: "desc" },
]);
const expanded = ref<string[]>([]);
const users = ref<Record<string, Info>>({
  chronobox: { handle: "chronobox", name: "冯诺维" },
  "cheatgpt_1145.14": { handle: "CheatGPT_1145.14", name: "冯诺维" },
  codexzx: { handle: "codexzx", name: "谢泽栩" },
  xzxze: { handle: "xzxze", name: "谢泽栩" },
  hsn8086: { handle: "hsn8086", name: "朱子睿" },
  "small-hsn": { handle: "small-hsn", name: "朱子睿" },
  sunren356: { handle: "sunren356", name: "李镔彬" },
  xmlhs: { handle: "xmlhs", name: "黄家宝" },
  cjd666: { handle: "cjd666", name: "陈俊东" },
  blackbreead: { handle: "Blackbreead", name: "叶福都" },
  whitebread: { handle: "WhiteBread", name: "叶福都" },
  woodghost: { handle: "woodghost", name: "钱玟如" },
  "do-now": { handle: "do-now", name: "柯安鸿" },
  c47kiki: { handle: "C47KIKI", name: "陈思琪" },
  ling_yu175: { handle: "Ling_Yu175", name: "马嘉亮" },
  vlad66: { handle: "vlad66", name: "王鹏凯" },
  wesssxx: { handle: "Wesssxx", name: "吴仁光" },
  wang1113: { handle: "wang1113", name: "汪金力" },
});
const userItems = ref<User[]>([]);
const loading = ref(false);
const totalUsers = ref(0);
const headers = ref([
  {
    title: "Avatar",
    key: "avatar",
    value: (item) => item.avatar || "https://via.placeholder.com/40",
    sortable: false,
  },

  { title: "Name", key: "name" },
  { title: "Handle", key: "handle" },
  // { title: 'Last Name', key: 'lastName' },
  { title: "Rating", key: "rating" },
]);
const page = ref(1);
const itemsPerPage = ref(10);
function getColor(rating) {
  const rat_mapping: Record<number, string> = {
    4000: "white",
    3000: "black",
    2400: "red",
    2100: "orange",
    1900: "purple",
    1600: "blue",
    1400: "cyan",
    1200: "green",
    0: "gray",
  };
  const sortedRatings = Object.keys(rat_mapping)
    .map(Number)
    .sort((a, b) => b - a);
  for (let rat of sortedRatings) {
    if (rating >= rat) {
      return rat_mapping[rat];
    }
  }
}
const fetchUsers = async ({
  page: newPage,
  itemsPerPage: newItemsPerPage,
}: {
  page: number;
  itemsPerPage: number;
}) => {
  page.value = newPage;
  itemsPerPage.value = newItemsPerPage;
  loading.value = true;

  // In a real application, you'd need a backend to handle the API calls and pagination
  // as Codeforces API doesn't directly support server-side pagination.
  // For this example, we'll simulate it by fetching a fixed set of users.
  try {
    const userHandles = users.value ? Object.keys(users.value) : [];
    console.log(userHandles);
    const handlesString = userHandles.join(";");
    const response = await axios.get(
      `https://codeforces.com/api/user.info?handles=${handlesString}`
    );

    if (response.data.status === "OK") {
      const tmpDict: Record<string, User> = {};
      response.data.result.forEach((account: User) => {
        const user = users.value[account.handle.toLowerCase()];
        tmpDict.hasOwnProperty(user.name) ||
          (tmpDict[user.name] = {
            handles: [],
            handle: user.handle,
            name: user.name,
            avatar: user.avatar,
            rating: 0,
          });
        tmpDict[user.name].handles.push({
          handle: user.handle,
          rating: account.rating,
          avatar: account.avatar,
        });
        if (account.rating > tmpDict[user.name].rating) {
          tmpDict[user.name].rating = account.rating;
          tmpDict[user.name].handle = account.handle;
          tmpDict[user.name].avatar = account.avatar;
        }
      });
      totalUsers.value = response.data.result.length; // For simulation: Total number is equal to fetched count
      userItems.value = Object.values(tmpDict);
      // userItems.value.forEach((element) => {
      //   if (element.handles.length > 1) {
      //     expanded.value.push(element.name);
      //   }
      // });
    } else {
      console.error("Error fetching users:", response.data.comment);
      // Handle errors appropriately (e.g., show an error message to the user)
    }
  } catch (error) {
    console.error("Error during API call:", error);
    // Handle errors appropriately
  } finally {
    loading.value = false;
  }
};

const onItemsPerPageChange = (newItemsPerPage: number) => {
  itemsPerPage.value = newItemsPerPage;
  fetchUsers({ page: page.value, itemsPerPage: newItemsPerPage });
};

onMounted(() => {
  fetchUsers({ page: page.value, itemsPerPage: itemsPerPage.value });
});
</script>
