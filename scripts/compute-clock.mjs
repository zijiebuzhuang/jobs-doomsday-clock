import { readFileSync, writeFileSync, existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { callLLM } from './fetch-news.mjs'
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
const SIGNAL_SUMMARY_MAX_ITEMS = 8
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

function summaryPayloadSchema() {
  return `{
  "dailyPulse": {
    "title": "string under 70 chars",
    "preview": "1 short sentence under 140 chars",
    "body": "2-4 sentences, clear and readable"
  }
}`
}

function summaryPrompt({ items, generatedAt, macroReplacementRate, newsAdjustment }) {
  const topItems = items
    .slice(0, SIGNAL_SUMMARY_MAX_ITEMS)
    .map(item => ({
      title: item.title,
      source: item.source,
      date: item.date,
      effect: item.effect,
      impactScore: item.impactScore,
      summary: item.summary,
    }))

  return `You are writing a single daily summary for AI Jobs Clock, an English-language product that tracks how current news affects AI job replacement pressure.

Write one concise but thoughtful daily summary that synthesizes the latest signal mix into a readable product surface.

Rules:
- Return ONLY valid JSON.
- Follow this exact schema: ${summaryPayloadSchema()}
- Only produce dailyPulse. Do not include accelerators or delays.
- The writing should feel like a short analyst note, not marketing copy.
- Use plain English.
- Do not mention being an AI.
- Do not invent facts beyond the provided items.
- The preview should be a tight teaser.
- The body should be deeper than the preview and mention the overall balance of the feed.
- It is okay to reference one or two standout headlines by title.

Context:
- Updated at: ${generatedAt}
- Macro replacement rate: ${macroReplacementRate}
- News adjustment in minutes: ${newsAdjustment}
- Signal count: ${items.length}

Signals:
${JSON.stringify(topItems, null, 2)}`
}

function normalizeSignalSummaryPayload(payload) {
  if (!payload || typeof payload !== 'object') return undefined
  const dailyPulse = payload.dailyPulse
  if (!dailyPulse || typeof dailyPulse !== 'object') return undefined
  if (typeof dailyPulse.title !== 'string' || typeof dailyPulse.preview !== 'string' || typeof dailyPulse.body !== 'string') {
    return undefined
  }

  const title = dailyPulse.title.trim()
  const preview = dailyPulse.preview.trim()
  const body = dailyPulse.body.trim()

  if (!title || !preview || !body) return undefined

  return {
    dailyPulse: {
      title,
      preview,
      body,
    },
  }
}

export function buildDeterministicSignalSummaries({ feedWindow, generatedAt, macroReplacementRate, newsAdjustment }) {
  const topItems = [...feedWindow]
    .sort((lhs, rhs) => impactScore(rhs) - impactScore(lhs))
    .slice(0, 3)
  const advances = feedWindow.filter(item => item.effect === 'advance').length
  const delays = feedWindow.length - advances
  const strongestAdvance = feedWindow
    .filter(item => item.effect === 'advance')
    .sort((lhs, rhs) => impactScore(rhs) - impactScore(lhs))[0]
  const strongestDelay = feedWindow
    .filter(item => item.effect === 'delay')
    .sort((lhs, rhs) => impactScore(rhs) - impactScore(lhs))[0]

  if (feedWindow.length === 0) {
    return {
      dailyPulse: {
        title: 'Daily signal pulse',
        preview: 'A quiet day in the signal feed, with no major new AI jobs headlines moving the clock.',
        body: `No new qualifying signals were retained for ${generatedAt}, so the clock reads as broadly steady rather than newly accelerated or delayed. That does not mean replacement pressure disappeared; it means today added little fresh evidence beyond the recent trend. The most useful interpretation is stability, not a new directional break.${typeof macroReplacementRate === 'number' ? ` The latest macro replacement estimate remains ${macroReplacementRate.toFixed(1)}%.` : ''}`,
      },
    }
  }

  const preview = topItems[0]
    ? `A quick read on the latest pulse, led by ${topItems[0].title}.`
    : 'A quick read on the latest signal pulse.'

  let body
  if (strongestAdvance && strongestDelay) {
    body = `This update is split between ${advances} advances and ${delays} delays, so the overall tone is mixed rather than one-way. The strongest push forward comes from "${strongestAdvance.title}" (${strongestAdvance.source}), while the clearest drag comes from "${strongestDelay.title}" (${strongestDelay.source}). Taken together, the feed looks more like a tug-of-war than a clean trend, with both adoption momentum and institutional resistance active at once.`
  } else if (strongestAdvance) {
    body = `This update leans forward, with ${advances} advances against ${delays} delays, so attention is still moving toward adoption and displacement pressure. The clearest push comes from "${strongestAdvance.title}" (${strongestAdvance.source}), which sets the tone for the rest of the feed. Even without one overwhelming headline, the mix still points to momentum building in that direction.`
  } else if (strongestDelay) {
    body = `This update leans defensive, with ${delays} delays against ${advances} advances, so the latest coverage is giving more weight to friction, safeguards, or slower rollout dynamics. The clearest drag comes from "${strongestDelay.title}" (${strongestDelay.source}), which acts as the main anchor on the feed. Rather than accelerating straight ahead, the day’s signal mix implies more resistance and more reasons for the clock to pause.`
  } else {
    body = `This update includes ${feedWindow.length} signals but no single standout force clearly pulling the feed in one direction. The overall impression is scattered movement rather than a dominant narrative, so the value is in the mix itself more than any one headline. That leaves the clock reading as steady but watchful.`
  }

  if (typeof newsAdjustment === 'number' && Math.abs(newsAdjustment) >= 0.05) {
    body += ` The latest news adjustment stands at ${newsAdjustment > 0 ? '+' : ''}${newsAdjustment.toFixed(3)} minutes.`
  }

  if (typeof macroReplacementRate === 'number') {
    body += ` Updated ${generatedAt}, with the macro replacement estimate at ${macroReplacementRate.toFixed(1)}%.`
  } else {
    body += ` Updated ${generatedAt}.`
  }

  return {
    dailyPulse: {
      title: 'Daily signal pulse',
      preview,
      body,
    },
  }
}

export async function generateSignalSummaries({ feedWindow, generatedAt, macroReplacementRate, newsAdjustment }) {
  if (feedWindow.length === 0) return undefined

  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN
  if (!apiKey) return undefined

  const prompt = summaryPrompt({
    items: feedWindow,
    generatedAt,
    macroReplacementRate,
    newsAdjustment,
  })

  const content = await callLLM(apiKey, prompt)
  return normalizeSignalSummaryPayload(JSON.parse(content.trim()))
}

export function buildClockData({
  asOfDate = new Date(),
  feedMode = 'recent',
  newsFeedLimit = 20,
  newsFeed,
  signalSummaries,
} = {}) {
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
  const macroReplacementRate = Math.round((50 - (exactMinutesToMidnight / baseMinutesPerReplacementRatePoint(baseData))) * 1000) / 1000

  return {
    displayTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    minutesToMidnight,
    exactMinutesToMidnight: Math.round(exactMinutesToMidnight * 1000) / 1000,
    baseMinutesToMidnight,
    newsAdjustment,
    categoryAdjustments,
    replacementRate: baseData.replacementRate,
    macroReplacementRate,
    totalJobs: baseData.totalJobs,
    occupationCount: baseData.occupationCount,
    occupations: baseData.occupations,
    newsFeed: feedMode === 'daily' ? feedItemsForDate(feedWindow, asOfDate, true, true) : feedWindow.slice(0, newsFeedLimit),
    generatedAt: asOfDate.toISOString(),
    ...(signalSummaries ? { signalSummaries } : {}),
  }
}

async function main() {
  const cliDate = process.argv.find(arg => arg.startsWith('--date='))?.split('=')[1]
  const asOfDate = resolveAsOfDate(cliDate)
  const preliminaryOutput = buildClockData({ asOfDate })
  let signalSummaries

  try {
    signalSummaries = await generateSignalSummaries({
      feedWindow: preliminaryOutput.newsFeed,
      generatedAt: preliminaryOutput.generatedAt,
      macroReplacementRate: preliminaryOutput.macroReplacementRate,
      newsAdjustment: preliminaryOutput.newsAdjustment,
    })
  } catch (err) {
    console.warn(`Signal summary generation failed: ${err.message}`)
  }

  const output = buildClockData({
    asOfDate,
    signalSummaries: signalSummaries ?? buildDeterministicSignalSummaries({
      feedWindow: preliminaryOutput.newsFeed,
      generatedAt: preliminaryOutput.generatedAt,
      macroReplacementRate: preliminaryOutput.macroReplacementRate,
      newsAdjustment: preliminaryOutput.newsAdjustment,
    }),
  })

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
