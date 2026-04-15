# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Vite + React + TypeScript static site that renders an "AI Jobs Doomsday Clock." It is deployed to Vercel at the root path (`/`) via the `https://jobdoomsday.tech/` domain. It's a completely independent, English-first, open-source project featuring a minimalist, black-and-white, humanistic/retro visual style.

The site combines:
1. Andrej Karpathy's jobs dataset exposures (calculating an aggregate replacement rate).
2. The reference Doomsday Clock's news/evidence cards (milestone events).

The architecture is built around precomputed data. The frontend does not calculate exposure metrics; it simply renders what is found in `public/data.json`.

## Common Commands

- **Start local dev server**: `npm run dev`
- **Recompute current clock data**: `npm run compute`
- **Refresh latest news + regenerate daily summary**: `npm run refresh-data`
- **Fetch and classify latest news**: `npm run fetch-news`
- **Save or rebuild 90-day history**: `npm run save-history` (`node scripts/save-history.mjs --rebuild --date=YYYY-MM-DD` for a full rebuild)
- **Backfill 90-day historical news**: `npm run backfill-news`
- **Production build**: `npm run build`
- **Preview production build**: `npm run preview`

**Important Note on Data Updates:**
The `npm run compute` script reads from two local absolute paths:
1. Karpathy jobs dataset: `/Users/zijiechen/Downloads/jobs-master/site/data.json`
2. Doomsday clock evidence: `/Users/zijiechen/Library/Mobile Documents/com~apple~CloudDocs/AI/doomsday-clock/data/generated/evidence.json`

Because of these local path dependencies, `npm run compute` MUST be run locally before committing if data changes. Vercel CI will not rebuild `data.json`; it only runs `npm run build`.

## Architecture & Data Flow

### 1. Data Pipeline (`scripts/*.mjs`)
- `scripts/news-pipeline.mjs` is the shared layer for feed normalization, 90-day windowing, history IO, category metadata, and proxy-aware JSON fetches.
- `scripts/fetch-news.mjs` pulls the latest RSS items, filters AI/jobs relevance, classifies them with DashScope/Qwen, and merges them into `data/news-feed.json`. It accepts either `DASHSCOPE_API_KEY` or `ALIYUN` for the model key.
- `scripts/backfill-news.mjs` queries News API for a 90-day range, runs the same classifier path, merges historical items into `data/news-feed.json`, then regenerates `public/data.json` and `public/clock-history.json`.
- `scripts/compute-clock.mjs` reads the raw datasets plus the retained news feed, calculates the `replacementRate` = (jobs-weighted average exposure) * 10, maps it to a 24-hour clock where 50% replacement = 00:00, applies decayed news/category adjustments, generates the single daily signal summary when `DASHSCOPE_API_KEY` or `ALIYUN` is available, and writes `public/data.json`.
- `scripts/save-history.mjs` writes daily snapshots to `public/clock-history.json`; each snapshot includes per-day `newsFeed` (matched by `fetchedAt`, not original publication `date`) and category adjustments. Quiet days are valid and should keep `newsFeed: []`.
- `.github/workflows/daily-news.yml` is the publish gate for the product's fixed daily edition. The workflow is triggered by cron-job.org at **19:00 Shanghai time (07:00 AM US Eastern)** to align with US morning news consumption. The first successful run for a given date defines that day's snapshot; later reruns are recovery-only and should not pull newer headlines into the same day.

### 2. Frontend Application (`src/`)
- `src/App.tsx`: Fetches `/data.json` on mount, holds it in state, and renders the page in three vertical sections.
- `src/components/ClockPanel.tsx`: A pure presentation component. It takes the `displayTime` (e.g., "23:47") and uses modulo math to position the SVG clock hands. Also handles the "About this page" modal.
- `src/components/OccupationList.tsx`: Renders the jobs dataset as a responsive 2-column card grid.
- `src/components/ReferenceNewsList.tsx`: Renders the milestone/news events below the occupations.
- `src/types.ts`: The contract for the JSON payload (types like `ClockData`, `OccupationItem`, `ReferenceNewsItem`).

### 3. Styling
- Uses plain CSS, completely custom.
- `src/styles/tokens.css`: Core design tokens (dark theme, typography, color variables).
- `src/styles/app.css`: Layouts and component styles. Focuses on a responsive CSS grid, 5% white background treatments for cards, and subtle hover states for links.

## Development Guidelines

- **UI Updates:** If modifying the UI, wait for the user to confirm the visual result locally in their browser before pushing changes.
- **Styling:** Adhere to the minimalist, dark-mode, black-and-white visual system. Preserve the typography choices defined in `tokens.css`.
- **Precomputed Data:** Do not add complex data processing or filtering to the React components. If the data structure needs to change, modify the scripts under `scripts/` and update `src/types.ts`.
- **Proxy-dependent network work:** Historical backfill and classifier calls may require local proxy env vars (`HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`). The scripts now support this path directly.
- **Category metadata matters:** `data/news-feed.json` should retain `categories` on each classified item. Rebuilds depend on that metadata for category-level history; do not strip it.
- **Daily edition rule:** Treat the first successful `Daily News Fetch` publish for a Shanghai day as the canonical edition for that day. Later manual reruns are for recovery only and must not introduce later headlines into the already-published day.
- **Push trigger rule:** `Daily News Fetch` only triggers the relay when `workflow_dispatch.inputs.send_push` is true. cron-job.org's official morning call should send `{"ref":"main","inputs":{"send_push":"true"}}`; ordinary manual runs in GitHub should leave the input false.
- **Analog Clock:** The math in `ClockPanel.tsx` is carefully tuned to handle 24-hour `displayTime` strings and map them correctly to the 12-hour SVG face. Avoid altering the `angleForMinutes` logic unless specifically requested.
- **Reporting:** Keep any generated local reports or analysis markdown files out of the repository unless the user explicitly asks to commit them.
