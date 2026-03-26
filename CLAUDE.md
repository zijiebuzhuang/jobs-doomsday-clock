# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a small Vite + React + TypeScript site that renders a single "AI Jobs Doomsday Clock" view from precomputed JSON data. It is built for GitHub Pages under `/jobs-doomsday-clock/`, not for a root-path deployment.

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
- `src/App.tsx` is the top-level container. It fetches the generated dataset from `/jobs-doomsday-clock/data.json`, keeps it in local state, and renders the two main UI sections.
- `src/components/ClockPanel.tsx` is a pure presentation component that turns `displayTime` into SVG hand rotations and renders the headline stats.
- `src/components/OccupationList.tsx` renders the ranked occupation list from the precomputed dataset.
- `src/types.ts` defines the shape of the generated JSON contract shared by the compute script and the UI.

### Data pipeline

- The UI does not compute exposure metrics in-browser.
- `scripts/compute-clock.mjs` reads the upstream Karpathy jobs dataset from a hardcoded local filesystem path: `/Users/zijiechen/Downloads/jobs-master/site/data.json`.
- That script filters valid occupations, computes weighted average exposure across all jobs, converts it into a replacement rate and 12-hour clock reading, selects the top 15 exposures, and writes the final payload to `public/data.json`.
- `public/data.json` is therefore a generated artifact that the frontend consumes directly.

### Deployment assumptions

- `vite.config.ts` sets `base: '/jobs-doomsday-clock/'` for GitHub Pages.
- `src/App.tsx` also hardcodes the same base when fetching `data.json`.
- When changing the repo name, site path, or hosting target, update both the Vite base path and the fetch URL together.
- `.github/workflows/deploy.yml` deploys on pushes to `main` and always runs `npm install`, `npm run compute`, and `npm run build` before publishing `dist/`.

## Styling

- `src/styles/tokens.css` defines the small set of global design tokens: dark background, serif display typography, sans-serif UI typography, and shared color variables.
- `src/styles/app.css` contains the full page layout and component styling; there is no CSS-in-JS or component-scoped styling layer.

## Important implementation details

- The displayed time comes from the generated data payload, not live recalculation in React.
- The clock math in `ClockPanel.tsx` assumes `displayTime` is already normalized to a 12-hour, 720-minute cycle.
- The compute step depends on an external local checkout of the upstream dataset. Any machine that does not have that file at the hardcoded path will fail on `npm run compute` until the script is adjusted.
- The repository currently has no abstraction layers, routing, state management library, or backend; most work will be either in the compute script or in the two display components.
