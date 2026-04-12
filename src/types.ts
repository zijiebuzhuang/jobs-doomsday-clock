export type OccupationItem = {
  title: string
  slug?: string
  socCode?: string
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
  categories?: string[]
  occupationIDs?: string[]
  imageUrl?: string
}

export type SignalSummaryPayload = {
  title: string
  preview: string
  body: string
}

export type ClockData = {
  displayTime: string
  minutesToMidnight: number
  exactMinutesToMidnight: number
  baseMinutesToMidnight: number
  newsAdjustment: number
  categoryAdjustments: Record<string, number>
  replacementRate: number
  macroReplacementRate: number
  totalJobs: number
  occupationCount: number
  occupations: OccupationItem[]
  newsFeed: NewsFeedItem[]
  generatedAt: string
  signalSummaries?: {
    dailyPulse?: SignalSummaryPayload
  }
}
