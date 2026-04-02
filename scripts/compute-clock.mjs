import { readFileSync, writeFileSync, existsSync } from 'fs'

const isCI = process.env.CI === 'true'

// --- Load base data ---
let baseData
if (isCI) {
  // In CI: read existing data.json as base (Karpathy data already baked in)
  baseData = JSON.parse(readFileSync('public/data.json', 'utf-8'))
} else {
  // Local: compute from source data
  const sourceData = JSON.parse(readFileSync('/Users/zijiechen/Downloads/jobs-master/site/data.json', 'utf-8'))

  const valid = sourceData.filter(d => d.jobs && d.exposure !== null && d.exposure !== undefined)
  const totalJobs = valid.reduce((sum, d) => sum + d.jobs, 0)
  const weightedExposure = valid.reduce((sum, d) => sum + d.jobs * d.exposure, 0)
  const avgExposure = weightedExposure / totalJobs
  const replacementRate = avgExposure * 10
  const baseMinutesToMidnight = Math.round((50 - replacementRate) * 14.4)

  const occupations = [...valid]
    .sort((a, b) => b.exposure - a.exposure || b.jobs - a.jobs)
    .map(d => ({
      title: d.title,
      exposure: d.exposure,
      jobs: d.jobs,
      url: d.url,
      category: d.category,
      outlook: d.outlook,
      outlookDesc: d.outlook_desc
    }))

  baseData = {
    replacementRate: Math.round(replacementRate * 10) / 10,
    baseMinutesToMidnight,
    totalJobs,
    occupationCount: valid.length,
    occupations,
  }
}

const replacementRate = baseData.replacementRate

// Map replacement rate to minutes-to-midnight.
// 14.4 = 720 / 50: maps 0–50% range evenly onto a 12-hour clock face.
// At current ~49.1% rate → ~13 min to midnight → 23:47.
const baseMinutesToMidnight = baseData.baseMinutesToMidnight ?? Math.round((50 - replacementRate) * 14.4)

// --- News-based clock adjustment ---
// Each day's news can shift the clock by a small amount.
// With impactScore 1-5, factor 0.01, decay over 30 days, and
// a ±0.5 min cap, the clock oscillates gently around its base.
// 13 min base ÷ 0.5 cap = 26 full news cycles (~2+ years) to
// theoretically reach midnight under sustained max-advance pressure.
let newsAdjustment = 0
let newsFeed = []

const newsFeedPath = 'data/news-feed.json'
if (existsSync(newsFeedPath)) {
  newsFeed = JSON.parse(readFileSync(newsFeedPath, 'utf-8'))

  const now = new Date()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const recentNews = newsFeed.filter(item => new Date(item.date) >= thirtyDaysAgo)

  for (const item of recentNews) {
    const daysSince = (now - new Date(item.date)) / (1000 * 60 * 60 * 24)
    const decay = Math.max(0, 1 - daysSince / 30)
    const impact = (item.impactScore || 1) * 0.01 * decay

    if (item.effect === 'advance') {
      newsAdjustment -= impact
    } else if (item.effect === 'delay') {
      newsAdjustment += impact
    }
  }

  newsAdjustment = Math.max(-0.5, Math.min(0.5, newsAdjustment))
  // Keep 3 decimal places so seconds are meaningful
  newsAdjustment = Math.round(newsAdjustment * 1000) / 1000
}

// --- Compute final clock ---
const exactMinutesToMidnight = baseMinutesToMidnight + newsAdjustment
const minutesToMidnight = Math.round(exactMinutesToMidnight)
const wallClockTotalSeconds = Math.round((1440 - exactMinutesToMidnight) * 60)
const hours = Math.floor((wallClockTotalSeconds / 3600) % 24)
const minutes = Math.floor((wallClockTotalSeconds % 3600) / 60)
const seconds = wallClockTotalSeconds % 60
const displayTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

// --- Output ---
const output = {
  displayTime,
  minutesToMidnight,
  baseMinutesToMidnight,
  newsAdjustment,
  replacementRate,
  totalJobs: baseData.totalJobs,
  occupationCount: baseData.occupationCount,
  occupations: baseData.occupations,
  newsFeed: newsFeed.slice(0, 20),
  generatedAt: new Date().toISOString()
}

writeFileSync('public/data.json', JSON.stringify(output, null, 2))
console.log(
  `Generated data.json: ${displayTime} (base: ${baseMinutesToMidnight}min, adj: ${newsAdjustment > 0 ? '+' : ''}${newsAdjustment}min → ${minutesToMidnight}min to midnight)`
)
console.log(
  `  ${replacementRate.toFixed(1)}% replacement rate, ${baseData.occupations.length} occupations, ${newsFeed.length} feed items`
)
