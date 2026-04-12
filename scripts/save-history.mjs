import { readFileSync, writeFileSync, existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { buildClockData, buildDeterministicSignalSummaries, generateSignalSummaries } from './compute-clock.mjs'
import { HISTORY_WINDOW_DAYS, loadFeedItems, resolveAsOfDate, toISODate } from './news-pipeline.mjs'

const HISTORY_PATH = 'public/clock-history.json'
const MODEL_HISTORY_START_DATE = '2026-03-26'

async function snapshotForDate(asOfDate, newsFeed) {
  const data = buildClockData({ asOfDate, feedMode: 'daily', newsFeed })
  const dateKey = toISODate(asOfDate)
  const shouldUseModel = dateKey >= MODEL_HISTORY_START_DATE && data.newsFeed.length > 0
  let signalSummaries

  if (shouldUseModel) {
    try {
      signalSummaries = await generateSignalSummaries({
        feedWindow: data.newsFeed,
        generatedAt: data.generatedAt,
        macroReplacementRate: data.macroReplacementRate,
        newsAdjustment: data.newsAdjustment,
      })
    } catch (err) {
      console.warn(`Signal summary generation failed for ${dateKey}: ${err.message}`)
    }
  }

  signalSummaries ??= buildDeterministicSignalSummaries({
    feedWindow: data.newsFeed,
    generatedAt: data.generatedAt,
    macroReplacementRate: data.macroReplacementRate,
    newsAdjustment: data.newsAdjustment,
  })

  return {
    date: dateKey,
    minutesToMidnight: data.minutesToMidnight,
    exactMinutesToMidnight: data.exactMinutesToMidnight,
    macroReplacementRate: data.macroReplacementRate,
    newsAdjustment: data.newsAdjustment,
    categoryAdjustments: data.categoryAdjustments || {},
    newsFeed: data.newsFeed,
    signalSummaries,
  }
}

function buildDateRange(endDate) {
  return Array.from({ length: HISTORY_WINDOW_DAYS }, (_, index) => {
    const date = new Date(endDate)
    date.setUTCDate(date.getUTCDate() - index)
    return date
  })
}

export async function buildHistory({ rebuild = false, endDate = new Date(), newsFeed = loadFeedItems() } = {}) {
  if (rebuild) {
    const snapshots = await Promise.all(buildDateRange(endDate).map(date => snapshotForDate(date, newsFeed)))
    return snapshots.sort((a, b) => b.date.localeCompare(a.date))
  }

  const today = toISODate(endDate)
  const snapshot = await snapshotForDate(endDate, newsFeed)
  const history = existsSync(HISTORY_PATH)
    ? JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'))
    : []

  const existingIndex = history.findIndex(item => item.date === today)
  if (existingIndex >= 0) {
    history[existingIndex] = snapshot
  } else {
    history.push(snapshot)
  }

  return history
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, HISTORY_WINDOW_DAYS)
}

async function main() {
  const cliDate = process.argv.find(arg => arg.startsWith('--date='))?.split('=')[1]
  const rebuild = process.argv.includes('--rebuild') || process.env.REBUILD_HISTORY === 'true'
  const endDate = resolveAsOfDate(cliDate)
  const history = await buildHistory({ rebuild, endDate })

  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2))
  console.log(`${rebuild ? 'Rebuilt' : 'Saved'} history: ${history.length} entries saved to ${HISTORY_PATH}`)
  console.log(`  Latest: ${history[0].date} (${history[0].minutesToMidnight} min to midnight)`)
  console.log(`  Oldest: ${history[history.length - 1].date}`)
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
