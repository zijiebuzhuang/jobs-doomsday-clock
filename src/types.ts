export type OccupationItem = {
  title: string
  exposure: number
  jobs: number
  url: string
  category?: string
  outlook?: number
  outlookDesc?: string
}

export type ReferenceNewsItem = {
  id: string
  title: string
  summary: string
  date: string
  source: string
  sourceUrl: string
  effect: 'advance' | 'delay'
  contributionType: 'slow_variable' | 'shock'
  impactLabel: string
  tags: string[]
  reviewStatus?: string
}

export type ClockData = {
  displayTime: string
  minutesToMidnight: number
  replacementRate: number
  totalJobs: number
  occupationCount: number
  occupations: OccupationItem[]
  referenceNews: ReferenceNewsItem[]
  generatedAt: string
}
