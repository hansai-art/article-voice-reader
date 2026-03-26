import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Key, Cloud, Loader2, LogOut, UserPlus, ChevronDown, ChevronUp, User2, Copy, Check } from 'lucide-react';
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
  getMyProfile, updateProfile,
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');

  // Profile
  const [profileUsername, setProfileUsername] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
    if (isSupabaseConfigured()) {
      getUser().then((u) => {
        setUser(u);
        if (u) {
          getMyProfile().then((p) => {
            if (p) {
              setProfileUsername(p.username || '');
              setProfileDisplayName(p.display_name || '');
            }
          });
        }
      });
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

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    try {
      await updateProfile({ username: profileUsername.trim(), display_name: profileDisplayName.trim() });
      toast({ title: t('profileSaved'), duration: 2000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: t('profileSaveError'), description: msg, variant: 'destructive' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleCopyUrl = () => {
    const url = `https://twavr.lovable.app/${profileUsername}`;
    navigator.clipboard.writeText(url);
    setUrlCopied(true);
    toast({ title: t('urlCopied'), duration: 2000 });
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const handleRegister = async () => {
    if (!email || !password) return;
    setAuthLoading(true);
    try {
      const u = await signUp(email, password);
      if (u) {
        setUser(u);
        toast({ title: t('registerSuccess') });
        // Auto-sync after registration
        try {
          const result = await syncArticles();
          toast({
            title: t('syncSuccess')
              .replace('{up}', String(result.uploaded))
              .replace('{down}', String(result.downloaded)),
          });
        } catch {
          // sync might fail if no articles yet, that's ok
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: t('loginError'), description: msg, variant: 'destructive' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setAuthLoading(true);
    try {
      const u = await signIn(email, password);
      setUser(u);
      toast({ title: t('loginSuccess') });
      // Auto-sync after login
      try {
        const result = await syncArticles();
        toast({
          title: t('syncSuccess')
            .replace('{up}', String(result.uploaded))
            .replace('{down}', String(result.downloaded)),
        });
      } catch {
        // sync might fail, that's ok
      }
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

  const handleAuthSubmit = () => {
    if (authMode === 'register') handleRegister();
    else handleLogin();
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
        {/* Account & Sync — TOP SECTION */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t('accountSection')}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{t('accountSectionHint')}</p>

          {user ? (
            /* Logged in state */
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
            /* Registration / Login form */
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
                onKeyDown={(e) => { if (e.key === 'Enter') handleAuthSubmit(); }}
              />
              <Button
                onClick={handleAuthSubmit}
                disabled={authLoading}
                className="w-full btn-press text-base font-semibold gap-2"
                size="lg"
              >
                {authLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    {authMode === 'register' ? t('quickRegister') : t('login')}
                  </>
                )}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setAuthMode(authMode === 'register' ? 'login' : 'register')}
              >
                {authMode === 'register' ? t('hasAccount') : t('backToRegister')}
              </button>
            </div>
          )}
        </Card>

        {/* Public Profile — only when logged in */}
        {user && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <User2 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">{t('publicProfile')}</h2>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('username')}</label>
              <Input
                value={profileUsername}
                onChange={(e) => setProfileUsername(e.target.value)}
                placeholder="hans"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('displayName')}</label>
              <Input
                value={profileDisplayName}
                onChange={(e) => setProfileDisplayName(e.target.value)}
                placeholder="Hans Lin"
              />
            </div>

            {profileUsername.trim() && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('publicUrl')}</label>
                <div className="flex gap-2">
                  <Input
                    value={`https://twavr.lovable.app/${profileUsername.trim()}`}
                    readOnly
                    className="text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={handleCopyUrl} className="shrink-0">
                    {urlCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <Button onClick={handleSaveProfile} disabled={profileLoading} className="w-full btn-press">
              {profileLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('saveSettings')}
            </Button>
          </Card>
        )}

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

        {/* Advanced: Supabase Config (collapsed by default) */}
        <Card className="p-5 space-y-4">
          <button
            type="button"
            className="flex items-center justify-between w-full"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-muted-foreground">{t('advancedSettings')}</h2>
            </div>
            {showAdvanced ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-2">
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
