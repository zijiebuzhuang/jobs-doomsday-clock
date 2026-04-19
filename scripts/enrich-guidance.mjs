/**
 * LLM enrichment pass for occupation guidance.
 * Reads the deterministic guidance output, sends each occupation to Qwen,
 * and adds occupation-specific skill labels + tailored "add" skill names.
 *
 * Keeps the deterministic pipeline as the stable foundation and layers
 * LLM-generated specificity on top.
 *
 * Usage:
 *   DASHSCOPE_API_KEY=... node scripts/enrich-guidance.mjs
 *
 * Adds to each currentSkill:
 *   "specificLabel": occupation-specific version of the generic O*NET name
 *
 * Replaces the generic add[] array with occupation-tailored recommendations.
 */
import { readFileSync, writeFileSync } from 'fs'
import { callLLM } from './fetch-news.mjs'

const GUIDANCE_PATH = 'public/occupation-guidance.json'
const BATCH_DELAY_MS = 800

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildPrompt(entry) {
  const skillNames = entry.currentSkills.map(s => s.name).join(', ')
  const addSkills = entry.add.join(', ')

  return `You are an expert career advisor specializing in AI's impact on occupations. Given an occupation and its generic O*NET skill labels, provide occupation-specific versions.

Occupation: ${entry.title}
Pressure band: ${entry.pressureBand} (${entry.pressureBand === 'high' ? '>=80% AI replacement exposure' : entry.pressureBand === 'medium' ? '50-79% exposure' : '<50% exposure'})
Category: ${entry.id}

Current generic O*NET skills (in order of importance):
${entry.currentSkills.map((s, i) => `${i + 1}. "${s.name}" (importance: ${s.importance}, bucket: ${s.bucket})`).join('\n')}

Current generic "add" skills: ${addSkills}

For each current skill, provide a "specificLabel" that describes what this skill concretely means for a ${entry.title.toLowerCase()}. The label should be 2-5 words, actionable and specific to this occupation's daily work. Do NOT just repeat the generic name. Do NOT use generic phrases like "in the field" or "for the role".

Also provide 4 occupation-specific "add" skills — new capabilities this specific role should develop as AI pressure rises. These should be concrete, practical, and distinct from the current skills. Each should be 2-5 words.

Examples of good specificLabel rewrites:
- "Active Listening" for Medical transcriptionists → "Medical dictation accuracy"
- "Critical Thinking" for Software developers → "Architecture decision-making"
- "Writing" for Graphic designers → "Design brief interpretation"
- "Active Listening" for Accountants → "Client needs assessment"

Examples of good occupation-specific add skills:
- Software developers: "AI code review triage", "Prompt-to-code validation", "Test generation oversight", "System design judgment"
- Graphic designers: "AI image curation", "Brand consistency QA", "Generative art direction", "Multi-tool asset pipeline"

Respond with ONLY valid JSON (no markdown):
{
  "specificLabels": ["label1", "label2", ...],
  "add": ["skill1", "skill2", "skill3", "skill4"]
}

The specificLabels array must have exactly ${entry.currentSkills.length} items, one for each current skill in order.
The add array must have exactly 4 items.`
}

async function enrichEntry(apiKey, entry) {
  const prompt = buildPrompt(entry)
  const raw = await callLLM(apiKey, prompt)
  const parsed = JSON.parse(raw.trim())

  if (!Array.isArray(parsed.specificLabels) || parsed.specificLabels.length !== entry.currentSkills.length) {
    throw new Error(`specificLabels count mismatch: expected ${entry.currentSkills.length}, got ${parsed.specificLabels?.length}`)
  }

  if (!Array.isArray(parsed.add) || parsed.add.length < 3) {
    throw new Error(`add skills too few: got ${parsed.add?.length}`)
  }

  // Merge specificLabels into currentSkills
  const enrichedSkills = entry.currentSkills.map((skill, i) => ({
    ...skill,
    specificLabel: String(parsed.specificLabels[i]).trim(),
  }))

  return {
    ...entry,
    currentSkills: enrichedSkills,
    add: parsed.add.slice(0, 4).map(s => String(s).trim()),
  }
}

async function main() {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN
  if (!apiKey) {
    console.error('Error: DASHSCOPE_API_KEY environment variable is required')
    process.exit(1)
  }

  const guidance = JSON.parse(readFileSync(GUIDANCE_PATH, 'utf-8'))
  console.log(`Loaded ${guidance.length} occupation guidance entries\n`)

  let enriched = 0
  let failed = 0

  for (let i = 0; i < guidance.length; i++) {
    const entry = guidance[i]
    const progress = `[${i + 1}/${guidance.length}]`

    try {
      guidance[i] = await enrichEntry(apiKey, entry)
      enriched++
      const labels = guidance[i].currentSkills.map(s => s.specificLabel).join(', ')
      console.log(`  ${progress} ${entry.title.slice(0, 50)}`)
      console.log(`    skills: ${labels}`)
      console.log(`    add: ${guidance[i].add.join(', ')}`)
    } catch (err) {
      failed++
      console.warn(`  ${progress} FAILED ${entry.title.slice(0, 40)} - ${err.message}`)
    }

    // Rate limiting
    if (i < guidance.length - 1) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  writeFileSync(GUIDANCE_PATH, JSON.stringify(guidance, null, 2))
  console.log(`\nDone. Enriched: ${enriched}, Failed: ${failed}`)
  console.log(`Saved to ${GUIDANCE_PATH}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
