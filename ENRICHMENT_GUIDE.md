# Career Guidance Enrichment Guide

## Problem

The current guidance uses generic O*NET skill names (30 standardized competencies like "Active Listening", "Critical Thinking") that appear identically across different occupations. The "add" skills are category-level generic (only ~51 unique values across 341 occupations).

## Solution

A new LLM enrichment pass that adds occupation-specific skill labels and tailored "add" recommendations.

## Workflow

### 1. Generate deterministic guidance (existing pipeline)

```bash
npm run generate-guidance
```

This creates `public/occupation-guidance.json` with the stable, deterministic foundation.

### 2. Enrich with LLM (new step)

```bash
DASHSCOPE_API_KEY=sk-... npm run enrich-guidance
```

This reads `public/occupation-guidance.json`, sends each occupation to Qwen, and adds:
- `specificLabel` to each `currentSkill` (occupation-specific version of the generic O*NET name)
- Replaces the generic `add[]` array with 4 occupation-tailored skills

The enriched output overwrites `public/occupation-guidance.json`.

### 3. Test on a small sample first

```bash
# Create 3-occupation sample
node -e "
const data = JSON.parse(require('fs').readFileSync('public/occupation-guidance.json','utf-8'));
require('fs').writeFileSync('public/occupation-guidance-sample.json', JSON.stringify(data.slice(0, 3), null, 2));
"

# Run enrichment on sample
DASHSCOPE_API_KEY=sk-... node scripts/enrich-guidance-test.mjs

# Review output
cat public/occupation-guidance-sample-enriched.json
```

### 4. Full enrichment (341 occupations)

```bash
DASHSCOPE_API_KEY=sk-... npm run enrich-guidance
```

**Estimated time:** ~5 minutes (341 occupations × 800ms delay)

**Cost estimate:** ~341 requests × ~500 tokens each = ~170K tokens (~$0.03 at Qwen-turbo pricing)

## What Changes

### Before (generic)

```json
{
  "title": "Medical transcriptionists",
  "currentSkills": [
    {
      "name": "Active Listening",
      "importance": 4.1,
      "bucket": "deepen"
    }
  ],
  "add": [
    "AI tool orchestration",
    "Human-in-the-loop review",
    "Workflow redesign",
    "Cross-functional communication"
  ]
}
```

### After (occupation-specific)

```json
{
  "title": "Medical transcriptionists",
  "currentSkills": [
    {
      "name": "Active Listening",
      "specificLabel": "Medical dictation accuracy",
      "importance": 4.1,
      "bucket": "deepen"
    }
  ],
  "add": [
    "AI transcription QA",
    "Medical terminology validation",
    "EHR integration oversight",
    "Dictation workflow design"
  ]
}
```

## iOS Integration

The iOS app already supports the new structure:

- `CareerGuidanceSkill` model has `specificLabel: String?` field
- `displayName` computed property returns `specificLabel ?? name`
- UI uses `displayName` for chart labels and deepen list
- Backward compatible: if `specificLabel` is missing, falls back to generic `name`

## Deployment

1. Run enrichment locally (requires API key)
2. Commit the enriched `public/occupation-guidance.json`
3. Push to remote
4. Vercel deploys the enriched guidance
5. iOS app fetches and displays occupation-specific skills

## Maintenance

Re-run enrichment when:
- New occupations are added to the dataset
- O*NET skill ratings are updated
- Category definitions change
- You want to refine the LLM prompt for better specificity

The deterministic pipeline (`generate-guidance.mjs`) remains the stable foundation. Enrichment is an optional quality layer on top.
