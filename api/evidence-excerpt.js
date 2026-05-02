const MAX_HTML_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 60000;
const REQUEST_TIMEOUT_MS = 9000;

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

  try {
    const { sourceUrl, topic = '', title = '', summary = '' } = req.body || {};
    if (!sourceUrl || !isAllowedURL(sourceUrl)) {
      return res.status(400).json({ error: 'Valid sourceUrl is required' });
    }

    const article = await fetchArticleText(sourceUrl);
    const excerpt = findBestExcerpt({
      text: article.text,
      topic,
      title,
      summary
    });

    if (!excerpt) {
      return res.status(422).json({ error: 'No usable excerpt found' });
    }

    return res.status(200).json({
      ...excerpt,
      sourceUrl,
      sourceTitle: article.title || title || ''
    });
  } catch (error) {
    console.error('Evidence excerpt error:', error);
    return res.status(500).json({ error: 'Failed to load evidence excerpt' });
  }
}

function isAllowedURL(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !isPrivateHostname(url.hostname);
  } catch {
    return false;
  }
}

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' ||
    normalized.endsWith('.local') ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized);
}

async function fetchArticleText(sourceUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HowFarEvidenceBot/1.0; +https://jobdoomsday.tech)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7'
      }
    });

    if (!response.ok) {
      throw new Error(`Source returned ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('xml')) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return parseArticleHTML(text);
    }

    const chunks = [];
    let received = 0;
    while (received < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }

    const html = new TextDecoder('utf-8').decode(concatUint8Arrays(chunks, received));
    return parseArticleHTML(html);
  } finally {
    clearTimeout(timeout);
  }
}

function concatUint8Arrays(chunks, totalLength) {
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function parseArticleHTML(html) {
  const title = decodeHTML(
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    ''
  );

  const articleHTML =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
    html;

  const text = decodeHTML(articleHTML)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<\/(p|div|section|h[1-6]|li|blockquote)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  return { title, text };
}

function findBestExcerpt({ text, topic, title, summary }) {
  const normalizedTitle = normalizeText(title);
  const sentences = splitSentences(text).filter((sentence) => isUsableSentence(sentence, normalizedTitle));
  if (!sentences.length) return null;

  const queryTokens = tokenize([topic, title, summary].join(' '));
  if (!queryTokens.length) return null;

  let bestIndex = -1;
  let bestScore = 0;

  sentences.forEach((sentence, index) => {
    const sentenceTokens = tokenize(sentence);
    const tokenSet = new Set(sentenceTokens);
    let score = 0;
    for (const token of queryTokens) {
      if (tokenSet.has(token)) score += token.length > 5 ? 2 : 1;
    }

    if (sentence.length >= 70 && sentence.length <= 260) score += 1;
    if (sentence.length > 320) score -= 2;
    if (/subscribe|cookie|newsletter|sign up|advertisement/i.test(sentence)) score -= 4;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestIndex < 0 || bestScore < 2) return null;

  return {
    before: sentences[bestIndex - 1] || '',
    quote: sentences[bestIndex],
    after: sentences[bestIndex + 1] || ''
  };
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isUsableSentence(sentence, normalizedTitle = '') {
  if (sentence.length < 45 || sentence.length > 420) return false;
  if (!/[a-zA-Z\u4e00-\u9fff]/.test(sentence)) return false;
  if (normalizedTitle && normalizeText(sentence) === normalizedTitle) return false;
  if (/cookie|privacy policy|terms of use|all rights reserved|subscribe|sign in|log in/i.test(sentence)) return false;
  if (/^(share|follow|listen|watch|read more|advertisement|sponsored)\b/i.test(sentence)) return false;
  return true;
}

function tokenize(value) {
  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'when', 'where', 'which',
    'about', 'into', 'your', 'their', 'there', 'have', 'has', 'are', 'was', 'were', 'will',
    'now', 'how', 'why', 'can', 'could', 'would', 'should', 'does', 'did', 'doing', 'industry',
    'industries', 'change', 'changes', 'changing', 'happen', 'happening', '发生', '变化', '行业',
    '现在', '哪些', '什么', '相关'
  ]);

  return String(value || '')
    .toLowerCase()
    .match(/[a-z0-9]{2,}|[\u4e00-\u9fff]/g)
    ?.filter((token) => !stopwords.has(token))
    .slice(0, 40) || [];
}

function decodeHTML(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
