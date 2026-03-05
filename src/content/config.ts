import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    sortOrder: z.number(),
  }),
});

export const collections = { blog };
