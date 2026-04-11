import { getSupabase, getUser } from './supabase';
import { Article, getArticles, saveArticle } from './storage';

type RemoteArticleRow = ReturnType<typeof toRemote> & {
  id: string;
  last_played_at?: number | null;
  created_at?: number | null;
  paragraph_index?: number | null;
  sentence_offset?: number | null;
  speed?: number | null;
  voice_uri?: string | null;
};

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  conflicts: number;
}

/**
 * Two-way sync articles between localStorage and Supabase.
 * Strategy: last-write-wins based on lastPlayedAt / createdAt timestamps.
 */
export async function syncArticles(): Promise<SyncResult> {
  const sb = getSupabase();
  const user = await getUser();
  if (!sb || !user) throw new Error('NOT_AUTHENTICATED');

  const local = getArticles();
  const localMap = new Map(local.map((a) => [a.id, a]));

  // Fetch remote articles
  const { data: remote, error } = await sb
    .from('articles')
    .select('*')
    .eq('user_id', user.id);

  if (error) throw error;

  const remoteRows = (remote ?? []) as RemoteArticleRow[];
  const remoteMap = new Map(remoteRows.map((article) => [article.article_id, article]));

  let uploaded = 0;
  let downloaded = 0;
  let conflicts = 0;

  // Upload local articles that don't exist remotely, or are newer
  for (const localArticle of local) {
    const remoteArticle = remoteMap.get(localArticle.id);
    if (!remoteArticle) {
      // Upload new
      await sb.from('articles').insert(toRemote(localArticle, user.id));
      uploaded++;
    } else {
      const localTime = Math.max(localArticle.lastPlayedAt, localArticle.createdAt);
      const remoteTime = Math.max(remoteArticle.last_played_at || 0, remoteArticle.created_at || 0);
      if (localTime > remoteTime) {
        await sb.from('articles').update(toRemote(localArticle, user.id)).eq('id', remoteArticle.id);
        uploaded++;
        conflicts++;
      }
    }
  }

  // Download remote articles that don't exist locally, or are newer
  for (const [articleId, remoteArticle] of remoteMap) {
    const localArticle = localMap.get(articleId);
    if (!localArticle) {
      // Download new
      saveArticle(fromRemote(remoteArticle));
      downloaded++;
    } else {
      const localTime = Math.max(localArticle.lastPlayedAt, localArticle.createdAt);
      const remoteTime = Math.max(remoteArticle.last_played_at || 0, remoteArticle.created_at || 0);
      if (remoteTime > localTime) {
        saveArticle(fromRemote(remoteArticle));
        downloaded++;
        conflicts++;
      }
    }
  }

  return { uploaded, downloaded, conflicts };
}

function toRemote(article: Article, userId: string) {
  return {
    user_id: userId,
    article_id: article.id,
    title: article.title,
    content: article.content,
    word_count: article.wordCount,
    paragraph_index: article.paragraphIndex,
    sentence_offset: article.sentenceOffset,
    speed: article.speed,
    voice_uri: article.voiceURI,
    last_played_at: article.lastPlayedAt,
    created_at: article.createdAt,
    is_public: true,
  };
}

function fromRemote(row: RemoteArticleRow): Article {
  return {
    id: row.article_id,
    title: row.title,
    content: row.content,
    wordCount: row.word_count,
    paragraphIndex: row.paragraph_index || 0,
    sentenceOffset: row.sentence_offset || 0,
    speed: row.speed || 1,
    voiceURI: row.voice_uri || '',
    lastPlayedAt: row.last_played_at || 0,
    createdAt: row.created_at || Date.now(),
  };
}
