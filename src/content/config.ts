import { defineCollection, z } from 'astro:content';

const projects = defineCollection({
  type: 'data',
  schema: z.object({
    order: z.number(),
    title: z.string(),
    description: z.string(),
    image: z.string(),
    github_url: z.string().url(),
    blog_post: z.string().optional(), // slug of related blog post
    category: z.string(),
    year: z.number(),
  }),
});

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    heroImage: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { projects, blog };
