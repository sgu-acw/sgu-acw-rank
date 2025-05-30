<script setup lang="ts">
import router from "../router";
import { ref, computed } from "vue";
import { useDisplay } from "vuetify";

const { mobile } = useDisplay();

const items = ref([
  {
    title: "Home",
    route: "/",
    icon: "mdi-home",
  },
  {
    title: "CodeForces",
    icon: "mdi-xml",
    children: [
      {
        title: "Rank",
        route: "/codeforces/rank",
        icon: "mdi-trophy",
      },
    ],
  },
]);

const rail = ref(true);
const drawer = ref(!mobile.value);

function clickNav() {
  rail.value = !rail.value;
  drawer.value = mobile.value ? !rail.value : true;
}
</script>

<template>
  <v-app-bar>
    <template v-slot:prepend>
      <v-app-bar-nav-icon @click="clickNav()"></v-app-bar-nav-icon>
    </template>
    <v-app-bar-title>SGU Algo Contest Workshop</v-app-bar-title>
    <template v-slot:append>
      <LanguageSwitcher />
      <ThemeSwitcher />
    </template>
  </v-app-bar>
  <v-navigation-drawer expand-on-hover :rail="rail" v-model="drawer">
    <v-list density="compact" nav>
      <template v-for="(item, index) in items" :key="index">
        <v-list-group
          v-if="item.children"
          :value="false"
          :prepend-icon="item.icon"
        >
          <template v-slot:activator="{ props }">
            <v-list-item v-bind="props" :title="item.title" />
          </template>
          <v-list-item
            v-for="(child, childIndex) in item.children"
            :key="childIndex"
            :prepend-icon="child.icon"
            :title="child.title"
            @click="router.push( child.route)"
          />
        </v-list-group>
        <v-list-item
          v-else
          :prepend-icon="item.icon"
          :title="item.title"
          @click="router.push(item.route)"
        />
      </template>
    </v-list>
  </v-navigation-drawer>
</template>
