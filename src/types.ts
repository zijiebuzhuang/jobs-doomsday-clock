export type OccupationItem = {
  title: string
  exposure: number
  jobs: number
  url: string
  category?: string
  outlook?: number
  outlookDesc?: string
}

export type NewsFeedItem = {
  id: string
  title: string
  summary: string
  date: string
  source: string
  sourceUrl: string
  effect: 'advance' | 'delay'
  impactScore: number
  tags: string[]
  fetchedAt: string
}

export type ClockData = {
  displayTime: string
  minutesToMidnight: number
  baseMinutesToMidnight: number
  newsAdjustment: number
  replacementRate: number
  totalJobs: number
  occupationCount: number
  occupations: OccupationItem[]
  newsFeed: NewsFeedItem[]
  generatedAt: string
}
