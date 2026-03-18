import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Key } from 'lucide-react';
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
import { toast } from '@/hooks/use-toast';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [apiKey, setApiKey] = useState(getApiKey());
  const [provider, setProvider] = useState<ApiProvider>(getApiProvider());
  const [showKey, setShowKey] = useState(false);

  const handleSaveApiKey = () => {
    saveApiKey(apiKey.trim());
    saveApiProvider(provider);
    toast({ title: t('settingsSaved'), duration: 2000 });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="touch-target btn-press"
          >
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

          {/* Provider select */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('aiProvider')}</label>
            <Select value={provider} onValueChange={(v) => setProvider(v as ApiProvider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* API Key input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider === 'gemini' ? 'AIzaSy...' : 'sk-...'}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('apiKeyHint')}</p>
          </div>

          <Button onClick={handleSaveApiKey} className="w-full btn-press">
            {t('saveSettings')}
          </Button>
        </Card>

        {/* Features that require API key */}
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">{t('proFeatures')}</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✦</span>
              {t('proFeatureSummary')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">◇</span>
              <span className="opacity-50">{t('proFeatureVoice')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">◇</span>
              <span className="opacity-50">{t('proFeatureMp3')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">◇</span>
              <span className="opacity-50">{t('proFeatureSync')}</span>
            </li>
          </ul>
        </Card>
      </main>
    </div>
  );
};

export default SettingsPage;
