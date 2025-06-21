<template>
  <div v-for="article in articles" :key="article.id">
    <v-card
      :to="'/blog/page?id=' + article.id"
      class="blog-page"
      min-width="60%"
      style="line-height: 1.8"
    >
      <h2>{{ article.title }}</h2>
      <div v-html="article.content"></div>
    </v-card>
    <br />
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { renderMarkdown, extractTitleAndContent } from "@/utils/Markdown";
// 注意：在浏览器环境中直接使用 'fs/promises' 会有问题。
// 这段代码假设它运行在 Node.js 环境 (例如 SSR)
// 或者构建工具 (如 Vite) 提供了相应的转换或 polyfill。
// 如果是纯客户端应用，你需要通过 API 请求或其他方式获取 Markdown 文件。
// Node.js 'fs' and 'path' modules are not available in the browser.

const articles = ref([]);

const loadArticles = async () => {
  try {
    // Use Vite's import.meta.glob to load Markdown files at build time.
    // The path is relative to the current file (BlogPage.vue).
    // If your 'articles' folder is in 'src/articles', and BlogPage.vue is in 'src/components/',
    // the path would be '../articles/*.md'. Adjust as per your project structure.
    const mdModules = import.meta.glob("@/articles/*.md", {
      as: "raw",
      eager: true,
    });

    const loadedArticles = [];
    for (const filePath in mdModules) {
      const rawContent = mdModules[filePath];
      // Extract a filename or a unique part of the path for the ID
      // Example: '../articles/my-first-post.md' -> 'my-first-post.md'
      const fileName = filePath.split("/").pop() || filePath;
      const { title, markdown } = extractTitleAndContent(rawContent);
      const html = renderMarkdown(markdown);

      loadedArticles.push({
        index: parseInt(fileName.split("-")[0]),
        id: fileName,
        title: title || "Untitled",
        content: html,
      });
    }
    loadedArticles.sort((a, b) => b.index - a.index)
    articles.value = loadedArticles
  } catch (error) {
    console.error("Error loading articles:", error);
    // 可以根据需要添加错误处理，例如显示错误消息
    articles.value = []; // 出错时清空或设置错误状态
  }
};

onMounted(async () => {
  // loadArticles is now synchronous because import.meta.glob with eager:true is synchronous
  loadArticles();
});
</script>

<style scoped>
.blog-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.article-section {
  margin-bottom: 40px;
  border-bottom: 1px solid #ccc;
  padding-bottom: 20px;
}

h2 {
  margin-bottom: 10px;
}

/* Target images within the v-html rendered content */
.blog-page div :deep(img) {
  max-width: 100%; /* Ensures images don't overflow their container */
  height: auto; /* Maintains aspect ratio */
  display: block; /* Can help with spacing issues */
  margin-top: 1em; /* Optional: add some space above the image */
  margin-bottom: 1em; /* Optional: add some space below the image */
}
</style>
