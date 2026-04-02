import { readFileSync, writeFileSync, existsSync } from 'fs'
import Parser from 'rss-parser'
import { GoogleGenAI } from '@google/genai'

const RSS_FEEDS = [
  { name: 'Google News - AI Jobs', url: 'https://news.google.com/rss/search?q=AI+automation+jobs+replacement&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Google News - AI Workforce', url: 'https://news.google.com/rss/search?q=artificial+intelligence+workforce+impact&hl=en-US&gl=US&ceid=US:en' },
  { name: 'TechCrunch - AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { name: 'Ars Technica - AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
  { name: 'The Verge - AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
]

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

const HISTORY_PATH = 'data/news-history.json'
const FEED_PATH = 'data/news-feed.json'

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return new Set()
  const data = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'))
  return new Set(data)
}

function saveHistory(history) {
  writeFileSync(HISTORY_PATH, JSON.stringify([...history], null, 2))
}

function isRelevant(title, contentSnippet) {
  const text = `${title} ${contentSnippet || ''}`.toLowerCase()
  return AI_JOBS_KEYWORDS.some(kw => text.includes(kw))
}

function makeId(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)
}

async function fetchRSSFeeds() {
  const parser = new Parser({ timeout: 15000 })
  const allItems = []

  for (const feed of RSS_FEEDS) {
    try {
      console.log(`Fetching: ${feed.name}...`)
      const result = await parser.parseURL(feed.url)
      const items = (result.items || []).slice(0, 20)
      for (const item of items) {
        allItems.push({
          title: item.title || '',
          link: item.link || '',
          contentSnippet: item.contentSnippet || item.content || '',
          pubDate: item.pubDate || item.isoDate || '',
          source: feed.name,
        })
      }
      console.log(`  → Got ${items.length} items`)
    } catch (err) {
      console.warn(`  ✗ Failed to fetch ${feed.name}: ${err.message}`)
    }
  }

  return allItems
}

async function classifyWithGemini(ai, articles) {
  const classified = []

  for (const article of articles) {
    try {
      const prompt = `You are an AI labor market analyst. Analyze this news headline and snippet, then classify its impact on "AI replacing human jobs".

Title: ${article.title}
Snippet: ${article.contentSnippet?.slice(0, 500) || 'N/A'}

Respond with ONLY valid JSON (no markdown):
{
  "relevant": true/false (is this actually about AI's impact on jobs/labor?),
  "effect": "advance" or "delay" (advance = AI replacing jobs faster, delay = slowing AI job replacement),
  "impactScore": 1-5 (1=minor, 5=major milestone),
  "summary": "One sentence summary of the impact",
  "tags": ["tag1", "tag2"]
}`

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      })

      const text = response.text.trim()
      const parsed = JSON.parse(text)

      if (!parsed.relevant) {
        console.log(`  ⊘ Not relevant: ${article.title.slice(0, 60)}`)
        continue
      }

      classified.push({
        id: makeId(article.title),
        title: article.title,
        summary: parsed.summary,
        date: new Date(article.pubDate || Date.now()).toISOString().split('T')[0],
        source: article.source.replace(/^Google News - /, ''),
        sourceUrl: article.link,
        effect: parsed.effect,
        impactScore: Math.min(5, Math.max(1, parsed.impactScore)),
        tags: parsed.tags || [],
        fetchedAt: new Date().toISOString(),
      })

      console.log(`  ✓ ${parsed.effect === 'advance' ? '⚡' : '🛡'} [${parsed.impactScore}] ${article.title.slice(0, 60)}`)
    } catch (err) {
      console.warn(`  ✗ Classification failed: ${article.title.slice(0, 40)}... - ${err.message}`)
    }
  }

  return classified
}

async function main() {
  console.log('=== AI Jobs Doomsday Clock — News Fetcher ===\n')

  // 1. Fetch RSS feeds
  console.log('Step 1: Fetching RSS feeds...')
  const rawItems = await fetchRSSFeeds()
  console.log(`\nTotal raw items: ${rawItems.length}`)

  // 2. Keyword filter
  const relevant = rawItems.filter(item => isRelevant(item.title, item.contentSnippet))
  console.log(`After keyword filter: ${relevant.length}`)

  // 3. Deduplicate against history
  const history = loadHistory()
  const fresh = relevant.filter(item => {
    const id = makeId(item.title)
    return !history.has(id)
  })
  console.log(`After dedup: ${fresh.length} new items\n`)

  if (fresh.length === 0) {
    console.log('No new relevant articles found. Exiting.')
    return
  }

  // 4. Classify with Gemini
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY environment variable is required')
    process.exit(1)
  }

  console.log('Step 2: Classifying with Gemini API...')
  const ai = new GoogleGenAI({ apiKey })
  const classified = await classifyWithGemini(ai, fresh.slice(0, 15))
  console.log(`\nClassified: ${classified.length} articles`)

  // 5. Merge with existing feed
  let existingFeed = []
  if (existsSync(FEED_PATH)) {
    existingFeed = JSON.parse(readFileSync(FEED_PATH, 'utf-8'))
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const merged = [...classified, ...existingFeed]
    .filter(item => new Date(item.date) >= thirtyDaysAgo)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 50)

  writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2))
  console.log(`\nSaved ${merged.length} items to ${FEED_PATH}`)

  // 6. Update history
  for (const item of classified) {
    history.add(item.id)
  }
  for (const item of rawItems) {
    history.add(makeId(item.title))
  }
  saveHistory(history)

  // 7. Summary
  const advances = classified.filter(i => i.effect === 'advance').length
  const delays = classified.filter(i => i.effect === 'delay').length
  console.log(`\n=== Summary ===`)
  console.log(`New signals: ${advances} advance, ${delays} delay`)
  console.log(`Total feed size: ${merged.length}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
