# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a small Vite + React + TypeScript site that renders a single "AI Jobs Doomsday Clock" view from precomputed JSON data. It is built for GitHub Pages under `/jobs-doomsday-clock/`, not for a root-path deployment. It combines Andrej Karpathy's jobs dataset exposures with the reference doomsday-clock's news/evidence cards.

## Commands

- Install dependencies: `npm install`
- Start local dev server: `npm run dev`
- Recompute the dataset used by the UI: `npm run compute`
- Production build: `npm run build`
- Preview the production build locally: `npm run preview`

## Testing and linting

- There is currently no test runner configured in `package.json`.
- There is currently no lint script configured in `package.json`.
- There is no single-test command because no test framework is installed.

## Architecture

### Runtime flow

- `src/main.tsx` bootstraps the React app and loads the global styles.
- `src/App.tsx` is the top-level container. It fetches the generated dataset from `/jobs-doomsday-clock/data.json`, keeps it in local state, and renders three main UI sections.
- `src/components/ClockPanel.tsx` is a pure presentation component that turns `displayTime` into SVG hand rotations and renders the headline stats.
- `src/components/OccupationList.tsx` renders the ranked occupation card grid.
- `src/components/ReferenceNewsList.tsx` renders the reference project's news/evidence feed.
- `src/types.ts` defines the shape of the generated JSON contract shared by the compute script and the UI.

### Data pipeline

- The UI does not compute exposure metrics in-browser.
- `scripts/compute-clock.mjs` reads data from two local filesystem paths:
  1. The upstream Karpathy jobs dataset (`/Users/zijiechen/Downloads/jobs-master/site/data.json`)
  2. The doomsday-clock reference evidence (`/Users/zijiechen/Library/Mobile Documents/com~apple~CloudDocs/AI/doomsday-clock/data/generated/evidence.json`)
- That script filters valid occupations, computes weighted average exposure across all jobs, converts it into a replacement rate and 24-hour clock reading, and writes the combined payload (occupations + news) to `public/data.json`.
- `public/data.json` is therefore a generated artifact that the frontend consumes directly.

### Deployment assumptions

- `vite.config.ts` sets `base: '/jobs-doomsday-clock/'` for GitHub Pages.
- `src/App.tsx` also hardcodes the same base when fetching `data.json`.
- When changing the repo name, site path, or hosting target, update both the Vite base path and the fetch URL together.
- `.github/workflows/deploy.yml` deploys on pushes to `main`. It ONLY runs `npm install` and `npm run build` (it does NOT run `npm run compute` because the GitHub runner cannot access the local absolute file paths).

## Styling

- `src/styles/tokens.css` defines the small set of global design tokens: dark background, serif display typography, sans-serif UI typography, and shared color variables.
- `src/styles/app.css` contains the full page layout and component styling. It uses a responsive 2-column grid for both the occupation cards and the news reference cards.

## Important implementation details

- The displayed time comes from the generated data payload (`displayTime` in 24h format), not live recalculation in React.
- The clock math in `ClockPanel.tsx` uses modulo math to ensure the analog hands position identically whether the digital display reads e.g., "11:47" or "23:47".
- The compute step (`npm run compute`) MUST be run locally before committing/pushing if data changes. The CI pipeline will not rebuild `data.json`.