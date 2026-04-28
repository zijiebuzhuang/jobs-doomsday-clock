import { existsSync, readFileSync, writeFileSync } from 'fs'
import {
  SIGNAL_SOURCE_GROUPS,
  normalizeContentType,
  normalizeSourceGroup,
} from './news-pipeline.mjs'

const paths = process.argv.slice(2)
const targetPaths = paths.length
  ? paths
  : ['data/news-feed.json', 'public/data.json', 'public/clock-history.json']

for (const path of targetPaths) {
  if (!existsSync(path)) continue

  const payload = JSON.parse(readFileSync(path, 'utf-8'))
  let updated = 0

  for (const item of newsFeedItems(payload)) {
    const sourceGroup = normalizeSourceGroup(item)
    if (!item.sourceGroup || !SIGNAL_SOURCE_GROUPS.includes(item.sourceGroup)) {
      item.sourceGroup = sourceGroup
      updated += 1
    }

    const contentType = normalizeContentType(item)
    if (contentType !== 'article' && item.contentType !== contentType) {
      item.contentType = contentType
      updated += 1
    }
  }

  if (updated > 0) {
    writeFileSync(path, JSON.stringify(payload, null, 2))
  }
  console.log(`Backfilled ${updated} source fields in ${path}`)
}

function newsFeedItems(payload) {
  if (Array.isArray(payload)) {
    return payload.flatMap(point => Array.isArray(point.newsFeed) ? point.newsFeed : [])
  }

  return Array.isArray(payload.newsFeed) ? payload.newsFeed : []
}
