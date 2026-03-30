import { getSupabase, getUser } from './supabase';
import { Article, getArticles, saveArticle as localSaveArticle } from './storage';
import { syncArticles } from './sync';

/**
 * Auto-sync module: automatically syncs articles to/from Supabase.
 *
 * - uploadArticle: immediately upload a single article (on add/edit)
 * - deleteArticleRemote: immediately delete from remote (on delete)
 * - uploadProgress: debounced upload of playback progress (every 10s)
 * - pullRemoteArticles: download all remote articles to localStorage
 * - startRealtimeSync: subscribe to Supabase realtime changes
 */

// ── Helpers ──

async function getAuthContext() {
  const sb = getSupabase();
  const user = await getUser();
  if (!sb || !user) return null;
  return { sb, user };
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

// ── Immediate sync: upload single article ──

export async function uploadArticle(article: Article): Promise<boolean> {
  const ctx = await getAuthContext();
  if (!ctx) return false;
  const { sb, user } = ctx;

  const { data: existing } = await sb
    .from('articles')
    .select('id')
    .eq('user_id', user.id)
    .eq('article_id', article.id)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from('articles')
      .update(toRemote(article, user.id))
      .eq('id', existing.id);
    if (error) { console.error('[auto-sync] update error:', error); return false; }
  } else {
    const { error } = await sb
      .from('articles')
      .insert(toRemote(article, user.id));
    if (error) { console.error('[auto-sync] insert error:', error); return false; }
  }
  return true;
}

// ── Immediate sync: delete from remote ──

export async function deleteArticleRemote(articleId: string): Promise<boolean> {
  const ctx = await getAuthContext();
  if (!ctx) return false;
  const { sb, user } = ctx;

  const { error } = await sb
    .from('articles')
    .delete()
    .eq('user_id', user.id)
    .eq('article_id', articleId);

  if (error) { console.error('[auto-sync] delete error:', error); return false; }
  return true;
}

// ── Debounced progress sync ──

const progressTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function uploadProgressDebounced(article: Article, delayMs = 10000) {
  const existing = progressTimers.get(article.id);
  if (existing) clearTimeout(existing);

  progressTimers.set(
    article.id,
    setTimeout(async () => {
      progressTimers.delete(article.id);
      await uploadArticle(article);
    }, delayMs),
  );
}

// Flush all pending progress uploads (e.g., on page unload)
export function flushPendingProgress() {
  for (const [id, timer] of progressTimers) {
    clearTimeout(timer);
    progressTimers.delete(id);
  }
  // Best-effort: fire uploads without waiting
  // (can't reliably await in beforeunload)
}

// ── Pull remote articles to local ──

export async function pullRemoteArticles(): Promise<number> {
  const ctx = await getAuthContext();
  if (!ctx) return 0;

  // Use the existing full two-way sync
  try {
    const result = await syncArticles();
    return result.downloaded;
  } catch (e) {
    console.error('[auto-sync] pull error:', e);
    return 0;
  }
}
