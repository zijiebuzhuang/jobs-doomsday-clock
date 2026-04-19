import https from 'https';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN;
const MODEL = 'qwen-plus';

export default async function handler(req, res) {
  // CORS headers
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

  const { occupation, tasks, skills, concerns } = req.body;

  if (!occupation || !tasks || !skills) {
    return res.status(400).json({ error: 'Missing required fields: occupation, tasks, skills' });
  }

  const prompt = buildPrompt(occupation, tasks, skills, concerns);

  try {
    const completion = await callQwen(prompt);
    const report = parseReport(completion, occupation);
    return res.status(200).json(report);
  } catch (error) {
    console.error('Assessment generation error:', error);
    return res.status(500).json({ error: 'Failed to generate assessment' });
  }
}

function buildPrompt(occupation, tasks, skills, concerns) {
  return `You are an AI career advisor analyzing job automation risk. Generate a personalized assessment report.

User Profile:
- Occupation: ${occupation}
- Main Tasks: ${tasks}
- Key Skills: ${skills}
${concerns ? `- Concerns: ${concerns}` : ''}

Generate a JSON report with this exact structure:
{
  "overallRiskScore": <number 0-100>,
  "riskLevel": "<low|moderate|high|critical>",
  "summary": "<2-3 sentence personalized summary>",
  "safeTasks": [
    {
      "task": "<task name>",
      "explanation": "<why this is harder to automate>"
    }
  ],
  "exposedTasks": [
    {
      "task": "<task name>",
      "explanation": "<why this is susceptible to AI>",
      "exposureScore": <number 0-100>
    }
  ],
  "recommendations": [
    {
      "title": "<recommendation title>",
      "description": "<specific actionable advice>",
      "priority": "<high|medium|low>"
    }
  ]
}

Guidelines:
- Risk score: 0-30 = low, 31-50 = moderate, 51-75 = high, 76-100 = critical
- Identify 2-4 safe tasks (human judgment, creativity, complex problem-solving)
- Identify 2-4 exposed tasks (routine, data processing, predictable patterns)
- Provide 3-5 specific, actionable recommendations
- Be honest but constructive
- Focus on adaptation strategies, not fear

Return ONLY valid JSON, no markdown formatting.`;
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
      temperature: 0.7,
      max_tokens: 2000
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

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.output?.choices?.[0]?.message?.content) {
            resolve(parsed.output.choices[0].message.content);
          } else {
            reject(new Error('Invalid API response structure'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function parseReport(completion, occupation) {
  // Try to extract JSON from markdown code blocks if present
  let jsonText = completion.trim();
  const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
  }

  const parsed = JSON.parse(jsonText);

  // Generate IDs and add required fields
  const report = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    occupation: occupation,
    overallRiskScore: parsed.overallRiskScore,
    riskLevel: parsed.riskLevel,
    summary: parsed.summary,
    safeTasks: (parsed.safeTasks || []).map(task => ({
      id: generateId(),
      task: task.task,
      explanation: task.explanation,
      exposureScore: null
    })),
    exposedTasks: (parsed.exposedTasks || []).map(task => ({
      id: generateId(),
      task: task.task,
      explanation: task.explanation,
      exposureScore: task.exposureScore || 50
    })),
    recommendations: (parsed.recommendations || []).map(rec => ({
      id: generateId(),
      title: rec.title,
      description: rec.description,
      priority: rec.priority
    }))
  };

  return report;
}

function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
