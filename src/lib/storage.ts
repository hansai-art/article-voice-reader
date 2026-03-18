export interface Article {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  paragraphIndex: number;
  sentenceOffset: number;
  speed: number;
  voiceURI: string;
  lastPlayedAt: number;
  createdAt: number;
  bookmarks?: number[]; // bookmarked paragraph indices
}

const ARTICLES_KEY = 'article-reader-articles';
const LAST_PLAYED_KEY = 'article-reader-last-played';
const GLOBAL_SPEED_KEY = 'article-reader-global-speed';
const FONT_SIZE_KEY = 'article-reader-font-size';

export function getArticles(): Article[] {
  try {
    return JSON.parse(localStorage.getItem(ARTICLES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveArticle(article: Article) {
  const articles = getArticles();
  const idx = articles.findIndex((a) => a.id === article.id);
  if (idx >= 0) articles[idx] = article;
  else articles.unshift(article);
  localStorage.setItem(ARTICLES_KEY, JSON.stringify(articles));
}

export function deleteArticle(id: string) {
  const articles = getArticles().filter((a) => a.id !== id);
  localStorage.setItem(ARTICLES_KEY, JSON.stringify(articles));
  if (getLastPlayedId() === id) localStorage.removeItem(LAST_PLAYED_KEY);
}

export function getArticle(id: string): Article | undefined {
  return getArticles().find((a) => a.id === id);
}

export function setLastPlayedId(id: string) {
  localStorage.setItem(LAST_PLAYED_KEY, id);
}

export function getLastPlayedId(): string | null {
  return localStorage.getItem(LAST_PLAYED_KEY);
}

export function createArticle(content: string, title?: string): Article {
  const wordCount = content.length;
  const autoTitle = title || content.slice(0, 20).replace(/\n/g, ' ').trim() || 'Untitled';
  return {
    id: crypto.randomUUID(),
    title: autoTitle,
    content,
    wordCount,
    paragraphIndex: 0,
    sentenceOffset: 0,
    speed: getGlobalSpeed(),
    voiceURI: '',
    lastPlayedAt: 0,
    createdAt: Date.now(),
  };
}

// Global speed preference
export function getGlobalSpeed(): number {
  try {
    const v = parseFloat(localStorage.getItem(GLOBAL_SPEED_KEY) || '1');
    return isNaN(v) ? 1 : v;
  } catch {
    return 1;
  }
}

export function setGlobalSpeed(speed: number) {
  localStorage.setItem(GLOBAL_SPEED_KEY, speed.toString());
}

// Font size preference
export function getFontSize(): number {
  try {
    const v = parseInt(localStorage.getItem(FONT_SIZE_KEY) || '16', 10);
    return isNaN(v) ? 16 : v;
  } catch {
    return 16;
  }
}

export function setFontSize(size: number) {
  localStorage.setItem(FONT_SIZE_KEY, size.toString());
}

// API Key storage
const API_KEY_KEY = 'article-reader-api-key';
const API_PROVIDER_KEY = 'article-reader-api-provider';

export type ApiProvider = 'gemini' | 'openai';

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_KEY) || '';
}

export function setApiKey(key: string) {
  localStorage.setItem(API_KEY_KEY, key);
}

export function getApiProvider(): ApiProvider {
  return (localStorage.getItem(API_PROVIDER_KEY) as ApiProvider) || 'gemini';
}

export function setApiProvider(provider: ApiProvider) {
  localStorage.setItem(API_PROVIDER_KEY, provider);
}

// TTS engine preference: 'browser' (Web Speech API) or 'openai' (OpenAI TTS)
const TTS_ENGINE_KEY = 'article-reader-tts-engine';
const OPENAI_VOICE_KEY = 'article-reader-openai-voice';

export type TTSEngineType = 'browser' | 'openai';

export function getTTSEngine(): TTSEngineType {
  return (localStorage.getItem(TTS_ENGINE_KEY) as TTSEngineType) || 'browser';
}

export function setTTSEngine(engine: TTSEngineType) {
  localStorage.setItem(TTS_ENGINE_KEY, engine);
}

export function getOpenAIVoicePref(): string {
  return localStorage.getItem(OPENAI_VOICE_KEY) || 'nova';
}

export function setOpenAIVoicePref(voice: string) {
  localStorage.setItem(OPENAI_VOICE_KEY, voice);
}

// Reading statistics
const STATS_KEY = 'article-reader-stats';

export interface ReadingStats {
  totalArticles: number;
  completedArticles: number;
  totalMinutesListened: number;
  lastSessionDate: string;
}

export function getReadingStats(): ReadingStats {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) || '{}') as ReadingStats;
  } catch {
    return { totalArticles: 0, completedArticles: 0, totalMinutesListened: 0, lastSessionDate: '' };
  }
}

export function updateReadingStats(minutesListened: number, completed: boolean = false) {
  const stats = getReadingStats();
  const articles = getArticles();
  stats.totalArticles = articles.length;
  stats.totalMinutesListened = (stats.totalMinutesListened || 0) + minutesListened;
  if (completed) stats.completedArticles = (stats.completedArticles || 0) + 1;
  stats.lastSessionDate = new Date().toISOString().slice(0, 10);
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// Export all articles as JSON
export function exportArticles(): string {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    articles: getArticles(),
  };
  return JSON.stringify(data, null, 2);
}

// Import articles from JSON, merging with existing (skip duplicates by id)
export function importArticles(json: string): { imported: number; skipped: number } {
  const data = JSON.parse(json);
  const incoming: Article[] = data.articles || [];
  const existing = getArticles();
  const existingIds = new Set(existing.map((a) => a.id));

  let imported = 0;
  let skipped = 0;

  for (const article of incoming) {
    if (existingIds.has(article.id)) {
      skipped++;
    } else {
      existing.unshift(article);
      imported++;
    }
  }

  localStorage.setItem(ARTICLES_KEY, JSON.stringify(existing));
  return { imported, skipped };
}
