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
  chronobox: { handle: "chronobox", name: "冯诺维" }, // Keep the comma here
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
</script>
