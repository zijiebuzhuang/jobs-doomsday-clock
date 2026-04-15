import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const FEED_PATH = 'data/news-feed.json'
const HISTORY_PATH = 'data/news-history.json'

export const HISTORY_WINDOW_DAYS = 90

export const BLS_CATEGORIES = [
  'healthcare', 'life-physical-and-social-science', 'architecture-and-engineering',
  'management', 'business-and-financial', 'construction-and-extraction', 'production',
  'installation-maintenance-and-repair', 'education-training-and-library',
  'office-and-administrative-support', 'transportation-and-material-moving',
  'personal-care-and-service', 'sales', 'media-and-communication',
  'computer-and-information-technology', 'community-and-social-service',
  'arts-and-design', 'entertainment-and-sports', 'protective-service',
  'food-preparation-and-serving', 'legal', 'math', 'farming-fishing-and-forestry',
  'building-and-grounds-cleaning',
]

const VALID_CATEGORIES = new Set([...BLS_CATEGORIES, '_all'])

export function startOfShanghaiDay(value) {
  const date = new Date(value)
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  )
}

export function toISODate(value) {
  return new Date(value).toISOString().split('T')[0]
}

export function resolveAsOfDate(input = process.env.AS_OF_DATE) {
  if (!input) return new Date()
  const value = new Date(`${input}T12:00:00Z`)
  if (Number.isNaN(value.getTime())) {
    throw new Error(`Invalid AS_OF_DATE: ${input}`)
  }
  return value
}

export function loadFeedItems(path = FEED_PATH) {
  if (!existsSync(path)) return []
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export function loadHistorySet(path = HISTORY_PATH) {
  if (!existsSync(path)) return new Set()
  return new Set(JSON.parse(readFileSync(path, 'utf-8')))
}

export function saveHistorySet(history, path = HISTORY_PATH) {
  writeFileSync(path, JSON.stringify([...history], null, 2))
}

const NAMED_HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeHTMLEntities(value) {
  if (typeof value !== 'string' || !value.includes('&')) {
    return value || ''
  }

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = entity.toLowerCase()

    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }

    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }

    return NAMED_HTML_ENTITIES[normalized] ?? match
  })
}

export function sanitizeNewsText(value) {
  return decodeHTMLEntities(value || '').replace(/\u00a0/g, ' ').trim()
}

export function sanitizeNewsUrl(value) {
  return decodeHTMLEntities(value || '').trim()
}

export function makeId(title) {
  return sanitizeNewsText(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)
}

function proxyEnv() {
  const entries = Object.entries(process.env)
    .filter(([key, value]) => /proxy/i.test(key) && value)
  return entries.length ? Object.fromEntries(entries) : undefined
}

export async function fetchJSON(url, { method = 'GET', headers = {}, body } = {}) {
  const proxy = proxyEnv()
  if (!proxy) {
    const res = await fetch(url, { method, headers, body })
    if (!res.ok) {
      throw new Error(`${res.status} ${await res.text()}`)
    }
    return res.json()
  }

  const args = ['-sS', '--max-time', '60', '-X', method]
  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`)
  }
  if (body) {
    args.push('--data', body)
  }
  args.push(url)

  const output = execFileSync('curl', args, {
    encoding: 'utf-8',
    env: { ...process.env, ...proxy },
  })

  return JSON.parse(output)
}

export function daysSinceDate(value, asOfDate = new Date()) {
  return (startOfShanghaiDay(asOfDate) - startOfShanghaiDay(value)) / MS_PER_DAY
}

export function isWithinHistoryWindow(value, asOfDate = new Date()) {
  const daysSince = daysSinceDate(value, asOfDate)
  return daysSince >= 0 && daysSince < HISTORY_WINDOW_DAYS
}

export function normalizeCategories(rawCategories) {
  if (!Array.isArray(rawCategories)) return undefined
  const categories = rawCategories.filter(category => VALID_CATEGORIES.has(category))
  return categories.length ? categories : ['_all']
}

export function normalizeFeedItem(item) {
  const categories = normalizeCategories(item.categories ?? item.affectedCategories)
  const normalizedTitle = sanitizeNewsText(item.title)
  const normalized = {
    id: makeId(item.id || normalizedTitle),
    title: normalizedTitle,
    summary: sanitizeNewsText(item.summary),
    date: toISODate(item.date || item.publishedAt || item.pubDate || Date.now()),
    source: sanitizeNewsText(item.source),
    sourceUrl: sanitizeNewsUrl(item.sourceUrl || item.link),
    effect: item.effect === 'delay' ? 'delay' : 'advance',
    impactScore: Math.min(5, Math.max(1, Math.round(Number(item.impactScore) || 1))),
    tags: Array.isArray(item.tags) ? item.tags.map(sanitizeNewsText).filter(Boolean) : [],
    fetchedAt: item.fetchedAt || item.date || item.publishedAt || item.pubDate || '',
  }

  if (categories?.length) {
    normalized.categories = categories
  }

  if (Array.isArray(item.occupationIDs) && item.occupationIDs.length > 0) {
    normalized.occupationIDs = item.occupationIDs
  }

  if (item.imageUrl) {
    normalized.imageUrl = sanitizeNewsUrl(item.imageUrl)
  }

  return normalized
}

function sortFeedItems(items = []) {
  return items.sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.fetchedAt) - new Date(a.fetchedAt))
}

export function normalizeFeedItems(items = []) {
  return items.map(normalizeFeedItem)
}

export function filterFeedWindow(items = [], asOfDate = new Date(), normalized = false) {
  const normalizedItems = normalized ? items : normalizeFeedItems(items)
  return sortFeedItems(normalizedItems.filter(item => isWithinHistoryWindow(item.date, asOfDate)))
}

export function feedItemsForDate(items = [], targetDate, normalized = false, useFetchedAt = false) {
  const date = toISODate(targetDate)
  const normalizedItems = normalized ? items : normalizeFeedItems(items)
  return sortFeedItems(normalizedItems.filter(item => {
    const itemDate = useFetchedAt ? toISODate(item.fetchedAt) : item.date
    return itemDate === date
  }))
}

export function mergeFeedItems(existingFeed = [], incomingFeed = [], asOfDate = new Date()) {
  const deduped = new Map()

  for (const item of sortFeedItems(normalizeFeedItems([...incomingFeed, ...existingFeed]))) {
    if (!item.id || !item.title || !item.sourceUrl) continue
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item)
    }
  }

  return filterFeedWindow([...deduped.values()], asOfDate, true)
}
