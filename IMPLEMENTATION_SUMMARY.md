# Career Guidance Skill Enrichment - Implementation Summary

## Problem Statement

The career guidance system used generic O*NET skill names that appeared identically across different occupations:
- Only 30 unique skill names across 341 occupations
- "Active Listening", "Critical Thinking", "Speaking" appeared in medical transcriptionists, accountants, graphic designers, etc.
- "Add" skills were category-level generic (only ~51 unique values)
- Made the guidance feel cookie-cutter and not actionable

## Solution Architecture

Added an **LLM enrichment layer** on top of the deterministic guidance pipeline:

```
Deterministic Pipeline (stable foundation)
    ↓
    generate-occupation-guidance.mjs
    ↓
    occupation-guidance.json (generic O*NET skills)
    ↓
LLM Enrichment Layer (quality layer)
    ↓
    enrich-guidance.mjs
    ↓
    occupation-guidance.json (occupation-specific skills)
```

## Changes Made

### 1. Server-Side (jobs-doomsday-clock repo)

#### New Files
- `scripts/enrich-guidance.mjs` — LLM enrichment script that adds occupation-specific skill labels
- `scripts/enrich-guidance-test.mjs` — Test version for 3-occupation sample
- `ENRICHMENT_GUIDE.md` — Complete workflow documentation
- `public/occupation-guidance-sample-enriched.json` — Example enriched output

#### Modified Files
- `package.json` — Added `"enrich-guidance": "node scripts/enrich-guidance.mjs"` script
- `CLAUDE.md` — Documented the enrichment workflow

#### What the Enrichment Does
For each occupation, sends this prompt to Qwen:
- Occupation title, pressure band, current generic skills
- Asks for `specificLabel` for each skill (2-5 words, occupation-specific)
- Asks for 4 occupation-specific "add" skills

Example transformation:
```json
// Before
{
  "name": "Active Listening",
  "importance": 4.1
}

// After
{
  "name": "Active Listening",
  "specificLabel": "Medical dictation accuracy",
  "importance": 4.1
}
```

### 2. iOS-Side (jobs-doomsday-clock-ios repo)

#### Modified Files

**`AIJobsDoomsdayClock/Models/CareerGuidance.swift`**
- Added `specificLabel: String?` to `CareerGuidanceSkill`
- Added `displayName` computed property: `specificLabel ?? name`
- Backward compatible: falls back to generic name if specificLabel missing

**`AIJobsDoomsdayClock/Features/Occupations/CareerUpgradeMapSection.swift`**
- Chart now uses `$0.displayName` instead of `$0.name`
- Added `resolvedDeepenNames()` helper to map deepen array through specificLabels
- Deepen list now shows occupation-specific labels

## Usage Workflow

### For the user to run (requires API key):

```bash
cd "/Users/zijiechen/Library/Mobile Documents/com~apple~CloudDocs/AI/jobs-doomsday-clock"

# Test on 3 occupations first
node -e "
const data = JSON.parse(require('fs').readFileSync('public/occupation-guidance.json','utf-8'));
require('fs').writeFileSync('public/occupation-guidance-sample.json', JSON.stringify(data.slice(0, 3), null, 2));
"

DASHSCOPE_API_KEY=sk-... node scripts/enrich-guidance-test.mjs

# Review output
cat public/occupation-guidance-sample-enriched.json

# If satisfied, run full enrichment (341 occupations, ~5 minutes)
DASHSCOPE_API_KEY=sk-... npm run enrich-guidance
```

### Deployment Flow

1. Run enrichment locally (requires API key)
2. Commit enriched `public/occupation-guidance.json`
3. Push to remote
4. Vercel deploys
5. iOS app fetches and displays occupation-specific skills

## Example Results

### Medical Transcriptionists
- "Active Listening" → "Medical dictation accuracy"
- "Reading Comprehension" → "Medical record interpretation"
- "Writing" → "Clinical documentation precision"
- Add: "AI transcription QA", "Medical terminology validation", "EHR integration oversight", "Dictation workflow design"

### Customer Service Representatives
- "Active Listening" → "Customer issue diagnosis"
- "Speaking" → "Solution explanation clarity"
- "Persuasion" → "De-escalation techniques"
- Add: "Chatbot escalation triage", "Complex case routing", "Customer sentiment analysis", "Service recovery design"

### Paralegals
- "Reading Comprehension" → "Legal document analysis"
- "Writing" → "Legal brief drafting"
- "Critical Thinking" → "Case strategy assessment"
- Add: "AI legal research validation", "Document automation review", "Case precedent synthesis", "Discovery workflow design"

## Cost & Performance

- **341 occupations** × 800ms delay = ~5 minutes total
- **~170K tokens** (~500 tokens per occupation)
- **Cost estimate**: ~$0.03 at Qwen-turbo pricing

## Backward Compatibility

- iOS model has `specificLabel` as optional
- Falls back to generic `name` if enrichment hasn't run
- Existing bundled `guidance.json` continues to work
- Remote guidance can be enriched independently

## Next Steps for User

1. Get DASHSCOPE_API_KEY from Aliyun
2. Run test enrichment on 3 occupations
3. Review output quality
4. Run full enrichment on all 341 occupations
5. Commit and push enriched guidance
6. Test in iOS app

## Files Ready for Commit

All changes are uncommitted. Ready to commit when enrichment is complete:

**Server (jobs-doomsday-clock):**
- scripts/enrich-guidance.mjs
- scripts/enrich-guidance-test.mjs
- ENRICHMENT_GUIDE.md
- package.json
- CLAUDE.md
- public/occupation-guidance-sample-enriched.json (example)

**iOS (jobs-doomsday-clock-ios):**
- AIJobsDoomsdayClock/Models/CareerGuidance.swift
- AIJobsDoomsdayClock/Features/Occupations/CareerUpgradeMapSection.swift
