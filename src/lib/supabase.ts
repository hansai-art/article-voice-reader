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
