// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import tailwind from '@astrojs/tailwind';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkLinkCard from './src/plugins/remark-link-card.mjs';

export default defineConfig({
  integrations: [
    vue(),
    tailwind({ applyBaseStyles: false }),
  ],
  output: 'static',
  vite: {
    server: {
      // 本地开发时把 /api 转给后端。生产环境由 Cloudflare Pages Function
      // 完成同样的转发，所以前端代码不需要区分环境。
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8091',
          changeOrigin: false,
        },
      },
    },
  },
  markdown: {
    remarkPlugins: [remarkMath, remarkLinkCard],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      theme: 'one-dark-pro',
    },
  },
});
