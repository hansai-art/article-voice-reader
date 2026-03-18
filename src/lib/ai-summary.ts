import { getApiKey, getApiProvider, ApiProvider } from './storage';

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
}

/**
 * Generate article summary using configured AI provider.
 */
export async function generateSummary(
  content: string,
  lang: 'zh-TW' | 'en'
): Promise<SummaryResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('NO_API_KEY');

  const provider = getApiProvider();
  const prompt = lang === 'zh-TW'
    ? `請幫我摘要以下文章，用繁體中文回覆。格式：先用 2-3 句話總結全文，然後列出 3-5 個重點（每個重點一行，用 "- " 開頭）。\n\n文章內容：\n${content.slice(0, 15000)}`
    : `Summarize the following article. Format: 2-3 sentence summary, then 3-5 key points (each on a new line, starting with "- ").\n\nArticle:\n${content.slice(0, 15000)}`;

  if (provider === 'gemini') {
    return callGemini(apiKey, prompt);
  } else {
    return callOpenAI(apiKey, prompt);
  }
}

async function callGemini(apiKey: string, prompt: string): Promise<SummaryResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error('[AI Summary] Gemini error:', err);
    throw new Error(`GEMINI_ERROR: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseResponse(text);
}

async function callOpenAI(apiKey: string, prompt: string): Promise<SummaryResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[AI Summary] OpenAI error:', err);
    throw new Error(`OPENAI_ERROR: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return parseResponse(text);
}

function parseResponse(text: string): SummaryResult {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const keyPoints: string[] = [];
  const summaryLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ')) {
      keyPoints.push(line.replace(/^[-•*]\s*/, ''));
    } else if (!line.startsWith('#')) {
      summaryLines.push(line);
    }
  }

  return {
    summary: summaryLines.join('\n'),
    keyPoints,
  };
}
