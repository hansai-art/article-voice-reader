import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

const SUPABASE_URL_KEY = 'article-reader-supabase-url';
const SUPABASE_ANON_KEY = 'article-reader-supabase-anon';

let client: SupabaseClient | null = null;

export function getSupabaseConfig() {
  return {
    url: localStorage.getItem(SUPABASE_URL_KEY) || '',
    anonKey: localStorage.getItem(SUPABASE_ANON_KEY) || '',
  };
}

export function setSupabaseConfig(url: string, anonKey: string) {
  localStorage.setItem(SUPABASE_URL_KEY, url);
  localStorage.setItem(SUPABASE_ANON_KEY, anonKey);
  client = null; // Reset client
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
  const { url, anonKey } = getSupabaseConfig();
  return !!(url && anonKey);
}

// Auth
export async function signUp(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('NOT_CONFIGURED');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
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
