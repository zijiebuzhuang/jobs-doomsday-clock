import { readFileSync, writeFileSync, existsSync } from 'fs'

const DATA_PATH = 'public/data.json'
const HISTORY_PATH = 'public/clock-history.json'
const MAX_DAYS = 90

function main() {
  console.log('=== Save Daily History Snapshot ===\n')

  if (!existsSync(DATA_PATH)) {
    console.error(`Error: ${DATA_PATH} not found. Run compute-clock.mjs first.`)
    process.exit(1)
  }

  const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))

  // Today's date in YYYY-MM-DD (UTC)
  const today = new Date().toISOString().split('T')[0]

  const snapshot = {
    date: today,
    minutesToMidnight: data.minutesToMidnight,
    newsAdjustment: data.newsAdjustment,
    categoryAdjustments: data.categoryAdjustments || {},
  }

  // Load existing history
  let history = []
  if (existsSync(HISTORY_PATH)) {
    history = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'))
  }

  // Deduplicate: replace existing entry for today, or append
  const existingIndex = history.findIndex(h => h.date === today)
  if (existingIndex >= 0) {
    history[existingIndex] = snapshot
    console.log(`Updated existing entry for ${today}`)
  } else {
    history.push(snapshot)
    console.log(`Added new entry for ${today}`)
  }

  // Sort by date descending, trim to MAX_DAYS
  history.sort((a, b) => b.date.localeCompare(a.date))
  if (history.length > MAX_DAYS) {
    history = history.slice(0, MAX_DAYS)
  }

  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2))
  console.log(`History: ${history.length} entries saved to ${HISTORY_PATH}`)
  console.log(`  Latest: ${history[0].date} (${history[0].minutesToMidnight} min to midnight)`)
  if (history.length > 1) {
    console.log(`  Oldest: ${history[history.length - 1].date}`)
  }
}

main()
