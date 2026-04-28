import { readFileSync } from 'fs'
import {
  SIGNAL_SOURCE_GROUPS,
  isPlayableAudioUrl,
  normalizeContentType,
  normalizeSourceGroup,
} from './news-pipeline.mjs'

const path = process.argv[2] || 'public/data.json'
const payload = JSON.parse(readFileSync(path, 'utf-8'))
const items = Array.isArray(payload) ? payload.flatMap(point => point.newsFeed || []) : payload.newsFeed || []

const issues = []
const warnings = []
const counts = { article: 0, podcast: 0, video: 0 }
const sourceGroups = Object.fromEntries(SIGNAL_SOURCE_GROUPS.map(group => [group, 0]))

for (const item of items) {
  const contentType = normalizeContentType(item)
  counts[contentType] = (counts[contentType] || 0) + 1
  const sourceGroup = normalizeSourceGroup(item)
  sourceGroups[sourceGroup] = (sourceGroups[sourceGroup] || 0) + 1

  if (!item.sourceGroup) {
    warnings.push({
      type: 'missing_source_group',
      title: item.title,
      source: item.source,
      resolvedSourceGroup: sourceGroup,
    })
  } else if (!SIGNAL_SOURCE_GROUPS.includes(item.sourceGroup)) {
    issues.push({
      type: 'invalid_source_group',
      title: item.title,
      source: item.source,
      sourceGroup: item.sourceGroup,
      resolvedSourceGroup: sourceGroup,
    })
  }

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
    warnings.push({
      type: 'video_without_cover_or_youtube_id',
      title: item.title,
      source: item.source,
      sourceUrl: item.sourceUrl,
      mediaUrl: item.mediaUrl,
    })
  }
}

console.log(JSON.stringify({ path, total: items.length, counts, sourceGroups, warnings: warnings.length, issues: issues.length }, null, 2))

const printedWarnings = warnings.slice(0, 25)
for (const warning of printedWarnings) {
  const details = warning.sourceGroup
    ? `, sourceGroup=${warning.sourceGroup}`
    : warning.resolvedSourceGroup
      ? `, resolved=${warning.resolvedSourceGroup}`
      : ''
  console.warn(`- warning:${warning.type}: ${warning.title} (${warning.source || 'unknown source'}${details})`)
}
if (warnings.length > printedWarnings.length) {
  console.warn(`- ${warnings.length - printedWarnings.length} additional warnings omitted`)
}

for (const issue of issues) {
  const details = issue.sourceGroup
    ? `, sourceGroup=${issue.sourceGroup}`
    : issue.resolvedSourceGroup
      ? `, resolved=${issue.resolvedSourceGroup}`
      : ''
  console.warn(`- ${issue.type}: ${issue.title} (${issue.source || 'unknown source'}${details})`)
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
