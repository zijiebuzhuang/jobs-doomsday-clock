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

export const SIGNAL_SOURCE_GROUPS = [
  'ai-news',
  'business',
  'labor-market',
  'research',
  'policy',
  'official',
]

const VALID_SOURCE_GROUPS = new Set(SIGNAL_SOURCE_GROUPS)
const VALID_SOURCE_TIERS = new Set(['official', 'research', 'editorial', 'media', 'aggregator', 'general'])

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

export function isGenericFeedImageUrl(value) {
  const normalized = sanitizeNewsUrl(value).toLowerCase()
  if (!normalized) return false
  const googleNewsImageSize = normalized.match(/[=,&?_-][ws](\d{2,4})(?:[,&?_-]|$)/)
  const googleNewsImageWidth = googleNewsImageSize ? Number.parseInt(googleNewsImageSize[1], 10) : undefined
  const isLowResolutionGoogleNewsImage = (
    normalized.includes('lh3.googleusercontent.com') ||
    normalized.includes('news.googleusercontent.com')
  ) && Number.isFinite(googleNewsImageWidth) && googleNewsImageWidth < 600

  return normalized.includes('/feeds/static/images/') ||
    normalized.includes('favicon') ||
    normalized.includes('cropped-cropped-favicon') ||
    isLowResolutionGoogleNewsImage ||
    /(^|[/_-])(logo|site-logo|brand)([/_.-]|$)/.test(normalized)
}

function mediaKindFromUrl(value) {
  const normalized = sanitizeNewsUrl(value).toLowerCase()
  if (!normalized) return undefined

  if (
    normalized.includes('youtube.com/') ||
    normalized.includes('youtu.be/') ||
    normalized.includes('/video/') ||
    /\.(mp4|m4v|mov|webm|m3u8)(\?|#|$)/.test(normalized)
  ) {
    return 'video'
  }

  if (isPlayableAudioUrl(normalized)) {
    return 'podcast'
  }

  return undefined
}

export function isPlayableAudioUrl(value) {
  const normalized = sanitizeNewsUrl(value).toLowerCase()
  if (!normalized) return false
  if (
    normalized.includes('youtube.com/') ||
    normalized.includes('youtu.be/') ||
    normalized.includes('/video/') ||
    /\.(mp4|m4v|mov|webm|m3u8)(\?|#|$)/.test(normalized)
  ) {
    return false
  }

  return /\.(mp3|m4a|aac|wav|ogg)(\?|#|$)/.test(normalized)
}

export function normalizeContentType(item = {}) {
  const rawType = sanitizeNewsText(item.contentType || item.mediaType).toLowerCase()
  if (['video', 'youtube', 'youtube-video'].includes(rawType)) return 'video'
  if (['podcast', 'audio'].includes(rawType) && isPlayableAudioUrl(item.mediaUrl)) return 'podcast'

  return mediaKindFromUrl(item.mediaUrl)
    || mediaKindFromUrl(item.sourceUrl || item.link)
    || 'article'
}

export function normalizeSourceGroup(item = {}) {
  const explicitGroup = sanitizeNewsText(item.sourceGroup).toLowerCase()
  if (VALID_SOURCE_GROUPS.has(explicitGroup)) return explicitGroup

  const sourceText = sanitizeNewsText(item.source).toLowerCase()
  const titleText = sanitizeNewsText(item.title).toLowerCase()
  const combinedText = `${sourceText} ${titleText}`

  if (
    combinedText.includes('openai') ||
    combinedText.includes('anthropic') ||
    combinedText.includes('microsoft ai') ||
    combinedText.includes('nvidia developer') ||
    combinedText.includes('meta ai') ||
    combinedText.includes('claude')
  ) {
    return 'official'
  }

  if (
    combinedText.includes('workforce') ||
    combinedText.includes('labor') ||
    combinedText.includes('labour') ||
    combinedText.includes('jobs') ||
    combinedText.includes('employment') ||
    combinedText.includes('hiring') ||
    combinedText.includes('layoff')
  ) {
    return 'labor-market'
  }

  if (
    combinedText.includes('bloomberg') ||
    combinedText.includes('business') ||
    combinedText.includes('market') ||
    combinedText.includes('earnings') ||
    combinedText.includes('wall street')
  ) {
    return 'business'
  }

  if (
    combinedText.includes('mit tech review') ||
    combinedText.includes('arxiv') ||
    combinedText.includes('nber') ||
    combinedText.includes('microsoft research') ||
    combinedText.includes('research') ||
    combinedText.includes('deepmind') ||
    combinedText.includes('paper') ||
    combinedText.includes('study')
  ) {
    return 'research'
  }

  if (
    combinedText.includes('policy') ||
    combinedText.includes('regulation') ||
    combinedText.includes('regulator') ||
    combinedText.includes('senate') ||
    combinedText.includes('government')
  ) {
    return 'policy'
  }

  return 'ai-news'
}

function sourceURLHost(value) {
  try {
    return new URL(sanitizeNewsUrl(value)).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function sourceMatches(item = {}, values = []) {
  const source = sanitizeNewsText(item.source).toLowerCase()
  const title = sanitizeNewsText(item.title).toLowerCase()
  const host = sourceURLHost(item.sourceUrl || item.link)
  const combined = `${source} ${title} ${host}`
  return values.some(value => combined.includes(value))
}

export function normalizeSourceTier(item = {}) {
  const explicitTier = sanitizeNewsText(item.sourceTier).toLowerCase()
  if (VALID_SOURCE_TIERS.has(explicitTier)) return explicitTier

  const sourceGroup = normalizeSourceGroup(item)
  const contentType = normalizeContentType(item)
  const sourceUrl = sanitizeNewsUrl(item.sourceUrl || item.link).toLowerCase()

  if (sourceGroup === 'official') return 'official'
  if (sourceGroup === 'research') return 'research'
  if (contentType === 'podcast' || contentType === 'video') return 'media'
  if (sourceUrl.includes('news.google.com/rss/articles')) return 'aggregator'

  if (sourceMatches(item, [
    'bloomberg',
    'fortune',
    'harvard business review',
    'hbr',
    'mit tech review',
    'technologyreview.com',
    'the verge',
    'wired',
    'ars technica',
    'techcrunch',
    'futurism',
    'the economic times',
    'nytimes',
    'new york times',
    'wall street journal',
  ])) {
    return 'editorial'
  }

  return 'general'
}

export function signalQualityScore(item = {}) {
  const sourceTier = normalizeSourceTier(item)
  const sourceGroup = normalizeSourceGroup(item)
  const contentType = normalizeContentType(item)
  const imageUrl = sanitizeNewsUrl(item.imageUrl)
  const sourceUrl = sanitizeNewsUrl(item.sourceUrl || item.link).toLowerCase()
  const summary = sanitizeNewsText(item.summary || item.contentSnippet)
  const baseScore = {
    official: 88,
    research: 82,
    editorial: 76,
    media: 70,
    general: 62,
    aggregator: 52,
  }[sourceTier] ?? 60

  let score = baseScore
  if (imageUrl && !isGenericFeedImageUrl(imageUrl)) score += 5
  if (imageUrl && isGenericFeedImageUrl(imageUrl)) score -= 15
  if (Array.isArray(item.categories) && item.categories.length > 0) score += 4
  if (Array.isArray(item.occupationIDs) && item.occupationIDs.length > 0) score += 3
  if (Array.isArray(item.tags) && item.tags.length > 0) score += 2
  if (summary.length >= 80) score += 3
  if (sourceUrl.includes('news.google.com/rss/articles')) score -= 6
  if (sourceGroup === 'official' || sourceGroup === 'research') score += 3
  if (contentType === 'podcast' && !isPlayableAudioUrl(item.mediaUrl)) score -= 20

  return Math.min(100, Math.max(1, Math.round(score)))
}

export function makeId(title) {
  return sanitizeNewsText(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)
}

function publisherFromTitle(title = '') {
  const match = sanitizeNewsText(title).match(/\s+-\s+([^-]+)$/)
  return match?.[1]?.trim()
}

function canonicalSignalKey(item = {}) {
  const sourceUrl = sanitizeNewsUrl(item.sourceUrl || item.link)
  const host = sourceURLHost(sourceUrl)
  const sourceKey = host && !host.includes('news.google.com')
    ? host
    : sanitizeNewsText(publisherFromTitle(item.title) || item.source).toLowerCase()
  const titleKey = sanitizeNewsText(item.title)
    .toLowerCase()
    .replace(/\s+-\s+[^-]+$/, '')
    .replace(/\b(ai|artificial intelligence|the|a|an|and|or|to|of|for|in|on|with|by|that|this)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .join('-')

  return `${sourceKey}:${titleKey}`
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
  const contentType = normalizeContentType(item)
  const sourceGroup = normalizeSourceGroup(item)
  const sourceTier = normalizeSourceTier(item)
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
    sourceGroup,
    sourceTier,
    qualityScore: signalQualityScore(item),
  }

  if (contentType !== 'article') {
    normalized.contentType = contentType
  }

  if (categories?.length) {
    normalized.categories = categories
  }

  if (Array.isArray(item.occupationIDs) && item.occupationIDs.length > 0) {
    normalized.occupationIDs = item.occupationIDs
  }

  const imageUrl = sanitizeNewsUrl(item.imageUrl)
  if (imageUrl && !isGenericFeedImageUrl(imageUrl)) {
    normalized.imageUrl = imageUrl
  }

  if (item.mediaUrl) {
    normalized.mediaUrl = sanitizeNewsUrl(item.mediaUrl)
  }

  if (item.duration) {
    normalized.duration = sanitizeNewsText(item.duration)
  }

  return normalized
}

function sortFeedItems(items = []) {
  return items.sort((a, b) =>
    new Date(b.date) - new Date(a.date) ||
    (Number(b.qualityScore) || 0) - (Number(a.qualityScore) || 0) ||
    new Date(b.fetchedAt) - new Date(a.fetchedAt)
  )
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
    const key = canonicalSignalKey(item) || item.id
    if (!deduped.has(key)) {
      deduped.set(key, item)
    }
  }

  return filterFeedWindow([...deduped.values()], asOfDate, true)
}
