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
}

const ARTICLES_KEY = 'article-reader-articles';
const LAST_PLAYED_KEY = 'article-reader-last-played';

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
    speed: 1.0,
    voiceURI: '',
    lastPlayedAt: 0,
    createdAt: Date.now(),
  };
}
