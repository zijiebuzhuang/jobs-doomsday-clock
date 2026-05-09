import { readFileSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import {
  classifyDailyEdition,
  fetchOfficialIndexPages,
  fetchRSSFeeds,
  isRelevant,
} from './fetch-news.mjs'
import { buildHistory } from './save-history.mjs'
import {
  loadFeedItems,
  loadHistorySet,
  makeId,
  mergeFeedItems,
  resolveAsOfDate,
  saveHistorySet,
  startOfShanghaiDay,
  toISODate,
} from './news-pipeline.mjs'

const FEED_PATH = 'data/news-feed.json'
const HISTORY_PATH = 'public/clock-history.json'
const DATA_PATH = 'public/data.json'
const MS_PER_DAY = 24 * 60 * 60 * 1000

function targetDates() {
  const raw = process.argv.find(arg => arg.startsWith('--dates='))?.split('=')[1] || process.env.BACKFILL_DATES || ''
  return raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

function itemTimestamp(item) {
  const value = new Date(item.pubDate || item.isoDate || 0).getTime()
  return Number.isFinite(value) ? value : 0
}

function daysFromTarget(item, targetDate) {
  return (startOfShanghaiDay(targetDate) - startOfShanghaiDay(item.pubDate || item.isoDate || 0)) / MS_PER_DAY
}

function candidatesForDate(rawItems, targetDate, history) {
  return rawItems
    .filter(item => isRelevant(item.title, item.contentSnippet))
    .filter(item => !history.has(makeId(item.title)))
    .filter(item => {
      const age = daysFromTarget(item, targetDate)
      return age >= 0 && age <= 7
    })
    .sort((lhs, rhs) => itemTimestamp(rhs) - itemTimestamp(lhs))
}

function replaceCurrentDataIfLatest(history) {
  const latest = history[0]
  if (!latest) return

  const current = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  writeFileSync(DATA_PATH, JSON.stringify({
    ...current,
    generatedAt: `${latest.date}T12:00:00.000Z`,
    minutesToMidnight: latest.minutesToMidnight,
    exactMinutesToMidnight: latest.exactMinutesToMidnight,
    macroReplacementRate: latest.macroReplacementRate,
    newsAdjustment: latest.newsAdjustment,
    categoryAdjustments: latest.categoryAdjustments,
    newsFeed: latest.newsFeed || [],
    signalSummaries: latest.signalSummaries,
  }, null, 2))
}

async function main() {
  const dates = targetDates()
  if (dates.length === 0) {
    console.error('Usage: node scripts/backfill-daily-editions.mjs --dates=2026-05-06,2026-05-07')
    process.exit(1)
  }

  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN
  if (!apiKey) {
    console.error('Error: DASHSCOPE_API_KEY environment variable is required')
    process.exit(1)
  }

  console.log(`=== Backfill daily signal editions: ${dates.join(', ')} ===`)
  const rawItems = [
    ...await fetchRSSFeeds(),
    ...await fetchOfficialIndexPages(),
  ]
  console.log(`Fetched ${rawItems.length} raw items`)

  let feed = loadFeedItems(FEED_PATH)
  const history = loadHistorySet()

  for (const dateKey of dates) {
    const asOfDate = resolveAsOfDate(dateKey)
    const fresh = candidatesForDate(rawItems, asOfDate, history)
    console.log(`\n${dateKey}: ${fresh.length} candidates`)
    fresh.slice(0, 8).forEach(item => {
      console.log(`  - [${item.pubDate || item.isoDate || 'no-date'}] ${item.source}: ${item.title.slice(0, 90)}`)
    })

    const classified = await classifyDailyEdition(apiKey, fresh, asOfDate)
    console.log(`${dateKey}: classified ${classified.length} signals`)
    if (classified.length === 0) continue

    feed = mergeFeedItems(feed, classified, new Date(`${dates[dates.length - 1]}T12:00:00Z`))
    for (const item of classified) history.add(item.id)
  }

  writeFileSync(FEED_PATH, JSON.stringify(feed, null, 2))
  saveHistorySet(history)

  const endDate = resolveAsOfDate(dates[dates.length - 1])
  const rebuiltHistory = await buildHistory({ rebuild: true, endDate, newsFeed: feed })
  writeFileSync(HISTORY_PATH, JSON.stringify(rebuiltHistory, null, 2))
  replaceCurrentDataIfLatest(rebuiltHistory)

  console.log(`\nSaved ${feed.length} feed items to ${FEED_PATH}`)
  console.log(`Rebuilt ${rebuiltHistory.length} history snapshots through ${toISODate(endDate)}`)
  console.log('Latest history counts:')
  rebuiltHistory.slice(0, 8).forEach(point => {
    console.log(`  ${point.date}: ${(point.newsFeed || []).length}`)
  })
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
