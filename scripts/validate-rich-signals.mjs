import { readFileSync } from 'fs'
import { isPlayableAudioUrl, normalizeContentType } from './news-pipeline.mjs'

const path = process.argv[2] || 'public/data.json'
const payload = JSON.parse(readFileSync(path, 'utf-8'))
const items = Array.isArray(payload) ? payload.flatMap(point => point.newsFeed || []) : payload.newsFeed || []

const issues = []
const counts = { article: 0, podcast: 0, video: 0 }

for (const item of items) {
  const contentType = normalizeContentType(item)
  counts[contentType] = (counts[contentType] || 0) + 1

  if ((item.contentType === 'podcast' || contentType === 'podcast') && !isPlayableAudioUrl(item.mediaUrl)) {
    issues.push({
      type: 'podcast_without_playable_audio',
      title: item.title,
      source: item.source,
      sourceUrl: item.sourceUrl,
      mediaUrl: item.mediaUrl,
    })
  }

  if (contentType === 'video' && !item.imageUrl && !youtubeVideoID(item.mediaUrl || item.sourceUrl)) {
    issues.push({
      type: 'video_without_cover_or_youtube_id',
      title: item.title,
      source: item.source,
      sourceUrl: item.sourceUrl,
      mediaUrl: item.mediaUrl,
    })
  }
}

console.log(JSON.stringify({ path, total: items.length, counts, issues: issues.length }, null, 2))

for (const issue of issues) {
  console.warn(`- ${issue.type}: ${issue.title} (${issue.source || 'unknown source'})`)
}

if (issues.length > 0) {
  process.exitCode = 1
}

function youtubeVideoID(value) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    const host = url.host.toLowerCase()
    if (host.includes('youtu.be')) {
      return url.pathname.split('/').filter(Boolean)[0]
    }
    if (host.includes('youtube.com')) {
      return url.searchParams.get('v') || url.pathname.match(/\/shorts\/([^/?#]+)/)?.[1]
    }
  } catch {
    return undefined
  }
}
