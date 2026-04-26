import { readFileSync, writeFileSync } from 'fs'
import { normalizeContentType } from './news-pipeline.mjs'

const path = process.argv[2] || 'data/news-feed.json'
const items = JSON.parse(readFileSync(path, 'utf-8'))
let updated = 0

for (const item of items) {
  const contentType = normalizeContentType(item)
  if (contentType === 'video' && !item.contentType) {
    item.contentType = 'video'
    updated += 1
  }

  if (contentType === 'video' && !item.imageUrl) {
    const imageUrl = await fetchOpenGraphImage(item.sourceUrl)
    if (imageUrl) {
      item.imageUrl = imageUrl
      updated += 1
    }
  }

  if (contentType === 'podcast' && !item.imageUrl) {
    const imageUrl = await fetchOpenGraphImage(item.sourceUrl) || defaultPodcastImageURL(item.source)
    if (imageUrl) {
      item.imageUrl = imageUrl
      updated += 1
    }
  }
}

writeFileSync(path, JSON.stringify(items, null, 2))
console.log(`Backfilled ${updated} media fields in ${path}`)

async function fetchOpenGraphImage(url) {
  if (!url) return undefined

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'HowFarBot/1.0 (+https://jobdoomsday.tech)',
      },
    })
    if (!response.ok) return undefined

    const html = await response.text()
    return metaContent(html, 'property', 'og:image')
      || metaContent(html, 'name', 'twitter:image')
  } catch {
    return undefined
  }
}

function metaContent(html, attributeName, attributeValue) {
  const directPattern = new RegExp(`<meta[^>]+${attributeName}=["']${escapeRegExp(attributeValue)}["'][^>]+content=["']([^"']+)["']`, 'i')
  const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attributeName}=["']${escapeRegExp(attributeValue)}["']`, 'i')

  return html.match(directPattern)?.[1]
    || html.match(reversePattern)?.[1]
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function defaultPodcastImageURL(source = '') {
  const normalizedSource = source.toLowerCase()

  if (normalizedSource.includes('techcrunch daily crunch')) {
    return 'https://megaphone.imgix.net/podcasts/370f8262-360e-11ee-9d15-87210aad8978/image/image.jpg?ixlib=rails-4.3.1&max-w=3000&max-h=3000&fit=crop&auto=format,compress'
  }

  return undefined
}
