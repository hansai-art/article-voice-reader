import { Readability } from '@mozilla/readability';
import { cleanText } from './tts';

const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

export interface ParsedArticle {
  title: string;
  content: string;
}

/**
 * Fetch a URL via CORS proxy and extract article content using Readability.
 */
export async function fetchArticleFromURL(url: string): Promise<ParsedArticle | null> {
  // Validate URL
  try {
    new URL(url);
  } catch {
    throw new Error('INVALID_URL');
  }

  // Try each CORS proxy
  let html: string | null = null;
  let lastError: Error | null = null;

  for (const proxyFn of CORS_PROXIES) {
    try {
      const proxyUrl = proxyFn(url);
      const response = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      html = await response.text();
      break;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      continue;
    }
  }

  if (!html) {
    console.error('[URL Parser] All CORS proxies failed:', lastError);
    throw new Error('FETCH_FAILED');
  }

  // Parse HTML with DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Fix relative URLs for base
  const baseEl = doc.createElement('base');
  baseEl.href = url;
  doc.head.appendChild(baseEl);

  // Extract article with Readability
  const article = new Readability(doc).parse();

  if (!article || !article.textContent || article.textContent.trim().length < 50) {
    throw new Error('NO_CONTENT');
  }

  // Clean the extracted text
  const content = cleanText(article.textContent);

  return {
    title: article.title || url,
    content,
  };
}
