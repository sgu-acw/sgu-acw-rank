<template>
  <Ranks :students="users" />
</template>
<script setup lang="ts">
import { ref } from "vue";
const users = ref({
  冯诺维: { handles: ["chronobox", "CheatGPT_1145.14"], enrollment_year: 23 },
  谢泽栩: { handles: ["codexzx", "xzxze"], enrollment_year: 24 },
  朱子睿: { handles: ["hsn8086", "small-hsn"], enrollment_year: 24 },
  李镔彬: { handles: ["sunren356"], enrollment_year: 22 },
  黄家宝: { handles: ["xmlhs"], enrollment_year: 23 },
  陈俊东: { handles: ["cjd666", "njn999"], enrollment_year: 24 },
  叶福都: { handles: ["Blackbreead", "WhiteBread"], enrollment_year: 23 },
  施雨柔: { handles: ["webxixi"], enrollment_year: -1 },
  钱玟如: { handles: ["woodghost"], enrollment_year: 23 },
  柯安鸿: { handles: ["do-now"], enrollment_year: 23 },
  陈思琪: { handles: ["C47KIKI", "3977493874"], enrollment_year: 24 },
  马嘉亮: { handles: ["Ling_Yu175"], enrollment_year: 24 },
  王鹏凯: { handles: ["vlad66"], enrollment_year: 24 },
  吴仁光: { handles: ["Wesssxx"], enrollment_year: 24 },
  汪金力: { handles: ["wang1113"], enrollment_year: 24 },
  林羿安: { handles: ["primal123"], enrollment_year: -1 },
  卢成洋: { handles: ["sao8"], enrollment_year: 25 },
});
</script>
