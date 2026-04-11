import { readFileSync } from 'fs'

export const JOBS_MASTER_ROOT = '/Users/zijiechen/Downloads/jobs-master'
export const JOBS_MASTER_SITE_DATA_PATH = `${JOBS_MASTER_ROOT}/site/data.json`
export const JOBS_MASTER_OCCUPATIONS_CSV_PATH = `${JOBS_MASTER_ROOT}/occupations.csv`

let cachedIndex

function parseCSVLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += char
  }

  values.push(current)
  return values
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  const headers = parseCSVLine(lines[0])

  return lines.slice(1).map(line => {
    const values = parseCSVLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

export function loadOccupationIndex() {
  if (cachedIndex) return cachedIndex

  const rows = parseCSV(readFileSync(JOBS_MASTER_OCCUPATIONS_CSV_PATH, 'utf-8')).map(row => ({
    title: row.title,
    slug: row.slug,
    socCode: row.soc_code || undefined,
    category: row.category || undefined,
    url: row.url || undefined,
    outlook: row.outlook_pct ? Number(row.outlook_pct) : undefined,
    outlookDesc: row.outlook_desc || undefined,
  }))

  cachedIndex = {
    rows,
    bySlug: new Map(rows.map(row => [row.slug, row])),
    byTitle: new Map(rows.map(row => [row.title, row])),
    byURL: new Map(rows.filter(row => row.url).map(row => [row.url, row])),
  }

  return cachedIndex
}

export function occupationMetadataFor(occupation) {
  const index = loadOccupationIndex()
  return index.bySlug.get(occupation.slug)
    || index.byURL.get(occupation.url)
    || index.byTitle.get(occupation.title)
    || null
}
