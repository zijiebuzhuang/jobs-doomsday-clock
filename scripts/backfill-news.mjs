import { writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { classifyArticles, isRelevant } from './fetch-news.mjs'
import { buildClockData, generateSignalSummaries } from './compute-clock.mjs'
import { buildHistory } from './save-history.mjs'
import {
  HISTORY_WINDOW_DAYS,
  fetchJSON,
  loadFeedItems,
  loadHistorySet,
  makeId,
  mergeFeedItems,
  resolveAsOfDate,
  saveHistorySet,
  toISODate,
} from './news-pipeline.mjs'

const FEED_PATH = 'data/news-feed.json'
const HISTORY_OUTPUT_PATH = 'public/clock-history.json'
const DATA_PATH = 'public/data.json'
const NEWS_API_URL = 'https://newsapi.org/v2/everything'
const PAGE_SIZE = 100
const MAX_PAGES = 5
const QUERY = '("artificial intelligence" OR AI OR ChatGPT OR Claude OR Gemini) AND (jobs OR workforce OR labor OR labour OR automation OR layoff OR employment OR hiring)'

async function fetchHistoricalArticles(apiKey, fromDate, toDate) {
  const allArticles = []

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(NEWS_API_URL)
    url.searchParams.set('q', QUERY)
    url.searchParams.set('language', 'en')
    url.searchParams.set('sortBy', 'publishedAt')
    url.searchParams.set('pageSize', String(PAGE_SIZE))
    url.searchParams.set('page', String(page))
    url.searchParams.set('from', fromDate)
    url.searchParams.set('to', toDate)

    const data = await fetchJSON(url, {
      headers: {
        'X-Api-Key': apiKey,
      },
    })
    const articles = Array.isArray(data.articles) ? data.articles : []
    console.log(`News API page ${page}: ${articles.length} articles`)
    if (articles.length === 0) break

    allArticles.push(...articles)
    if (articles.length < PAGE_SIZE) break
  }

  return allArticles.map(article => ({
    title: article.title || '',
    link: article.url || '',
    contentSnippet: article.description || article.content || '',
    pubDate: article.publishedAt || '',
    source: article.source?.name || 'News API',
  }))
}

async function main() {
  const cliDate = process.argv.find(arg => arg.startsWith('--date='))?.split('=')[1]
  const asOfDate = resolveAsOfDate(cliDate)
  const endDate = toISODate(asOfDate)
  const startDate = new Date(asOfDate)
  startDate.setUTCDate(startDate.getUTCDate() - (HISTORY_WINDOW_DAYS - 1))
  const fromDate = toISODate(startDate)

  const newsApiKey = process.env.NEWS_API_KEY
  const dashscopeApiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN
  if (!newsApiKey) {
    console.error('Error: NEWS_API_KEY environment variable is required')
    process.exit(1)
  }
  if (!dashscopeApiKey) {
    console.error('Error: DASHSCOPE_API_KEY environment variable is required')
    process.exit(1)
  }

  console.log(`=== Backfill AI jobs news from ${fromDate} to ${endDate} ===`)
  const rawArticles = await fetchHistoricalArticles(newsApiKey, fromDate, endDate)
  console.log(`Fetched ${rawArticles.length} historical articles`)

  const relevantArticles = rawArticles
    .filter(article => article.title && article.link)
    .filter(article => isRelevant(article.title, article.contentSnippet))

  const dedupedArticles = [...new Map(
    relevantArticles.map(article => [makeId(article.title), article])
  ).values()]

  console.log(`Relevant after keyword filter: ${dedupedArticles.length}`)
  const classified = await classifyArticles(dashscopeApiKey, dedupedArticles)
  console.log(`Classified historical signals: ${classified.length}`)

  const history = loadHistorySet()
  for (const article of dedupedArticles) history.add(makeId(article.title))
  saveHistorySet(history)

  const mergedFeed = mergeFeedItems(loadFeedItems(FEED_PATH), classified, asOfDate)
  writeFileSync(FEED_PATH, JSON.stringify(mergedFeed, null, 2))
  console.log(`Saved ${mergedFeed.length} feed items to ${FEED_PATH}`)

  const preliminaryData = buildClockData({ asOfDate, newsFeed: mergedFeed })
  let signalSummaries

  try {
    signalSummaries = await generateSignalSummaries({
      feedWindow: preliminaryData.newsFeed,
      generatedAt: preliminaryData.generatedAt,
      macroReplacementRate: preliminaryData.macroReplacementRate,
      newsAdjustment: preliminaryData.newsAdjustment,
    })
  } catch (err) {
    console.warn(`Signal summary generation failed: ${err.message}`)
  }

  const currentData = buildClockData({ asOfDate, newsFeed: mergedFeed, signalSummaries })
  writeFileSync(DATA_PATH, JSON.stringify(currentData, null, 2))
  console.log(`Updated ${DATA_PATH} for ${endDate}`)

  const rebuiltHistory = buildHistory({ rebuild: true, endDate: asOfDate, newsFeed: mergedFeed })
  writeFileSync(HISTORY_OUTPUT_PATH, JSON.stringify(rebuiltHistory, null, 2))
  console.log(`Rebuilt ${HISTORY_OUTPUT_PATH} with ${rebuiltHistory.length} daily snapshots`)
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
