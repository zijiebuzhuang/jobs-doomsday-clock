export type ClockData = {
  displayTime: string
  minutesToMidnight: number
  replacementRate: number
  totalJobs: number
  occupationCount: number
  topExposures: Array<{
    title: string
    exposure: number
    jobs: number
    url: string
  }>
  generatedAt: string
}
