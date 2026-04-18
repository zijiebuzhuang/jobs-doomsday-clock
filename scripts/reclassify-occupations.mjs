/**
 * One-shot script: add occupationIDs to existing news-feed.json items.
 * Sends each item (title + summary + categories) to the LLM and asks only for
 * occupation slugs — does not re-evaluate relevance, effect, or impactScore.
 *
 * Usage:
 *   DASHSCOPE_API_KEY=... node scripts/reclassify-occupations.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { callLLM, loadOccupationIndex } from './fetch-news.mjs'
import { BLS_CATEGORIES } from './news-pipeline.mjs'

const FEED_PATH = 'data/news-feed.json'

function buildOccupationReferenceBlock(occupationIndex) {
  const lines = Object.entries(occupationIndex.byCategory)
    .map(([cat, slugs]) => `${cat}: ${slugs.join(', ')}`)
    .join('\n')
  return lines
}

async function main() {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN
  if (!apiKey) {
    console.error('Error: DASHSCOPE_API_KEY environment variable is required')
    process.exit(1)
  }

  const occupationIndex = loadOccupationIndex()
  if (!occupationIndex.allSlugs.size) {
    console.error('Error: occupation dataset not found')
    process.exit(1)
  }

  console.log(`Loaded ${occupationIndex.allSlugs.size} occupation slugs`)

  const items = JSON.parse(readFileSync(FEED_PATH, 'utf-8'))
  const needsTagging = items.filter(item => !item.occupationIDs || item.occupationIDs.length === 0)
  console.log(`Total items: ${items.length}, needing occupationIDs: ${needsTagging.length}\n`)

  if (needsTagging.length === 0) {
    console.log('All items already have occupationIDs. Nothing to do.')
    return
  }

  const occupationBlock = buildOccupationReferenceBlock(occupationIndex)
  let tagged = 0
  let failed = 0

  for (const item of needsTagging) {
    try {
      const prompt = `Given this AI labor market news signal, identify which specific occupations are most directly affected.

Title: ${item.title}
Summary: ${item.summary}
Effect: ${item.effect}
Categories: ${(item.categories || []).join(', ')}

Here are the occupation slugs grouped by BLS category:
${occupationBlock}

Respond with ONLY valid JSON (no markdown):
{
  "occupationIDs": ["slug-1", "slug-2"] (pick 1-5 most directly affected occupations. Use exact slugs from the list. Return empty array [] if the news is too broad/macro to pinpoint specific occupations.)
}`

      const parsed = JSON.parse((await callLLM(apiKey, prompt)).trim())
      const validIDs = (parsed.occupationIDs || []).filter(id => occupationIndex.allSlugs.has(id))

      if (validIDs.length > 0) {
        item.occupationIDs = validIDs
        tagged += 1
        console.log(`  ✓ ${item.title.slice(0, 55)} → ${validIDs.join(', ')}`)
      } else {
        console.log(`  ○ ${item.title.slice(0, 55)} → (too broad)`)
      }
    } catch (err) {
      failed += 1
      console.warn(`  ✗ ${item.title.slice(0, 40)}... - ${err.message}`)
    }
  }

  writeFileSync(FEED_PATH, JSON.stringify(items, null, 2))
  console.log(`\nDone. Tagged: ${tagged}, Too broad: ${needsTagging.length - tagged - failed}, Failed: ${failed}`)
  console.log(`Saved to ${FEED_PATH}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
