import { readFileSync, writeFileSync, existsSync } from 'fs'
import Parser from 'rss-parser'
import { pathToFileURL } from 'url'
import {
  BLS_CATEGORIES,
  HISTORY_WINDOW_DAYS,
  fetchJSON,
  loadFeedItems,
  loadHistorySet,
  makeId,
  mergeFeedItems,
  normalizeFeedItem,
  normalizeContentType,
  saveHistorySet,
} from './news-pipeline.mjs'

const JOBS_MASTER_SITE_DATA_PATH = '/Users/zijiechen/Downloads/jobs-master/site/data.json'

let cachedOccupationIndex

export function loadOccupationIndex() {
  if (cachedOccupationIndex) return cachedOccupationIndex

  if (!existsSync(JOBS_MASTER_SITE_DATA_PATH)) {
    console.warn('Occupation dataset not found — occupationIDs tagging disabled')
    cachedOccupationIndex = { byCategory: {}, allSlugs: new Set() }
    return cachedOccupationIndex
  }

  const sourceData = JSON.parse(readFileSync(JOBS_MASTER_SITE_DATA_PATH, 'utf-8'))
  const valid = sourceData.filter(item => item.jobs && item.slug && item.exposure !== null && item.exposure !== undefined)
  const byCategory = {}
  const allSlugs = new Set()

  for (const item of valid) {
    const cat = item.category || '_uncategorized'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(item.slug)
    allSlugs.add(item.slug)
  }

  cachedOccupationIndex = { byCategory, allSlugs }
  return cachedOccupationIndex
}

function occupationReferenceBlock(occupationIndex) {
  if (!occupationIndex.allSlugs.size) return ''
  const lines = Object.entries(occupationIndex.byCategory)
    .map(([cat, slugs]) => `${cat}: ${slugs.join(', ')}`)
    .join('\n')
  return `\nHere are specific occupations grouped by category (use their exact slug when tagging):\n${lines}\n`
}

const BASE_RSS_FEEDS = [
  { name: 'Google News - AI Jobs', url: 'https://news.google.com/rss/search?q=AI+automation+jobs+replacement&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Google News - AI Workforce', url: 'https://news.google.com/rss/search?q=artificial+intelligence+workforce+impact&hl=en-US&gl=US&ceid=US:en' },
  { name: 'TechCrunch - AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { name: 'TechCrunch Daily Crunch', url: 'https://feeds.megaphone.fm/techcrunch-daily-crunch', contentType: 'podcast' },
  { name: 'Ars Technica - AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
  { name: 'The Verge - AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
  { name: 'Bloomberg Technology', url: 'https://feeds.bloomberg.com/technology/news.rss' },
]

const YOUTUBE_RSS_FEEDS = (process.env.YOUTUBE_CHANNEL_IDS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
  .map(channelID => ({
    name: 'YouTube',
    url: `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelID)}`,
    contentType: 'video',
  }))

const DEFAULT_APPLE_PODCAST_IDS = [
  '1533115958', // Me, Myself, and AI
  '1528594034', // Hard Fork
  '1668002688', // No Priors
  '1677184070', // Possible
]

function applePodcastIDs() {
  const configuredIDs = (process.env.APPLE_PODCAST_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  return [...new Set([...DEFAULT_APPLE_PODCAST_IDS, ...configuredIDs])]
}

async function fetchApplePodcastFeeds() {
  const feeds = []

  for (const podcastID of applePodcastIDs()) {
    try {
      const data = await fetchJSON(`https://itunes.apple.com/lookup?id=${encodeURIComponent(podcastID)}`)
      const result = data.results?.[0]
      if (!result?.feedUrl) {
        console.warn(`  ✗ Apple Podcasts ${podcastID}: missing feedUrl`)
        continue
      }

      feeds.push({
        name: result.collectionName ? `Apple Podcasts - ${result.collectionName}` : `Apple Podcasts - ${podcastID}`,
        url: result.feedUrl,
        contentType: 'podcast',
      })
    } catch (err) {
      console.warn(`  ✗ Apple Podcasts ${podcastID}: ${err.message}`)
    }
  }

  return feeds
}

const AI_JOBS_KEYWORDS = [
  'ai replace', 'ai replacing', 'ai job', 'ai worker', 'ai employ', 'ai layoff', 'ai hire',
  'ai automat', 'ai workforce', 'ai labor', 'ai labour', 'automation job', 'automation worker',
  'artificial intelligence job', 'artificial intelligence work', 'chatgpt job', 'chatgpt replace',
  'llm job', 'llm replace', 'gpt job', 'copilot job', 'ai agent job', 'ai agent replace',
  'robot replace', 'robot job', 'ai regulation', 'ai policy', 'ai ban', 'ai act',
  'ai talent', 'ai skills', 'ai training', 'ai upskill', 'reskill',
  'job displacement', 'white collar ai', 'blue collar ai', 'ai coding', 'ai design',
  'ai writing', 'ai customer service', 'ai accounting', 'ai legal',
  'openai', 'anthropic', 'google ai', 'deepmind', 'claude', 'gemini',
]

const FEED_PATH = 'data/news-feed.json'

export function isRelevant(title, contentSnippet) {
  const text = `${title} ${contentSnippet || ''}`.toLowerCase()
  return AI_JOBS_KEYWORDS.some(keyword => text.includes(keyword))
}

function itemTimestamp(item) {
  const value = new Date(item.pubDate || item.isoDate || 0).getTime()
  return Number.isFinite(value) ? value : 0
}

function isRichMediaItem(item) {
  return normalizeContentType({
    contentType: item.contentType,
    source: item.source,
    sourceUrl: item.link,
    mediaUrl: item.mediaUrl,
  }) !== 'article'
}

function prioritizeFreshItems(items) {
  return [...items].sort((a, b) => {
    const richDelta = Number(isRichMediaItem(b)) - Number(isRichMediaItem(a))
    if (richDelta !== 0) return richDelta
    return itemTimestamp(b) - itemTimestamp(a)
  })
}

function isImageMimeType(value = '') {
  return value.toLowerCase().startsWith('image/')
}

function isAudioMimeType(value = '') {
  return value.toLowerCase().startsWith('audio/')
}

function isVideoMimeType(value = '') {
  return value.toLowerCase().startsWith('video/')
}

function formatDuration(value) {
  if (!value) return undefined
  const raw = String(value).trim()
  if (!raw) return undefined
  if (raw.includes(':')) return raw

  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds <= 0) return raw
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} min`
}

function urlLike(value) {
  return /^https?:\/\//i.test(String(value || ''))
}

async function fetchRSSFeeds() {
  const parser = new Parser({
    timeout: 15000,
    customFields: {
      feed: [['itunes:image', 'itunesImage']],
      item: ['itunes:duration', ['itunes:image', 'itunesImage']],
    },
  })
  const allItems = []
  const applePodcastFeeds = await fetchApplePodcastFeeds()
  const rssFeeds = [...BASE_RSS_FEEDS, ...applePodcastFeeds, ...YOUTUBE_RSS_FEEDS]

  for (const feed of rssFeeds) {
    try {
      console.log(`Fetching: ${feed.name}...`)
      const result = await parser.parseURL(feed.url)
      const feedImageUrl = imageURLFromItunesImage(result.itunesImage)
        || result.image?.url
        || result.image?.href
      const items = (result.items || []).slice(0, 20)
      for (const item of items) {
        let imageUrl = null
        let mediaUrl = null
        let mediaType = feed.contentType

        // Try enclosure first (common in RSS feeds)
        if (item.enclosure?.url) {
          if (isImageMimeType(item.enclosure.type)) {
            imageUrl = item.enclosure.url
          } else if (isAudioMimeType(item.enclosure.type)) {
            mediaUrl = item.enclosure.url
            mediaType = 'podcast'
          } else if (isVideoMimeType(item.enclosure.type)) {
            mediaUrl = item.enclosure.url
            mediaType = 'video'
          }
        }
        // Try media:content or media:thumbnail
        if (!imageUrl && item['media:content']?.$?.url) {
          const mediaContent = item['media:content'].$
          if (isImageMimeType(mediaContent.type)) {
            imageUrl = mediaContent.url
          } else if (isAudioMimeType(mediaContent.type)) {
            mediaUrl = mediaContent.url
            mediaType = 'podcast'
          } else if (isVideoMimeType(mediaContent.type)) {
            mediaUrl = mediaContent.url
            mediaType = 'video'
          } else {
            imageUrl = mediaContent.url
          }
        }
        if (!imageUrl && item['media:thumbnail']?.$?.url) {
          imageUrl = item['media:thumbnail'].$.url
        }
        if (!imageUrl) {
          imageUrl = imageURLFromItunesImage(item.itunesImage)
            || imageURLFromItunesImage(item.itunes?.image)
            || feedImageUrl
        }
        // Try to extract from content
        if (!imageUrl && (item.content || item['content:encoded'])) {
          const content = item.content || item['content:encoded']
          const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i)
          if (imgMatch) {
            imageUrl = imgMatch[1]
          }
        }

        const link = item.link || (urlLike(item.guid) ? item.guid : undefined) || mediaUrl || ''
        const contentType = normalizeContentType({
          contentType: mediaType,
          source: feed.name,
          sourceUrl: link,
          mediaUrl,
        })

        allItems.push({
          title: item.title || '',
          link,
          contentSnippet: item.contentSnippet || item.content || '',
          pubDate: item.pubDate || item.isoDate || '',
          source: feed.name,
          imageUrl,
          contentType,
          mediaUrl,
          duration: formatDuration(item['itunes:duration'] || item.itunes?.duration),
        })
      }
      console.log(`  → Got ${items.length} items`)
    } catch (err) {
      console.warn(`  ✗ Failed to fetch ${feed.name}: ${err.message}`)
    }
  }

  return allItems
}

function imageURLFromItunesImage(value) {
  if (!value) return undefined
  if (typeof value === 'string') return value
  return value.href || value.url || value.$?.href || value.$?.url
}

export async function callLLM(apiKey, prompt) {
  const data = await fetchJSON('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'qwen-turbo',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  })

  if (!data.choices?.[0]?.message?.content) {
    throw new Error(data.error?.message || 'Missing completion content')
  }

  return data.choices[0].message.content
}

export async function classifyArticles(apiKey, articles, occupationIndex = loadOccupationIndex()) {
  const classified = []
  const hasOccupations = occupationIndex.allSlugs.size > 0
  const occupationBlock = hasOccupations ? occupationReferenceBlock(occupationIndex) : ''

  for (const article of articles) {
    try {
      const prompt = `You are an AI labor market analyst. Analyze this news headline and snippet, then classify its impact on "AI replacing human jobs".

Title: ${article.title}
Snippet: ${article.contentSnippet?.slice(0, 500) || 'N/A'}

Here are the BLS occupation categories: ${BLS_CATEGORIES.join(', ')}
${occupationBlock}
Respond with ONLY valid JSON (no markdown):
{
  "relevant": true/false (is this actually about AI's impact on jobs/labor?),
  "effect": "advance" or "delay" (advance = AI replacing jobs faster, delay = slowing AI job replacement),
  "impactScore": 1-5 (1=minor, 5=major milestone),
  "summary": "One sentence summary of the impact",
  "tags": ["tag1", "tag2"],
  "affectedCategories": ["category-slug-1", "category-slug-2"] (which BLS categories above are most affected by this news? Use "_all" if the article broadly affects all categories. Pick 1-3 most relevant.)${hasOccupations ? `,
  "occupationIDs": ["slug-1", "slug-2"] (which specific occupations from the list above are most directly affected? Pick 1-5 most relevant. Use exact slugs. Omit or leave empty if the news is too broad to pinpoint specific occupations.)` : ''}
}`

      const parsed = JSON.parse((await callLLM(apiKey, prompt)).trim())
      if (!parsed.relevant) {
        console.log(`  ⊘ Not relevant: ${article.title.slice(0, 60)}`)
        continue
      }

      // Validate occupationIDs against known slugs
      let validOccupationIDs
      if (hasOccupations && Array.isArray(parsed.occupationIDs)) {
        validOccupationIDs = parsed.occupationIDs.filter(id => occupationIndex.allSlugs.has(id))
        if (validOccupationIDs.length === 0) validOccupationIDs = undefined
      }

      classified.push(normalizeFeedItem({
        id: makeId(article.title),
        title: article.title,
        summary: parsed.summary,
        date: article.pubDate || Date.now(),
        source: article.source.replace(/^Google News - /, ''),
        sourceUrl: article.link,
        effect: parsed.effect,
        impactScore: parsed.impactScore,
        tags: parsed.tags || [],
        categories: parsed.affectedCategories,
        occupationIDs: validOccupationIDs,
        fetchedAt: new Date().toISOString(),
        imageUrl: article.imageUrl,
        contentType: article.contentType,
        mediaUrl: article.mediaUrl,
        duration: article.duration,
      }))

      const occTag = validOccupationIDs ? ` → ${validOccupationIDs.join(', ')}` : ''
      console.log(`  ✓ ${parsed.effect === 'advance' ? '⚡' : '🛡'} [${parsed.impactScore}] ${article.title.slice(0, 60)}${occTag}`)
    } catch (err) {
      console.warn(`  ✗ Classification failed: ${article.title.slice(0, 40)}... - ${err.message}`)
    }
  }

  return classified
}

async function main() {
  console.log('=== AI Jobs Doomsday Clock — News Fetcher ===\n')

  console.log('Step 1: Fetching RSS feeds...')
  const rawItems = await fetchRSSFeeds()
  console.log(`\nTotal raw items: ${rawItems.length}`)

  const relevant = rawItems.filter(item => isRelevant(item.title, item.contentSnippet))
  console.log(`After keyword filter: ${relevant.length}`)

  const history = loadHistorySet()
  const fresh = prioritizeFreshItems(relevant.filter(item => !history.has(makeId(item.title))))
  const richFresh = fresh.filter(isRichMediaItem).length
  console.log(`After dedup: ${fresh.length} new items\n`)
  console.log(`Rich media candidates: ${richFresh}\n`)

  if (fresh.length === 0) {
    console.log('No new relevant articles found. Exiting.')
    return
  }

  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN
  if (!apiKey) {
    console.error('Error: DASHSCOPE_API_KEY environment variable is required')
    process.exit(1)
  }

  console.log('Step 2: Classifying with Qwen API...')
  const classified = await classifyArticles(apiKey, fresh.slice(0, 15))
  console.log(`\nClassified: ${classified.length} articles`)

  const merged = mergeFeedItems(loadFeedItems(FEED_PATH), classified, new Date())

  writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2))
  console.log(`\nSaved ${merged.length} items from the last ${HISTORY_WINDOW_DAYS} days to ${FEED_PATH}`)

  for (const item of classified) history.add(item.id)
  saveHistorySet(history)

  const advances = classified.filter(item => item.effect === 'advance').length
  const delays = classified.filter(item => item.effect === 'delay').length
  console.log('\n=== Summary ===')
  console.log(`New signals: ${advances} advance, ${delays} delay`)
  console.log(`Total feed size: ${merged.length}`)
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
