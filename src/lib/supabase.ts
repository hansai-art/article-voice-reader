import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

// Default Supabase config — can be overridden in settings
const DEFAULT_URL = 'https://xmbueuhnqivakmyoymru.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtYnVldWhucWl2YWtteW95bXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3OTI2NTgsImV4cCI6MjA4OTM2ODY1OH0.OIUopudla6IU0zVP3MXT9hLMVNPKPo3dd6-mQM5O9YM';

const SUPABASE_URL_KEY = 'article-reader-supabase-url';
const SUPABASE_ANON_KEY = 'article-reader-supabase-anon';

let client: SupabaseClient | null = null;

export function getSupabaseConfig() {
  return {
    url: localStorage.getItem(SUPABASE_URL_KEY) || DEFAULT_URL,
    anonKey: localStorage.getItem(SUPABASE_ANON_KEY) || DEFAULT_ANON_KEY,
  };
}

export function setSupabaseConfig(url: string, anonKey: string) {
  localStorage.setItem(SUPABASE_URL_KEY, url);
  localStorage.setItem(SUPABASE_ANON_KEY, anonKey);
  client = null;
}

export function getSupabase(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;

  if (!client) {
    client = createClient(url, anonKey);
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return true; // Always configured with defaults
}

// Auth
export async function signUp(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('NOT_CONFIGURED');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  // If email confirmation is disabled, session is returned and user is auto-logged-in
  if (data.session) {
    return data.user;
  }
  // Fallback: try sign in immediately (works if auto-confirm is on)
  try {
    const signInResult = await sb.auth.signInWithPassword({ email, password });
    if (signInResult.data.user) return signInResult.data.user;
  } catch {
    // ignore — email confirmation might be required
  }
  return data.user;
}

export async function signIn(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('NOT_CONFIGURED');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function getUser(): Promise<User | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user;
}

export function onAuthChange(callback: (user: User | null) => void) {
  const sb = getSupabase();
  if (!sb) return { unsubscribe: () => {} };
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return { unsubscribe: () => data.subscription.unsubscribe() };
}

// Get profile by username
export async function getProfileByUsername(username: string) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single();
  if (error) return null;
  return data;
}

// Get public articles by user ID
export async function getPublicArticles(userId: string) {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('articles')
    .select('*')
    .eq('user_id', userId)
    .eq('is_public', true)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data;
}

// Get user's own profile
export async function getMyProfile() {
  const user = await getUser();
  if (!user) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) return null;
  return data;
}

// Update profile
export async function updateProfile(updates: { username?: string; display_name?: string }) {
  const user = await getUser();
  if (!user) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('profiles')
    .upsert({ id: user.id, ...updates })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Toggle article public visibility
export async function toggleArticlePublic(articleId: string, isPublic: boolean) {
  const user = await getUser();
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return;
  await sb
    .from('articles')
    .update({ is_public: isPublic })
    .eq('article_id', articleId)
    .eq('user_id', user.id);
}

// Get a single public article by ID
export async function getPublicArticleById(articleId: string) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('articles')
    .select('*')
    .eq('article_id', articleId)
    .eq('is_public', true)
    .single();
  if (error) return null;
  return data;
}
