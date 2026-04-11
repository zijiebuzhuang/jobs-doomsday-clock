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
  toISODate,
} from './news-pipeline.mjs'

const JOBS_MASTER_SITE_DATA_PATH = '/Users/zijiechen/Downloads/jobs-master/site/data.json'

const isCI = process.env.CI === 'true'
const MS_PER_DAY = 24 * 60 * 60 * 1000
const SHORT_TERM_WINDOW_DAYS = 7
const PRESSURE_CARRY = 0.996
const ADVANCE_PRESSURE_FACTOR = 0.022
const DELAY_PRESSURE_FACTOR = 0.013
const DELAY_RELIEF_FACTOR = 0.009
const CATEGORY_ADVANCE_PRESSURE_FACTOR = 0.011
const CATEGORY_DELAY_PRESSURE_FACTOR = 0.007
const CATEGORY_DELAY_RELIEF_FACTOR = 0.0045
const MAX_NEWS_ADJUSTMENT = 1.1
const MAX_CATEGORY_ADJUSTMENT = 0.35
const DATA_OUTPUT_PATH = 'public/data.json'

let cachedBaseData

function baseMinutesPerReplacementRatePoint(baseData) {
  return baseData.baseMinutesToMidnight / (50 - baseData.replacementRate)
}

function loadBaseData() {
  if (cachedBaseData) return cachedBaseData

  if (isCI) {
    if (!existsSync(DATA_OUTPUT_PATH)) {
      throw new Error(`Missing ${DATA_OUTPUT_PATH} in CI mode`)
    }
    cachedBaseData = JSON.parse(readFileSync(DATA_OUTPUT_PATH, 'utf-8'))
    return cachedBaseData
  }

  const sourceData = JSON.parse(readFileSync(JOBS_MASTER_SITE_DATA_PATH, 'utf-8'))
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function round3(value) {
  return Math.round(value * 1000) / 1000
}

function impactScore(item) {
  return item.impactScore || 1
}

function shortTermDecay(item, asOfDate) {
  const daysSince = (startOfShanghaiDay(asOfDate) - startOfShanghaiDay(item.date)) / MS_PER_DAY
  if (daysSince < 0 || daysSince >= SHORT_TERM_WINDOW_DAYS) return 0
  return Math.max(0, 1 - daysSince / SHORT_TERM_WINDOW_DAYS)
}

function buildDailyBuckets(newsFeed, asOfDate) {
  const days = []
  const buckets = new Map()

  for (let offset = HISTORY_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const date = new Date(asOfDate)
    date.setUTCDate(date.getUTCDate() - offset)
    const isoDate = toISODate(date)
    days.push(isoDate)
    buckets.set(isoDate, [])
  }

  for (const item of newsFeed) {
    const isoDate = toISODate(item.date)
    if (buckets.has(isoDate)) {
      buckets.get(isoDate).push(item)
    }
  }

  return { days, buckets }
}

function buildMacroPressureSeries(newsFeed, asOfDate) {
  const { days, buckets } = buildDailyBuckets(newsFeed, asOfDate)
  const pressureByDay = new Map()
  let pressure = 0

  for (const day of days) {
    const items = buckets.get(day) || []
    let advanceImpulse = 0
    let delayImpulse = 0

    for (const item of items) {
      const score = impactScore(item)
      if (item.effect === 'advance') advanceImpulse += score * ADVANCE_PRESSURE_FACTOR
      if (item.effect === 'delay') delayImpulse += score * DELAY_PRESSURE_FACTOR
    }

    pressure = Math.max(0, pressure * PRESSURE_CARRY + advanceImpulse - delayImpulse)
    pressureByDay.set(day, pressure)
  }

  return pressureByDay
}

function computeNewsAdjustment(newsFeed, asOfDate, pressureByDay = buildMacroPressureSeries(newsFeed, asOfDate)) {
  const pressure = pressureByDay.get(toISODate(asOfDate)) ?? 0
  let shortTermRelief = 0

  for (const item of newsFeed) {
    if (item.effect !== 'delay') continue
    const decay = shortTermDecay(item, asOfDate)
    if (!decay) continue
    shortTermRelief += impactScore(item) * DELAY_RELIEF_FACTOR * decay
  }

  return round3(clamp(-pressure + shortTermRelief, -MAX_NEWS_ADJUSTMENT, MAX_NEWS_ADJUSTMENT))
}

function computeCategoryAdjustments(newsFeed, asOfDate) {
  const { days, buckets } = buildDailyBuckets(newsFeed, asOfDate)
  const pressureByCategory = Object.fromEntries(BLS_CATEGORIES.map(category => [category, 0]))
  const latestByCategory = Object.fromEntries(BLS_CATEGORIES.map(category => [category, 0]))

  for (const day of days) {
    const advanceImpulseByCategory = Object.fromEntries(BLS_CATEGORIES.map(category => [category, 0]))
    const delayImpulseByCategory = Object.fromEntries(BLS_CATEGORIES.map(category => [category, 0]))

    for (const item of buckets.get(day) || []) {
      const categories = item.categories || item.affectedCategories
      if (!Array.isArray(categories) || categories.length === 0) continue
      const affectedCategories = categories.includes('_all') ? BLS_CATEGORIES : categories
      const score = impactScore(item)

      for (const category of affectedCategories) {
        if (!(category in pressureByCategory)) continue
        if (item.effect === 'advance') advanceImpulseByCategory[category] += score * CATEGORY_ADVANCE_PRESSURE_FACTOR
        if (item.effect === 'delay') delayImpulseByCategory[category] += score * CATEGORY_DELAY_PRESSURE_FACTOR
      }
    }

    for (const category of BLS_CATEGORIES) {
      pressureByCategory[category] = Math.max(
        0,
        pressureByCategory[category] * PRESSURE_CARRY + advanceImpulseByCategory[category] - delayImpulseByCategory[category]
      )
      latestByCategory[category] = pressureByCategory[category]
    }
  }

  const categoryAdjustments = Object.fromEntries(BLS_CATEGORIES.map(category => [category, -latestByCategory[category]]))

  for (const item of newsFeed) {
    if (item.effect !== 'delay') continue
    const categories = item.categories || item.affectedCategories
    if (!Array.isArray(categories) || categories.length === 0) continue
    const decay = shortTermDecay(item, asOfDate)
    if (!decay) continue
    const affectedCategories = categories.includes('_all') ? BLS_CATEGORIES : categories
    const relief = impactScore(item) * CATEGORY_DELAY_RELIEF_FACTOR * decay

    for (const category of affectedCategories) {
      if (!(category in categoryAdjustments)) continue
      categoryAdjustments[category] += relief
    }
  }

  for (const category of BLS_CATEGORIES) {
    categoryAdjustments[category] = round3(clamp(categoryAdjustments[category], -MAX_CATEGORY_ADJUSTMENT, MAX_CATEGORY_ADJUSTMENT))
  }

  return categoryAdjustments
}

export function buildClockData({ asOfDate = new Date(), feedMode = 'recent', newsFeedLimit = 20, newsFeed } = {}) {
  const baseData = loadBaseData()
  const feedWindow = filterFeedWindow(newsFeed ?? loadFeedItems(), asOfDate)
  const pressureByDay = buildMacroPressureSeries(feedWindow, asOfDate)
  const newsAdjustment = computeNewsAdjustment(feedWindow, asOfDate, pressureByDay)
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
    exactMinutesToMidnight: Math.round(exactMinutesToMidnight * 1000) / 1000,
    baseMinutesToMidnight,
    newsAdjustment,
    categoryAdjustments,
    replacementRate: baseData.replacementRate,
    macroReplacementRate: Math.round((50 - (exactMinutesToMidnight / baseMinutesPerReplacementRatePoint(baseData))) * 1000) / 1000,
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
