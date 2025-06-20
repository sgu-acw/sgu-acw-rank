<template>
  <v-container class="fill-height d-flex align-center justify-center">
    <v-card class="blog-page" min-width="60%">
      <h2>{{ article.title }}</h2>
      <div v-html="article.content"></div>
    </v-card>
  </v-container>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { renderMarkdown, extractTitleAndContent } from "@/utils/Markdown";
const route = useRoute();

// console.log(route.query.id);
// 注意：在浏览器环境中直接使用 'fs/promises' 会有问题。
// 这段代码假设它运行在 Node.js 环境 (例如 SSR)
// 或者构建工具 (如 Vite) 提供了相应的转换或 polyfill。
// 如果是纯客户端应用，你需要通过 API 请求或其他方式获取 Markdown 文件。
// Node.js 'fs' and 'path' modules are not available in the browser.

const article = ref([]);

const loadArticles = async () => {
  const articleFileNameWithExt = route.query.id; // e.g., "my-first-post.md"

  if (
    !articleFileNameWithExt ||
    typeof articleFileNameWithExt !== "string" ||
    !articleFileNameWithExt.endsWith(".md")
  ) {
    console.warn("No article ID found in route query. Displaying no articles.");
    article.value = {
      title: "404 Not Found",
    };
    return;
  }

  const baseName = articleFileNameWithExt.slice(0, -3); // Remove ".md" suffix

  try {
    // Dynamically import the specific Markdown file.
    // The path `../articles/` is relative to this component file.
    // `${baseName}.md?raw` ensures Vite can statically analyze the import for .md files.
    const module = await import(`../articles/${baseName}.md?raw`);
    const rawContent = module.default; // Raw content is usually in the .default property

    // Ensure rawContent is a string before splitting
    if (typeof rawContent !== "string") {
      console.error(
        "Error loading article: content is not a string.",
        articleFileNameWithExt
      );
      return;
    }

    const { title, markdown } = extractTitleAndContent(rawContent);
    const html = renderMarkdown(markdown);

    article.value = {
      id: articleFileNameWithExt, // Use the original full filename (e.g., "my-first-post.md") for the article's ID
      title: title || "Untitled Article",
      content: html,
    };
  } catch (error) {
    article.value = {
      title: "404 Not Found",
    };
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
