import { readFileSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { buildClockData } from './compute-clock.mjs'
import { loadOccupationIndex } from './occupation-metadata.mjs'

const ONET_CONTENT_MODEL_PATH = '/tmp/onet-content-model-reference.txt'
const ONET_SKILLS_PATH = '/tmp/onet-skills.txt'
const ONET_RELATED_OCCUPATIONS_PATH = '/tmp/onet-related-occupations.txt'
const OUTPUT_PATH = 'public/occupation-guidance.json'

const SKILL_IDS = [
  '2.A.1.a',
  '2.A.1.b',
  '2.A.1.c',
  '2.A.1.d',
  '2.A.1.e',
  '2.A.1.f',
  '2.A.2.a',
  '2.A.2.b',
  '2.A.2.c',
  '2.A.2.d',
  '2.B.1.a',
  '2.B.1.b',
  '2.B.1.c',
  '2.B.1.d',
  '2.B.1.e',
  '2.B.1.f',
  '2.B.2.i',
  '2.B.3.a',
  '2.B.3.b',
  '2.B.3.c',
  '2.B.3.d',
  '2.B.3.e',
  '2.B.3.g',
  '2.B.3.h',
  '2.B.3.j',
  '2.B.3.k',
  '2.B.3.l',
  '2.B.3.m',
  '2.B.4.e',
  '2.B.4.g',
  '2.B.4.h',
  '2.B.5.a',
  '2.B.5.b',
  '2.B.5.c',
  '2.B.5.d',
]

const UNIVERSAL_ADD_SKILLS = {
  high: [
    'AI tool orchestration',
    'Human-in-the-loop review',
    'Workflow redesign',
    'Cross-functional communication',
  ],
  medium: [
    'AI-assisted analysis',
    'Prompt design',
    'Quality control',
    'Client communication',
  ],
  low: [
    'AI literacy',
    'Process improvement',
    'Data interpretation',
  ],
}

const CATEGORY_ADD_SKILLS = {
  'computer-and-information-technology': ['Model evaluation', 'AI system integration', 'Data pipeline automation', 'Product judgment'],
  management: ['AI workflow governance', 'Decision cadence design', 'Cross-functional prioritization', 'Exception escalation'],
  'business-and-financial': ['Scenario modeling', 'Automation audit', 'Risk monitoring', 'Decision support design'],
  'office-and-administrative-support': ['Workflow automation', 'Exception handling', 'Records QA', 'Cross-functional coordination'],
  sales: ['CRM automation', 'Conversation QA', 'Renewal strategy', 'Account prioritization'],
  'media-and-communication': ['AI editing workflows', 'Audience analysis', 'Creative direction', 'Brand systems thinking'],
  'arts-and-design': ['Creative tooling orchestration', 'Design systems thinking', 'Review operations', 'Prompt iteration'],
  'education-training-and-library': ['AI-assisted instruction', 'Curriculum redesign', 'Learning analytics', 'Facilitation design'],
  'architecture-and-engineering': ['Simulation workflows', 'Design verification', 'CAD automation review', 'Systems modeling'],
  production: ['Process automation oversight', 'Quality exception handling', 'Systems monitoring', 'Throughput analysis'],
}

const PIVOT_CATEGORY_LABELS = {
  'computer-and-information-technology': ['Systems analyst', 'Cybersecurity analyst', 'Technical product manager'],
  management: ['Operations manager', 'Project manager', 'Business development manager'],
  'business-and-financial': ['Financial analyst', 'Risk analyst', 'Compliance manager'],
  'office-and-administrative-support': ['Operations coordinator', 'Executive assistant', 'Customer success specialist'],
  sales: ['Account executive', 'Revenue operations analyst', 'Customer success manager'],
  'media-and-communication': ['Content strategist', 'Communications manager', 'UX writer'],
  'arts-and-design': ['Product designer', 'Creative technologist', 'Brand strategist'],
  'education-training-and-library': ['Instructional designer', 'Learning experience designer', 'Program manager'],
  'architecture-and-engineering': ['Systems engineer', 'Quality engineer', 'Technical program manager'],
  production: ['Production planner', 'Quality specialist', 'Operations analyst'],
}

const CATEGORY_FALLBACK_SKILLS = {
  'computer-and-information-technology': [
    ['Systems Analysis', 4.1, 4.0, 'deepen'],
    ['Critical Thinking', 4.0, 4.0, 'deepen'],
    ['Active Learning', 3.8, 3.8, 'add'],
    ['Complex Problem Solving', 3.9, 3.8, 'deepen'],
    ['Technology Design', 3.5, 3.4, 'add'],
    ['Coordination', 3.2, 3.1, 'deepen'],
  ],
  'business-and-financial': [
    ['Critical Thinking', 4.1, 4.0, 'deepen'],
    ['Reading Comprehension', 4.0, 4.0, 'deepen'],
    ['Judgment and Decision Making', 3.8, 3.7, 'deepen'],
    ['Active Listening', 3.7, 3.7, 'deepen'],
    ['Coordination', 3.5, 3.4, 'deepen'],
    ['Operations Analysis', 3.4, 3.3, 'add'],
  ],
  'office-and-administrative-support': [
    ['Active Listening', 3.9, 3.8, 'deepen'],
    ['Reading Comprehension', 3.8, 3.8, 'deepen'],
    ['Coordination', 3.7, 3.6, 'deepen'],
    ['Service Orientation', 3.6, 3.5, 'deepen'],
    ['Monitoring', 3.5, 3.4, 'deepen'],
    ['Operations Analysis', 3.1, 3.0, 'add'],
  ],
  sales: [
    ['Active Listening', 4.0, 4.0, 'deepen'],
    ['Speaking', 4.0, 4.0, 'deepen'],
    ['Persuasion', 3.9, 3.8, 'deepen'],
    ['Negotiation', 3.8, 3.7, 'deepen'],
    ['Service Orientation', 3.7, 3.6, 'deepen'],
    ['Social Perceptiveness', 3.6, 3.5, 'deepen'],
  ],
  'media-and-communication': [
    ['Writing', 4.2, 4.1, 'deepen'],
    ['Active Listening', 3.9, 3.8, 'deepen'],
    ['Speaking', 3.9, 3.9, 'deepen'],
    ['Critical Thinking', 3.8, 3.8, 'deepen'],
    ['Social Perceptiveness', 3.6, 3.5, 'deepen'],
    ['Active Learning', 3.4, 3.4, 'add'],
  ],
  'arts-and-design': [
    ['Active Listening', 3.8, 3.7, 'deepen'],
    ['Critical Thinking', 3.8, 3.7, 'deepen'],
    ['Active Learning', 3.7, 3.6, 'add'],
    ['Technology Design', 3.6, 3.5, 'add'],
    ['Coordination', 3.4, 3.3, 'deepen'],
    ['Judgment and Decision Making', 3.4, 3.3, 'deepen'],
  ],
  'education-training-and-library': [
    ['Instructing', 4.2, 4.1, 'deepen'],
    ['Active Listening', 4.0, 3.9, 'deepen'],
    ['Speaking', 3.9, 3.9, 'deepen'],
    ['Learning Strategies', 3.8, 3.7, 'add'],
    ['Social Perceptiveness', 3.7, 3.6, 'deepen'],
    ['Active Learning', 3.6, 3.6, 'add'],
  ],
  'architecture-and-engineering': [
    ['Mathematics', 4.0, 3.9, 'deepen'],
    ['Critical Thinking', 4.0, 3.9, 'deepen'],
    ['Technology Design', 3.9, 3.8, 'add'],
    ['Systems Evaluation', 3.8, 3.7, 'deepen'],
    ['Complex Problem Solving', 3.8, 3.7, 'deepen'],
    ['Operations Analysis', 3.5, 3.4, 'add'],
  ],
  production: [
    ['Monitoring', 4.0, 3.9, 'deepen'],
    ['Operations Analysis', 3.8, 3.7, 'add'],
    ['Critical Thinking', 3.8, 3.7, 'deepen'],
    ['Coordination', 3.7, 3.6, 'deepen'],
    ['Quality Control Analysis', 3.7, 3.6, 'deepen'],
    ['Complex Problem Solving', 3.5, 3.4, 'deepen'],
  ],
  management: [
    ['Critical Thinking', 4.2, 4.1, 'deepen'],
    ['Coordination', 4.0, 3.9, 'deepen'],
    ['Judgment and Decision Making', 3.9, 3.8, 'deepen'],
    ['Monitoring', 3.8, 3.8, 'deepen'],
    ['Social Perceptiveness', 3.7, 3.6, 'deepen'],
    ['Operations Analysis', 3.5, 3.4, 'add'],
  ],
}

const TITLE_FALLBACK_SKILLS = [
  [/data scientist|database|software|web developer|computer support/i, CATEGORY_FALLBACK_SKILLS['computer-and-information-technology']],
  [/customer service|sales|account collector|client/i, CATEGORY_FALLBACK_SKILLS.sales],
  [/office clerk|secretar|administrative assistant|bookkeeping|financial clerk|medical records|health information/i, CATEGORY_FALLBACK_SKILLS['office-and-administrative-support']],
  [/marketing|advertising|communications|graphic|publisher/i, CATEGORY_FALLBACK_SKILLS['media-and-communication']],
  [/teacher|instructional|librar/i, CATEGORY_FALLBACK_SKILLS['education-training-and-library']],
  [/drafter|architect|engineer/i, CATEGORY_FALLBACK_SKILLS['architecture-and-engineering']],
]

function readTSV(path) {
  return readFileSync(path, 'utf-8')
    .trim()
    .split(/\r?\n/)
    .map(line => line.split('\t'))
}

function normalizeSOCCode(value) {
  return value ? value.replace(/\.\d+$/, '') : value
}

function loadReferenceMap() {
  const rows = readTSV(ONET_CONTENT_MODEL_PATH)
  const [header, ...data] = rows
  const elementIndex = header.indexOf('Element ID')
  const titleIndex = header.indexOf('Element Name')
  const map = new Map()

  for (const row of data) {
    const id = row[elementIndex]
    const title = row[titleIndex]
    if (SKILL_IDS.includes(id) && title) {
      map.set(id, title)
    }
  }

  return map
}

function loadSkillRatings(referenceMap) {
  const rows = readTSV(ONET_SKILLS_PATH)
  const [header, ...data] = rows
  const onetIndex = header.indexOf('O*NET-SOC Code')
  const elementIndex = header.indexOf('Element ID')
  const scaleIndex = header.indexOf('Scale ID')
  const valueIndex = header.indexOf('Data Value')
  const suppressIndex = header.indexOf('Recommend Suppress')
  const bySoc = new Map()

  for (const row of data) {
    const elementID = row[elementIndex]
    if (!referenceMap.has(elementID)) continue
    if (row[suppressIndex] === 'Y') continue

    const socCode = normalizeSOCCode(row[onetIndex])
    const scale = row[scaleIndex]
    const value = Number(row[valueIndex])
    if (!Number.isFinite(value)) continue

    const entry = bySoc.get(socCode) ?? new Map()
    const skill = entry.get(elementID) ?? { skillID: elementID, name: referenceMap.get(elementID) }

    if (scale === 'IM') skill.importance = value
    if (scale === 'LV') skill.level = value

    entry.set(elementID, skill)
    bySoc.set(socCode, entry)
  }

  return new Map(
    [...bySoc.entries()].map(([socCode, skillMap]) => [
      socCode,
      [...skillMap.values()]
        .filter(skill => skill.importance)
        .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    ])
  )
}

function loadRelatedOccupationMap() {
  const rows = readTSV(ONET_RELATED_OCCUPATIONS_PATH)
  const [header, ...data] = rows
  const sourceIndex = header.indexOf('O*NET-SOC Code')
  const relatedIndex = header.indexOf('Related O*NET-SOC Code')
  const tierIndex = header.indexOf('Relatedness Tier')
  const bySoc = new Map()

  for (const row of data) {
    const source = normalizeSOCCode(row[sourceIndex])
    const related = normalizeSOCCode(row[relatedIndex])
    const tier = row[tierIndex]
    if (!source || !related || !tier) continue
    const items = bySoc.get(source) ?? []
    items.push({ socCode: related, tier })
    bySoc.set(source, items)
  }

  return bySoc
}

function pressureBand(replacementRate) {
  if (replacementRate >= 80) return 'high'
  if (replacementRate >= 50) return 'medium'
  return 'low'
}

function skillBucket(skillName) {
  const value = skillName.toLowerCase()
  if (/(critical thinking|judg|decision|monitor|social perceptiveness|negotiation|persuasion|instructing|service orientation|complex problem)/.test(value)) {
    return 'deepen'
  }
  if (/(programming|operations analysis|systems analysis|systems evaluation|technology design|mathematics|science|learning strategies)/.test(value)) {
    return 'add'
  }
  return 'deepen'
}

function targetEmphasis(skill, band, bucket = skillBucket(skill.name)) {
  const importance = skill.importance ?? 0
  const base = Math.min(5, importance)

  if (band === 'high') {
    return bucket === 'deepen' ? Math.min(5, base + 0.9) : Math.min(5, base + 1.3)
  }
  if (band === 'medium') {
    return bucket === 'deepen' ? Math.min(5, base + 0.6) : Math.min(5, base + 0.9)
  }
  return bucket === 'deepen' ? Math.min(5, base + 0.4) : Math.min(5, base + 0.5)
}

function uniqueStrings(items, limit) {
  const seen = new Set()
  const output = []

  for (const item of items) {
    const value = String(item).trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    output.push(value)
    if (output.length >= limit) break
  }

  return output
}

function currentSkillsFor(skills, band) {
  return skills.slice(0, 6).map(skill => ({
    name: skill.name,
    importance: Math.round((skill.importance ?? 0) * 10) / 10,
    level: skill.level == null ? null : Math.round(skill.level * 10) / 10,
    bucket: skillBucket(skill.name),
    targetEmphasis: Math.round(targetEmphasis(skill, band) * 10) / 10,
  }))
}

function fallbackCurrentSkillsFor(occupation, band) {
  const title = occupation.title.toLowerCase()
  const template = TITLE_FALLBACK_SKILLS.find(([pattern]) => pattern.test(title))?.[1]
    ?? CATEGORY_FALLBACK_SKILLS[occupation.category]
    ?? CATEGORY_FALLBACK_SKILLS.management

  return template.map(([name, importance, level, bucket]) => ({
    name,
    importance,
    level,
    bucket,
    targetEmphasis: Math.round(targetEmphasis({ name, importance }, band, bucket) * 10) / 10,
  }))
}

function guidanceSourceFor(skills) {
  return skills.length > 0 ? 'exact' : 'estimated'
}

function categoryAddSkillsFor(occupation) {
  const title = occupation.title.toLowerCase()
  if (/data scientist|database|software|web developer|computer support/.test(title)) {
    return CATEGORY_ADD_SKILLS['computer-and-information-technology']
  }
  if (/customer service|sales|account collector|client/.test(title)) {
    return CATEGORY_ADD_SKILLS.sales
  }
  if (/office clerk|secretar|administrative assistant|bookkeeping|financial clerk|medical records|health information/.test(title)) {
    return CATEGORY_ADD_SKILLS['office-and-administrative-support']
  }
  if (/marketing|advertising|communications|graphic|publisher/.test(title)) {
    return CATEGORY_ADD_SKILLS['media-and-communication']
  }
  if (/teacher|instructional|librar/.test(title)) {
    return CATEGORY_ADD_SKILLS['education-training-and-library']
  }
  if (/drafter|architect|engineer/.test(title)) {
    return CATEGORY_ADD_SKILLS['architecture-and-engineering']
  }
  return CATEGORY_ADD_SKILLS[occupation.category] ?? []
}

function recommendedAddsFor(occupation, band, currentSkills) {
  const currentNames = new Set(currentSkills.map(skill => skill.name))
  return uniqueStrings(
    [
      ...categoryAddSkillsFor(occupation),
      ...UNIVERSAL_ADD_SKILLS[band],
    ].filter(skill => !currentNames.has(skill)),
    4
  )
}

function headlineFor(occupation, band) {
  if (band === 'high') {
    return `AI pressure is high for ${occupation.title}. Differentiate through judgment, client trust, and workflow ownership.`
  }
  if (band === 'medium') {
    return `${occupation.title} is moving into an AI-augmented workflow. Deepen high-value skills and add AI coordination habits early.`
  }
  return `${occupation.title} still has room to compound advantage. Add AI fluency without losing core domain depth.`
}

function explanationFor(occupation, band, source) {
  const estimateNote = source === 'estimated'
    ? ' This profile is estimated from adjacent roles in the same occupation family.'
    : ''

  if (band === 'high') {
    return `This chart compares the skills this role relies on today with the ones worth emphasizing as automation pressure rises. Prioritize client-facing judgment, quality control, and adjacent roles where the same domain knowledge stays valuable.${estimateNote}`
  }
  if (band === 'medium') {
    return `This chart shows which core skills still matter and which ones deserve more emphasis as AI tools become part of the job. The goal is not to abandon the role, but to shift toward higher-trust and higher-coordination work.${estimateNote}`
  }
  return `This chart highlights the current skill base for this role and the areas that can strengthen long-term resilience. Small upgrades in AI literacy, process redesign, and analysis create an early edge.${estimateNote}`
}

function pivotRolesFor(sourceOccupation, relatedOccupations, occupationsBySOC, band) {
  const fallback = PIVOT_CATEGORY_LABELS[sourceOccupation.category] ?? ['Operations analyst', 'Program coordinator', 'Client success manager']
  const tierRank = { High: 0, Medium: 1, Low: 2 }

  const relatedMatches = (relatedOccupations ?? [])
    .map(item => ({ item, occupation: occupationsBySOC.get(item.socCode) }))
    .filter(({ occupation }) => occupation)
    .filter(({ occupation }) => occupation.title !== sourceOccupation.title)
    .sort((a, b) => {
      const tierDiff = (tierRank[a.item.tier] ?? 3) - (tierRank[b.item.tier] ?? 3)
      if (tierDiff !== 0) return tierDiff
      return a.occupation.exposure - b.occupation.exposure || (b.occupation.outlook ?? -99) - (a.occupation.outlook ?? -99)
    })
    .map(({ occupation }) => occupation.title)

  const combined = band === 'high'
    ? [...relatedMatches, ...fallback]
    : [...fallback, ...relatedMatches]

  return uniqueStrings(combined, 3)
}

function deepenSkillsFor(currentSkills, band) {
  const deepen = currentSkills
    .filter(skill => skill.bucket === 'deepen')
    .sort((a, b) => b.targetEmphasis - a.targetEmphasis)
    .map(skill => skill.name)

  if (deepen.length >= 3) return deepen.slice(0, 3)

  const extras = band === 'high'
    ? ['Decision quality', 'Stakeholder communication', 'Exception handling']
    : ['Communication', 'Problem framing', 'Quality control']

  return uniqueStrings([...deepen, ...extras], 3)
}

export function buildOccupationGuidance() {
  const clockData = buildClockData()
  const referenceMap = loadReferenceMap()
  const skillRatings = loadSkillRatings(referenceMap)
  const relatedOccupationMap = loadRelatedOccupationMap()
  const occupationIndex = loadOccupationIndex()
  const occupationsBySOC = new Map(
    clockData.occupations
      .filter(occupation => occupation.socCode)
      .map(occupation => [occupation.socCode, occupation])
  )

  for (const row of occupationIndex.rows) {
    if (!row.socCode) continue
    if (occupationsBySOC.has(row.socCode)) continue
    occupationsBySOC.set(row.socCode, {
      title: row.title,
      slug: row.slug,
      socCode: row.socCode,
      exposure: Number.POSITIVE_INFINITY,
      jobs: 0,
      url: row.url ?? '',
      category: row.category,
      outlook: row.outlook,
      outlookDesc: row.outlookDesc,
    })
  }

  return clockData.occupations
    .filter(occupation => occupation.slug)
    .map(occupation => {
      const band = pressureBand(occupation.exposure * 10)
      const skills = occupation.socCode ? (skillRatings.get(occupation.socCode) ?? []) : []
      const source = guidanceSourceFor(skills)
      const currentSkills = source === 'exact'
        ? currentSkillsFor(skills, band)
        : fallbackCurrentSkillsFor(occupation, band)
      const relatedOccupations = occupation.socCode ? relatedOccupationMap.get(occupation.socCode) : []

      return {
        id: occupation.slug,
        slug: occupation.slug,
        socCode: occupation.socCode,
        title: occupation.title,
        pressureBand: band,
        source,
        headline: headlineFor(occupation, band),
        explanation: explanationFor(occupation, band, source),
        currentSkills,
        deepen: deepenSkillsFor(currentSkills, band),
        add: recommendedAddsFor(occupation, band, currentSkills),
        pivot: pivotRolesFor(occupation, relatedOccupations, occupationsBySOC, band),
      }
    })
}

async function main() {
  const guidance = buildOccupationGuidance()
  writeFileSync(OUTPUT_PATH, JSON.stringify(guidance, null, 2))
  console.log(`Generated occupation guidance for ${guidance.length} occupations.`)
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
