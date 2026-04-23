# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a single-file static HTML portfolio website. All HTML, CSS, and JavaScript live in `portfolio_main_page_html.html`. There is no build step, no package manager, and no external dependencies beyond Google Fonts.

## Running Locally

```bash
# Open directly in browser
open portfolio_main_page_html.html

# Or serve via HTTP
python3 -m http.server 8000
# Then visit http://localhost:8000/portfolio_main_page_html.html
```

## Architecture

**Single-file structure** (`portfolio_main_page_html.html`, ~762 lines):
- `<style>` (~559 lines) — all CSS, including CSS custom properties for the design system
- `<body>` — `<header>`, `<main>` (hero + projects sections), `<footer>`
- `<script>` (~26 lines) — horizontal scroll carousel controls and mousewheel-to-horizontal-scroll conversion

**Design system via CSS custom properties:**
- Color tokens: `--bg`, `--bg-card`, `--ink`, `--ink-soft`, `--ink-muted`, `--line`, `--accent`
- Fluid typography via `clamp()`
- Mobile breakpoint at `720px`

**Key interactive features:**
- Projects section: horizontal scrollable card carousel with prev/next buttons
- Mousewheel events converted to horizontal scroll on the carousel
- Fade-up animations on load (CSS keyframes)
- Pulsing status indicator

## Deployment

Copy `portfolio_main_page_html.html` to any static host (Netlify, GitHub Pages, S3, etc.). No build required.
