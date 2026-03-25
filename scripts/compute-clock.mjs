import { readFileSync, writeFileSync } from 'fs'

const sourceData = JSON.parse(readFileSync('/Users/zijiechen/Downloads/jobs-master/site/data.json', 'utf-8'))

const valid = sourceData.filter(d => d.jobs && d.exposure !== null && d.exposure !== undefined)
const totalJobs = valid.reduce((sum, d) => sum + d.jobs, 0)
const weightedExposure = valid.reduce((sum, d) => sum + d.jobs * d.exposure, 0)
const avgExposure = weightedExposure / totalJobs
const replacementRate = avgExposure * 10

const minutesToMidnight = Math.round((100 - replacementRate) * 7.2)
const hours = Math.floor(minutesToMidnight / 60)
const minutes = minutesToMidnight % 60
const displayTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

const topExposures = valid
  .sort((a, b) => b.exposure - a.exposure)
  .slice(0, 15)
  .map(d => ({
    title: d.title,
    exposure: d.exposure,
    jobs: d.jobs,
    url: d.url
  }))

const output = {
  displayTime,
  minutesToMidnight,
  replacementRate: Math.round(replacementRate * 10) / 10,
  totalJobs,
  occupationCount: valid.length,
  topExposures,
  generatedAt: new Date().toISOString()
}

writeFileSync('public/data.json', JSON.stringify(output, null, 2))
console.log(`Generated data.json: ${displayTime} (${replacementRate.toFixed(1)}% replacement rate)`)
