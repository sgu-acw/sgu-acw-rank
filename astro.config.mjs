// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import tailwind from '@astrojs/tailwind';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  integrations: [
    vue(),
    tailwind({ applyBaseStyles: false }),
  ],
  output: 'static',
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      theme: 'one-dark-pro',
    },
  },
});
