import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://jasn9776.github.io',
  base: '/website',
  integrations: [
    mdx(),
    tailwind({ applyBaseStyles: false }),
  ],
});
