import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Key, Cloud, Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/hooks/useLanguage';
import {
  getApiKey, setApiKey as saveApiKey,
  getApiProvider, setApiProvider as saveApiProvider,
  ApiProvider,
} from '@/lib/storage';
import {
  getSupabaseConfig, setSupabaseConfig,
  isSupabaseConfigured, signIn, signUp, signOut, getUser,
} from '@/lib/supabase';
import { syncArticles } from '@/lib/sync';
import { toast } from '@/hooks/use-toast';
import type { User } from '@supabase/supabase-js';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  // AI settings
  const [apiKey, setApiKey] = useState(getApiKey());
  const [provider, setProvider] = useState<ApiProvider>(getApiProvider());
  const [showKey, setShowKey] = useState(false);

  // Supabase settings
  const config = getSupabaseConfig();
  const [sbUrl, setSbUrl] = useState(config.url);
  const [sbKey, setSbKey] = useState(config.anonKey);
  const [showSbKey, setShowSbKey] = useState(false);

  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    if (isSupabaseConfigured()) {
      getUser().then(setUser);
    }
  }, []);

  const handleSaveApiKey = () => {
    saveApiKey(apiKey.trim());
    saveApiProvider(provider);
    toast({ title: t('settingsSaved'), duration: 2000 });
  };

  const handleSaveSupabase = () => {
    setSupabaseConfig(sbUrl.trim(), sbKey.trim());
    toast({ title: t('settingsSaved'), duration: 2000 });
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setAuthLoading(true);
    try {
      const u = await signIn(email, password);
      setUser(u);
      toast({ title: t('loginSuccess') });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: t('loginError'), description: msg, variant: 'destructive' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password) return;
    setAuthLoading(true);
    try {
      await signUp(email, password);
      toast({ title: t('registerSuccess'), duration: 5000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: t('loginError'), description: msg, variant: 'destructive' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    setUser(null);
  };

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      const result = await syncArticles();
      toast({
        title: t('syncSuccess')
          .replace('{up}', String(result.uploaded))
          .replace('{down}', String(result.downloaded)),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('[Sync]', msg);
      toast({ title: t('syncError'), description: msg, variant: 'destructive' });
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="touch-target btn-press">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold">{t('settings')}</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 mt-6 space-y-6 pb-8">
        {/* AI API Settings */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t('aiSettings')}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{t('aiSettingsHint')}</p>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('aiProvider')}</label>
            <Select value={provider} onValueChange={(v) => setProvider(v as ApiProvider)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'gemini' ? 'AIzaSy...' : 'sk-...'}
              />
              <Button
                variant="ghost" size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('apiKeyHint')}</p>
          </div>

          <Button onClick={handleSaveApiKey} className="w-full btn-press">{t('saveSettings')}</Button>
        </Card>

        {/* Cloud Sync */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t('cloudSync')}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{t('cloudSyncHint')}</p>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('supabaseUrl')}</label>
            <Input
              value={sbUrl}
              onChange={(e) => setSbUrl(e.target.value)}
              placeholder="https://xxxxx.supabase.co"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('supabaseKey')}</label>
            <div className="relative">
              <Input
                type={showSbKey ? 'text' : 'password'}
                value={sbKey}
                onChange={(e) => setSbKey(e.target.value)}
                placeholder="eyJhbGciOi..."
              />
              <Button
                variant="ghost" size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowSbKey(!showSbKey)}
              >
                {showSbKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          <Button onClick={handleSaveSupabase} variant="outline" className="w-full btn-press">
            {t('saveSettings')}
          </Button>

          {/* Auth section — only show if Supabase is configured */}
          {isSupabaseConfigured() && (
            <div className="pt-2 border-t border-border space-y-3">
              {user ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {t('loggedInAs').replace('{email}', user.email || '')}
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={handleSync} disabled={syncLoading} className="flex-1 btn-press">
                      {syncLoading ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('syncing')}</>
                      ) : (
                        t('syncNow')
                      )}
                    </Button>
                    <Button variant="outline" onClick={handleLogout} className="btn-press">
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('email')}
                  />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('password')}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleLogin} disabled={authLoading} className="flex-1 btn-press">
                      {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('login')}
                    </Button>
                    <Button onClick={handleRegister} disabled={authLoading} variant="outline" className="flex-1 btn-press">
                      {t('register')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Pro Features */}
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">{t('proFeatures')}</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✦</span>
              {t('proFeatureSummary')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✦</span>
              {t('proFeatureMp3')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✦</span>
              {t('proFeatureSync')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">◇</span>
              <span className="opacity-50">{t('proFeatureVoice')}</span>
            </li>
          </ul>
        </Card>
      </main>
    </div>
  );
};

export default SettingsPage;
