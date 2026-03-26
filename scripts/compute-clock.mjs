import { readFileSync, writeFileSync } from 'fs'

const sourceData = JSON.parse(readFileSync('/Users/zijiechen/Downloads/jobs-master/site/data.json', 'utf-8'))
const referenceEvidence = JSON.parse(
  readFileSync('/Users/zijiechen/Library/Mobile Documents/com~apple~CloudDocs/AI/doomsday-clock/data/generated/evidence.json', 'utf-8')
)

const valid = sourceData.filter(d => d.jobs && d.exposure !== null && d.exposure !== undefined)
const totalJobs = valid.reduce((sum, d) => sum + d.jobs, 0)
const weightedExposure = valid.reduce((sum, d) => sum + d.jobs * d.exposure, 0)
const avgExposure = weightedExposure / totalJobs
const replacementRate = avgExposure * 10

const minutesToMidnight = Math.round((50 - replacementRate) * 14.4)
const wallClockMinutes = (1440 - minutesToMidnight + 1440) % 1440
const hours = Math.floor(wallClockMinutes / 60)
const minutes = wallClockMinutes % 60
const displayTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

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

const referenceNews = referenceEvidence.map(item => ({
  id: item.id,
  title: item.title,
  summary: item.summary,
  date: item.date,
  source: item.source,
  sourceUrl: item.sourceUrl,
  effect: item.effect,
  contributionType: item.contributionType,
  impactLabel: item.impactLabel,
  tags: item.tags,
  reviewStatus: item.reviewStatus
}))

const output = {
  displayTime,
  minutesToMidnight,
  replacementRate: Math.round(replacementRate * 10) / 10,
  totalJobs,
  occupationCount: valid.length,
  occupations,
  referenceNews,
  generatedAt: new Date().toISOString()
}

writeFileSync('public/data.json', JSON.stringify(output, null, 2))
console.log(
  `Generated data.json: ${displayTime} (${replacementRate.toFixed(1)}% replacement rate, ${occupations.length} occupations, ${referenceNews.length} news items)`
)
