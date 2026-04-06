import { readFileSync, writeFileSync, existsSync } from 'fs'
import { pathToFileURL } from 'url'
import {
  BLS_CATEGORIES,
  HISTORY_WINDOW_DAYS,
  feedItemsForDate,
  filterFeedWindow,
  loadFeedItems,
  resolveAsOfDate,
  startOfShanghaiDay,
} from './news-pipeline.mjs'

const isCI = process.env.CI === 'true'
const MS_PER_DAY = 24 * 60 * 60 * 1000
const ADVANCE_IMPACT_FACTOR = 0.01
const DELAY_IMPACT_FACTOR = 0.0095
const DATA_OUTPUT_PATH = 'public/data.json'

let cachedBaseData

function loadBaseData() {
  if (cachedBaseData) return cachedBaseData

  if (isCI) {
    if (!existsSync(DATA_OUTPUT_PATH)) {
      throw new Error(`Missing ${DATA_OUTPUT_PATH} in CI mode`)
    }
    cachedBaseData = JSON.parse(readFileSync(DATA_OUTPUT_PATH, 'utf-8'))
    return cachedBaseData
  }

  const sourceData = JSON.parse(readFileSync('/Users/zijiechen/Downloads/jobs-master/site/data.json', 'utf-8'))
  const valid = sourceData.filter(item => item.jobs && item.exposure !== null && item.exposure !== undefined)
  const totalJobs = valid.reduce((sum, item) => sum + item.jobs, 0)
  const weightedExposure = valid.reduce((sum, item) => sum + item.jobs * item.exposure, 0)
  const replacementRate = weightedExposure / totalJobs * 10
  const baseMinutesToMidnight = Math.round((50 - replacementRate) * 14.4)

  cachedBaseData = {
    replacementRate: Math.round(replacementRate * 10) / 10,
    baseMinutesToMidnight,
    totalJobs,
    occupationCount: valid.length,
    occupations: [...valid]
      .sort((a, b) => b.exposure - a.exposure || b.jobs - a.jobs)
      .map(item => ({
        title: item.title,
        exposure: item.exposure,
        jobs: item.jobs,
        url: item.url,
        category: item.category,
        outlook: item.outlook,
        outlookDesc: item.outlook_desc,
      })),
  }

  return cachedBaseData
}

function decayedImpact(item, asOfDate) {
  const daysSince = (startOfShanghaiDay(asOfDate) - startOfShanghaiDay(item.date)) / MS_PER_DAY
  if (daysSince < 0 || daysSince >= HISTORY_WINDOW_DAYS) return 0
  const decay = Math.max(0, 1 - daysSince / HISTORY_WINDOW_DAYS)
  const factor = item.effect === 'delay' ? DELAY_IMPACT_FACTOR : ADVANCE_IMPACT_FACTOR
  return (item.impactScore || 1) * factor * decay
}

function computeNewsAdjustment(newsFeed, asOfDate) {
  let newsAdjustment = 0

  for (const item of newsFeed) {
    const impact = decayedImpact(item, asOfDate)
    if (!impact) continue
    if (item.effect === 'advance') newsAdjustment -= impact
    if (item.effect === 'delay') newsAdjustment += impact
  }

  return Math.round(Math.max(-0.5, Math.min(0.5, newsAdjustment)) * 1000) / 1000
}

function computeCategoryAdjustments(newsFeed, asOfDate) {
  const categoryAdjustments = Object.fromEntries(BLS_CATEGORIES.map(category => [category, 0]))

  for (const item of newsFeed) {
    const categories = item.categories || item.affectedCategories
    if (!Array.isArray(categories) || categories.length === 0) continue

    const impact = decayedImpact(item, asOfDate)
    if (!impact) continue

    const delta = item.effect === 'delay' ? impact : -impact
    const affectedCategories = categories.includes('_all') ? BLS_CATEGORIES : categories

    for (const category of affectedCategories) {
      if (!(category in categoryAdjustments)) continue
      categoryAdjustments[category] += delta
    }
  }

  for (const category of BLS_CATEGORIES) {
    categoryAdjustments[category] = Math.round(Math.max(-0.5, Math.min(0.5, categoryAdjustments[category])) * 1000) / 1000
  }

  return categoryAdjustments
}

export function buildClockData({ asOfDate = new Date(), feedMode = 'recent', newsFeedLimit = 20, newsFeed } = {}) {
  const baseData = loadBaseData()
  const feedWindow = filterFeedWindow(newsFeed ?? loadFeedItems(), asOfDate)
  const newsAdjustment = computeNewsAdjustment(feedWindow, asOfDate)
  const categoryAdjustments = computeCategoryAdjustments(feedWindow, asOfDate)
  const baseMinutesToMidnight = baseData.baseMinutesToMidnight ?? Math.round((50 - baseData.replacementRate) * 14.4)
  const exactMinutesToMidnight = baseMinutesToMidnight + newsAdjustment
  const minutesToMidnight = Math.round(exactMinutesToMidnight)
  const wallClockTotalSeconds = Math.round((1440 - exactMinutesToMidnight) * 60)
  const hours = Math.floor((wallClockTotalSeconds / 3600) % 24)
  const minutes = Math.floor((wallClockTotalSeconds % 3600) / 60)
  const seconds = wallClockTotalSeconds % 60

  return {
    displayTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    minutesToMidnight,
    baseMinutesToMidnight,
    newsAdjustment,
    categoryAdjustments,
    replacementRate: baseData.replacementRate,
    totalJobs: baseData.totalJobs,
    occupationCount: baseData.occupationCount,
    occupations: baseData.occupations,
    newsFeed: feedMode === 'daily' ? feedItemsForDate(feedWindow, asOfDate, true) : feedWindow.slice(0, newsFeedLimit),
    generatedAt: asOfDate.toISOString(),
  }
}

async function main() {
  const cliDate = process.argv.find(arg => arg.startsWith('--date='))?.split('=')[1]
  const asOfDate = resolveAsOfDate(cliDate)
  const output = buildClockData({ asOfDate })

  writeFileSync(DATA_OUTPUT_PATH, JSON.stringify(output, null, 2))
  console.log(
    `Generated data.json for ${asOfDate.toISOString().split('T')[0]}: ${output.displayTime} (base: ${output.baseMinutesToMidnight}min, adj: ${output.newsAdjustment > 0 ? '+' : ''}${output.newsAdjustment}min → ${output.minutesToMidnight}min to midnight)`
  )
  console.log(
    `  ${output.replacementRate.toFixed(1)}% replacement rate, ${output.occupationCount} occupations, ${output.newsFeed.length} recent feed items from the last ${HISTORY_WINDOW_DAYS} days`
  )
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
