# Project Guide (AGENTS)

## Overview
- Next.js app (App Router) for a MapLibre GL JS example dashboard.
- Primary UI lives in `src/app/page.tsx`; styles in `src/app/globals.css`.
- Example metadata in `src/data/examples.json`; optional snippets in `src/data/snippets/*`.

## Commands
- `npm run dev` / `pnpm dev` / `yarn dev` / `bun dev` — start dev server.
- `npm run build` — production build.
- `npm run start` — start production server.
- `npm run lint` — lint.
- `npm run sync:examples` — refresh example data from scripts.

## Conventions
- TypeScript + React 19; keep components in `src/app`.
- Tailwind CSS v4 utilities in JSX; avoid adding heavy new dependencies.
- Keep copy bilingual (EN/ZH) when adding UI strings.

## Notes
- Code preview modal is in `src/app/page.tsx`; snippets are loaded via `/api/snippets/[slug]`.
