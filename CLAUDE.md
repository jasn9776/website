# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at localhost:4321
npm run build    # production build → dist/
npm run preview  # preview the production build
```

Node.js is required but not currently installed. Install via `brew install node` or https://nodejs.org, then run `npm install`.

## Stack

- **Astro 4** — SSG framework; pages in `src/pages/`, layouts in `src/layouts/`
- **Tailwind CSS 3** — via `@astrojs/tailwind`; config in `tailwind.config.mjs`
- **MDX** — via `@astrojs/mdx`; blog posts are `.mdx` files in `src/content/blog/`
- **Content Collections** — typed schemas in `src/content/config.ts`

## Architecture

### Content Collections

Two collections defined in `src/content/config.ts`:

| Collection | Type | Location | Key fields |
|---|---|---|---|
| `projects` | `data` (JSON) | `src/content/projects/*.json` | `order`, `title`, `description`, `image`, `github_url`, `blog_post?`, `category`, `year` |
| `blog` | `content` (MDX) | `src/content/blog/*.mdx` | `title`, `date`, `heroImage`, `description?` |

The `blog_post` field on a project is the slug of the related blog post — used to wire up the "Read the post" link on project cards. It's optional; projects without it won't show the link.

### Pages

| Route | File | Data source |
|---|---|---|
| `/` | `src/pages/index.astro` | Both collections |
| `/blog` | `src/pages/blog/index.astro` | `blog` collection |
| `/blog/[slug]` | `src/pages/blog/[slug].astro` | `blog` collection entry |

### Components

- `Header.astro` / `Footer.astro` — site chrome, used in `BaseLayout`
- `ProjectCard.astro` — used in the horizontal scroll carousel on the homepage
- `BlogPostCard.astro` — used in the grid on homepage and `/blog`
- `Caption.astro` — import in any MDX file for inline images with captions:

```mdx
import Caption from '../../components/Caption.astro';

<Caption src="/images/my-figure.svg" alt="Description" caption="Figure 1. Caption text." />
```

### Layouts

- `BaseLayout.astro` — full page shell: Google Fonts, `global.css`, header, footer
- `BlogPostLayout.astro` — wraps `BaseLayout`; adds hero image, post header, prose column

### Design System

Tokens live in two places (kept in sync):
- `tailwind.config.mjs` — Tailwind `extend.colors` and `extend.fontFamily`
- `src/styles/global.css` — CSS custom properties in `:root` for use in scoped `<style>` blocks

| Token | Value |
|---|---|
| `--ink` / `ink` | `#0B1730` |
| `--ink-soft` / `ink-soft` | `#2C3E5E` |
| `--ink-muted` / `ink-muted` | `#6B7A94` |
| `--bg` / `canvas` | `#E9EEF6` |
| `--bg-card` / `card` | `#DDE5F0` |
| `--line` / `line` | `#C5D0E1` |
| `--accent` / `accent` | `#1E47E6` |
| `--accent-soft` / `accent-soft` | `#A8BDF5` |

Fonts: **Fraunces** (serif headings), **Geist** (body), **JetBrains Mono** (labels/meta/code).

Components use scoped `<style>` CSS with `var(--token)` for most styling; Tailwind utilities for quick layout. The grain texture overlay and `fadeUp` / `pulse-dot` keyframes are defined in `global.css`.

### Adding Content

**New project:** create `src/content/projects/my-project.json` (see existing files for shape). Place image in `public/images/projects/`.

**New blog post:** create `src/content/blog/my-post.mdx` with frontmatter `title`, `date`, `heroImage`, and optional `description`. Place hero image in `public/images/blog/`. Import `Caption` at the top if you need inline image captions.
