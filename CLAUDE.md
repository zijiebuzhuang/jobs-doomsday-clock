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
- **Recompute data**: `npm run compute` (Calculates the replacement rate, formats the clock time, and bundles occupations + news into `public/data.json`)
- **Production build**: `npm run build`
- **Preview production build**: `npm run preview`

**Important Note on Data Updates:**
The `npm run compute` script reads from two local absolute paths:
1. Karpathy jobs dataset: `/Users/zijiechen/Downloads/jobs-master/site/data.json`
2. Doomsday clock evidence: `/Users/zijiechen/Library/Mobile Documents/com~apple~CloudDocs/AI/doomsday-clock/data/generated/evidence.json`

Because of these local path dependencies, `npm run compute` MUST be run locally before committing if data changes. Vercel CI will not rebuild `data.json`; it only runs `npm run build`.

## Architecture & Data Flow

### 1. Data Generation (`scripts/compute-clock.mjs`)
- Reads the raw datasets.
- Calculates the `replacementRate` = (jobs-weighted average exposure) * 10.
- Maps this to a 24-hour clock where 50% replacement = 00:00 (midnight). Every 1% change shifts the clock by 14.4 minutes.
- Combines the clock math, sorted occupation list, and formatted news feed.
- Writes everything to `public/data.json`.

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
- **Precomputed Data:** Do not add complex data processing or filtering to the React components. If the data structure needs to change, modify `scripts/compute-clock.mjs` and update `src/types.ts`.
- **Analog Clock:** The math in `ClockPanel.tsx` is carefully tuned to handle 24-hour `displayTime` strings and map them correctly to the 12-hour SVG face. Avoid altering the `angleForMinutes` logic unless specifically requested.
- **Reporting:** Keep any generated local reports or analysis markdown files out of the repository unless the user explicitly asks to commit them.
