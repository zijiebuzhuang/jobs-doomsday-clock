import https from 'https';
import mammoth from 'mammoth';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN;
const MODEL = 'qwen-plus';
const MAX_RESUME_CHARS = 12000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!DASHSCOPE_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const payload = await parseRequest(req);
    const resumeText = await resolveResumeText(payload);

    if (!resumeText || resumeText.trim().length < 80) {
      return res.status(400).json({ error: 'Unable to read enough resume content' });
    }

    if (!looksLikeResumeContent(resumeText)) {
      return res.status(422).json({
        code: 'non_resume_content',
        error: 'Content does not look like a resume'
      });
    }

    const prompt = buildPrompt({
      resumeText: resumeText.slice(0, MAX_RESUME_CHARS),
      assessmentOccupation: payload.assessmentOccupation,
      assessmentRiskScore: payload.assessmentRiskScore
    });
    const completion = await callQwen(prompt);
    const profile = parseProfile(completion);

    return res.status(200).json(profile);
  } catch (error) {
    console.error('Resume profile generation error:', error);
    return res.status(500).json({ error: 'Failed to generate resume profile' });
  }
}

async function parseRequest(req) {
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('multipart/form-data')) {
    const boundary = getBoundary(contentType);
    if (!boundary) {
      throw new Error('Missing multipart boundary');
    }

    const body = await readRequestBody(req);
    return parseMultipart(body, boundary);
  }

  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  const body = await readRequestBody(req);
  const text = body.toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function resolveResumeText(payload) {
  if (payload.file?.data?.length) {
    return extractTextFromFile(payload.file);
  }

  if (payload.resumeURL) {
    return fetchResumeURL(payload.resumeURL);
  }

  return '';
}

async function extractTextFromFile(file) {
  const filename = (file.filename || '').toLowerCase();
  const mimeType = file.mimeType || '';

  if (filename.endsWith('.docx') || mimeType.includes('wordprocessingml')) {
    const result = await mammoth.extractRawText({ buffer: file.data });
    return result.value || '';
  }

  if (filename.endsWith('.pdf') || mimeType === 'application/pdf') {
    return extractPDFText(file.data);
  }

  if (filename.endsWith('.txt') || mimeType.startsWith('text/')) {
    return file.data.toString('utf8');
  }

  if (filename.endsWith('.rtf') || mimeType.includes('rtf')) {
    return file.data
      .toString('utf8')
      .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
      .replace(/\\[a-zA-Z]+-?\\d* ?/g, ' ')
      .replace(/[{}]/g, ' ');
  }

  throw new Error('Unsupported resume file type');
}

async function fetchResumeURL(urlString) {
  const url = new URL(urlString);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Unsupported resume URL');
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Resume URL returned ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());

  if (contentType.includes('application/pdf') || url.pathname.toLowerCase().endsWith('.pdf')) {
    return extractPDFText(buffer);
  }

  const text = buffer.toString('utf8');
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractPDFText(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text || '';
}

function buildPrompt({ resumeText, assessmentOccupation, assessmentRiskScore }) {
  return `You are an AI career advisor. Analyze this resume and generate a concise career profile for an app called How Far.

Known app context:
- How Far helps users understand AI pressure on jobs, tasks, and skills.
- The tone should be calm, practical, and not alarmist.
${assessmentOccupation ? `- Existing assessment occupation: ${assessmentOccupation}` : ''}
${assessmentRiskScore ? `- Existing assessment risk score: ${assessmentRiskScore}` : ''}

Important interpretation rules:
- Treat the resume as the primary source of truth.
- Use the existing assessment only as optional background when the resume is vague.
- Do not force the resume into the assessment occupation if the resume points to a different target role.
- If the resume suggests multiple tracks or a mixed skill profile, reflect that breadth in coreSkills, pressureAreas, resilienceSignals, and nextMoves.
- Prefer concrete evidence from the resume over generic occupation assumptions.

Resume text:
${resumeText}

Generate ONLY valid JSON with this exact structure:
{
  "currentRole": "<most likely current role, target role, or multi-track direction from the resume>",
  "summary": "<1-2 sentence profile summary that captures the resume's actual skill mix>",
  "coreSkills": ["<skill/domain>", "<skill/domain>"],
  "pressureAreas": ["<resume-backed task/skill likely to face AI pressure>"],
  "resilienceSignals": ["<reason this profile may be resilient>"],
  "nextMoves": ["<specific practical next move>"]
}

Rules:
- Keep arrays to 3-5 items.
- Use short, readable phrases.
- Focus on skills, tasks, work patterns, and next steps.
- If the resume is vague, infer conservatively.
- If the content does not look like a resume, CV, professional profile, or portfolio, return conservative empty-profile language instead of inventing experience.
- Do not include markdown.
- Do not include personally identifying details.
- Do not mention exact employers, schools, phone numbers, emails, or addresses.`;
}

function looksLikeResumeContent(text) {
  const normalizedText = String(text || '').toLowerCase();
  const keywordGroups = [
    ['experience', 'employment', 'work history', 'professional experience', 'internship', '工作经历', '实习经历', '职业经历'],
    ['education', 'degree', 'university', 'college', 'school', '教育经历', '学历', '大学', '学院'],
    ['skills', 'technical skills', 'core skills', 'tools', 'certifications', '技能', '专业技能', '证书'],
    ['projects', 'portfolio', 'publications', 'summary', 'objective', '项目经历', '作品集', '自我评价', '求职意向']
  ];

  const matchedGroups = keywordGroups.filter((keywords) =>
    keywords.some((keyword) => normalizedText.includes(keyword))
  ).length;

  const contactSignal =
    normalizedText.includes('@') ||
    normalizedText.includes('linkedin') ||
    normalizedText.includes('github') ||
    normalizedText.includes('portfolio') ||
    normalizedText.includes('邮箱') ||
    normalizedText.includes('电话') ||
    normalizedText.includes('手机') ||
    normalizedText.includes('领英');

  return normalizedText.trim().length >= 160 && (matchedGroups >= 2 || (matchedGroups >= 1 && contactSignal));
}

async function callQwen(prompt) {
  const payload = JSON.stringify({
    model: MODEL,
    input: {
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI career advisor. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    },
    parameters: {
      result_format: 'message',
      temperature: 0.45,
      max_tokens: 1600
    }
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'dashscope.aliyuncs.com',
      path: '/api/v1/services/aigc/text-generation/generation',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const content = parsed.output?.choices?.[0]?.message?.content;
          if (content) {
            resolve(content);
          } else {
            reject(new Error('Invalid API response structure'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

function parseProfile(completion) {
  let jsonText = completion.trim();
  const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
  }

  const parsed = JSON.parse(jsonText);

  return {
    createdAt: new Date().toISOString(),
    currentRole: safeString(parsed.currentRole, 'Resume profile'),
    summary: safeString(
      parsed.summary,
      'Your resume adds more context to your career profile and recommendations.'
    ),
    coreSkills: safeArray(parsed.coreSkills, ['Domain knowledge', 'Communication', 'Workflow ownership']),
    pressureAreas: safeArray(parsed.pressureAreas, ['Routine documentation', 'Repeatable workflows']),
    resilienceSignals: safeArray(parsed.resilienceSignals, ['Domain context', 'Human judgment']),
    nextMoves: safeArray(parsed.nextMoves, ['Track signals related to your role and skills.'])
  };
}

function safeString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeArray(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const cleaned = value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
    .slice(0, 5);

  return cleaned.length ? cleaned : fallback;
}

function getBoundary(contentType) {
  return contentType
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('boundary='))
    ?.replace('boundary=', '');
}

function readRequestBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === 'string') {
    return Promise.resolve(Buffer.from(req.body));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(body, boundary) {
  const delimiter = `--${boundary}`;
  const parts = body.toString('binary').split(delimiter);
  const payload = {};

  for (const part of parts) {
    if (!part || part === '--\r\n' || part === '--') {
      continue;
    }

    const [rawHeaders, rawContent] = part.split('\r\n\r\n');
    if (!rawHeaders || rawContent === undefined) {
      continue;
    }

    const disposition = rawHeaders.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
    if (!disposition) {
      continue;
    }

    const name = disposition[1];
    const filename = disposition[2];
    const mimeType = rawHeaders.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream';
    const content = rawContent.replace(/\r\n$/, '');

    if (filename) {
      payload.file = {
        filename,
        mimeType,
        data: Buffer.from(content, 'binary')
      };
    } else {
      payload[name] = Buffer.from(content, 'binary').toString('utf8').trim();
    }
  }

  return payload;
}
