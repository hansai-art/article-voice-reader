import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Globe, Trash2, BookOpen, Sun, Moon, Download, Upload, Settings, Search, ArrowUpDown, BarChart3, Play, Eye, EyeOff, Sparkles, AudioLines, Bot, Cloud, ArrowRight } from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getArticles, deleteArticle, getLastPlayedId, getArticle,
  exportArticles, importArticles, Article, getReadingStats,
  createArticle, saveArticle, getApiKey, getApiProvider,
} from '@/lib/storage';
import { useLanguage } from '@/hooks/useLanguage';
import { formatTimeAgo } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';
import { getUser, toggleArticlePublic } from '@/lib/supabase';
import { deleteArticleRemote, uploadArticle } from '@/lib/auto-sync';
import { OnboardingTour } from '@/components/OnboardingTour';
import { shouldShowOnboarding } from '@/lib/onboarding';
import { DIAG_UPDATED_EVENT, getDiagData, getPlaybackErrorCount, getPlaybackStatus, getTTSLimits } from '@/lib/diagnostics';
import type { User } from '@supabase/supabase-js';

type SortMode = 'recent' | 'created' | 'progress' | 'title';

function getDemoArticle(lang: 'zh-TW' | 'en') {
  if (lang === 'zh-TW') {
    return {
      title: '3 分鐘體驗語音朗讀器',
      content: `歡迎體驗語音朗讀器。

這是一篇示範文章，會帶你快速感受貼上文章、開始播放、切換語音與續聽的完整流程。

你可以試著播放幾句，接著切換語速、開啟摘要，或稍後回到首頁再從上次進度繼續。

如果這個流程順利，下一步就很適合匯入你自己的文章，或到設定頁解鎖 AI 語音、MP3 匯出與雲端同步。`,
    };
  }

  return {
    title: '3-Minute Voice Reader Demo',
    content: `Welcome to Voice Reader.

This sample article helps you experience the full flow quickly: import, play, switch voices, and resume later.

Try listening for a few sentences, then adjust speed, generate a summary, or return to the home screen and continue from where you left off.

If this feels smooth, the next step is to import your own article or unlock AI voices, MP3 export, and sync in Settings.`,
  };
}

const HomePage = () => {
  const navigate = useNavigate();
  const { lang, toggleLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [articles, setArticles] = useState<Article[]>([]);
  const [lastPlayedArticle, setLastPlayedArticle] = useState<Article | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [articlePublicMap, setArticlePublicMap] = useState<Record<string, boolean>>({});
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);
  const importRef = useRef<HTMLInputElement>(null);
  const [diagData, setDiagData] = useState(() => getDiagData());
  const ttsLimits = useMemo(() => getTTSLimits(diagData.device), [diagData.device]);
  const playbackErrorCount = useMemo(() => getPlaybackErrorCount(diagData.logs), [diagData.logs]);
  const aiConfigured = getApiKey().trim().length > 0;
  const openaiConfigured = aiConfigured && getApiProvider() === 'openai';

  useEffect(() => {
    setArticles(getArticles());
    const lastId = getLastPlayedId();
    if (lastId) {
      const a = getArticle(lastId);
      if (a && a.lastPlayedAt > 0) setLastPlayedArticle(a);
    }
    getUser().then(setCurrentUser);
  }, []);

  useEffect(() => {
    const refreshDiagnostics = () => setDiagData(getDiagData());
    window.addEventListener(DIAG_UPDATED_EVENT, refreshDiagnostics);
    window.addEventListener('focus', refreshDiagnostics);
    document.addEventListener('visibilitychange', refreshDiagnostics);
    return () => {
      window.removeEventListener(DIAG_UPDATED_EVENT, refreshDiagnostics);
      window.removeEventListener('focus', refreshDiagnostics);
      document.removeEventListener('visibilitychange', refreshDiagnostics);
    };
  }, []);

  const handleDelete = (id: string) => {
    deleteArticle(id);
    deleteArticleRemote(id); // auto-sync: remove from cloud
    setArticles(getArticles());
    if (lastPlayedArticle?.id === id) setLastPlayedArticle(null);
    setDeleteTarget(null);
  };

  const handleTryDemo = () => {
    const demo = getDemoArticle(lang);
    const article = createArticle(demo.content, demo.title);
    saveArticle(article);
    // Best-effort cloud sync for signed-in users: the local demo article should still open immediately.
    const syncDemoArticle = async () => {
      if (!currentUser) return;
      const uploaded = await uploadArticle(article);
      if (!uploaded) {
        toast({ title: t('demoArticleSyncPending'), duration: 2500 });
      }
    };
    void syncDemoArticle();
    setArticles(getArticles());
    setLastPlayedArticle(article);
    toast({ title: t('demoArticleCreated'), duration: 2000 });
    navigate(`/player/${article.id}`);
  };

  const handleTogglePublic = async (articleId: string) => {
    const current = articlePublicMap[articleId] ?? true;
    const next = !current;
    setArticlePublicMap((prev) => ({ ...prev, [articleId]: next }));
    await toggleArticlePublic(articleId, next);
    toast({ title: next ? t('publicLabel') : t('privateLabel'), duration: 1500 });
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const cycleSortMode = () => {
    const modes: SortMode[] = ['recent', 'created', 'progress', 'title'];
    const idx = modes.indexOf(sortMode);
    setSortMode(modes[(idx + 1) % modes.length]);
  };

  const handleExport = () => {
    const articles = getArticles();
    if (articles.length === 0) {
      toast({ title: t('noArticlesToExport') });
      return;
    }
    const json = exportArticles();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice-reader-articles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t('exportSuccess').replace('{count}', String(articles.length)) });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { imported, skipped } = importArticles(text);
      setArticles(getArticles());
      let msg = t('importSuccess').replace('{count}', String(imported));
      if (skipped > 0) msg += t('importSkipped').replace('{count}', String(skipped));
      toast({ title: msg });
    } catch {
      toast({ title: t('importError'), variant: 'destructive' });
    }
    if (importRef.current) importRef.current.value = '';
  };

  const progressOf = (a: Article) => {
    if (!a.content) return 0;
    const paras = a.content.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    return paras.length > 0 ? Math.round((a.paragraphIndex / paras.length) * 100) : 0;
  };

  // Filter + sort
  // Collect all tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    articles.forEach((a) => a.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [articles]);

  const filteredArticles = useMemo(() => {
    let list = articles;

    // Tag filter
    if (selectedTag) {
      list = list.filter((a) => a.tags?.includes(selectedTag));
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        a.content.slice(0, 500).toLowerCase().includes(q)
      );
    }

    // Sort
    return [...list].sort((a, b) => {
      switch (sortMode) {
        case 'recent': return (b.lastPlayedAt || b.createdAt) - (a.lastPlayedAt || a.createdAt);
        case 'created': return b.createdAt - a.createdAt;
        case 'progress': return progressOf(b) - progressOf(a);
        case 'title': return a.title.localeCompare(b.title);
        default: return 0;
      }
    });
  }, [articles, searchQuery, sortMode, selectedTag]);

  // Reading stats
  const stats = getReadingStats();
  const sortLabel: Record<SortMode, string> = {
    recent: lang === 'zh-TW' ? '最近播放' : 'Recent',
    created: lang === 'zh-TW' ? '建立時間' : 'Created',
    progress: lang === 'zh-TW' ? '進度' : 'Progress',
    title: lang === 'zh-TW' ? '標題' : 'Title',
  };
  const playbackStatus = getPlaybackStatus(diagData.device, diagData.logs);
  const playbackStatusLabel = playbackStatus === 'ready'
    ? t('upgradeStatusReady')
    : playbackStatus === 'attention'
      ? t('upgradeStatusAttention')
      : t('upgradeStatusSetup');
  const playbackStatusVariant = {
    ready: 'default',
    attention: 'secondary',
    setup: 'outline',
  } as const;
  const playbackMessage = !diagData.device.speechSynthesis
    ? t('homePlaybackSetup')
    : playbackErrorCount > 0
      ? t('homePlaybackErrors')
          .replace('{count}', String(playbackErrorCount))
          .replace('{browser}', diagData.device.browser || 'Browser')
      : ttsLimits.needsUserGesture
        ? t('homePlaybackGesture')
        : ttsLimits.resumeWorkaround
          ? t('homePlaybackResumeWorkaround')
              .replace('{browser}', diagData.device.browser || 'Browser')
          : t('homePlaybackReady')
              .replace('{browser}', diagData.device.browser || 'Browser')
              .replace('{os}', diagData.device.os || 'Device');

  return (
    <div className={`min-h-screen ${lastPlayedArticle ? 'pb-20' : 'pb-6'}`}>
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t('appTitle')}</h1>
            <p className="text-xs text-muted-foreground">{t('appSubtitle')}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="touch-target btn-press">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleLanguage} className="touch-target btn-press">
              <Globe className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} className="touch-target btn-press">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 mt-4 space-y-4">
        {/* Action buttons */}
        <div className="flex gap-2">
          <Button className="flex-1 touch-target btn-press text-base font-semibold gap-2" size="lg" onClick={() => navigate('/add')}>
            <Plus className="h-5 w-5" />
            {t('addArticle')}
          </Button>
          <Button variant="outline" size="lg" onClick={handleExport} className="touch-target btn-press px-3">
            <Download className="h-5 w-5" />
          </Button>
          <Button variant="outline" size="lg" onClick={() => importRef.current?.click()} className="touch-target btn-press px-3">
            <Upload className="h-5 w-5" />
          </Button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>

        {articles.length === 0 && (
          <Card className="p-5 border-primary/20 bg-primary/5 space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('quickStartTitle')}
              </p>
              <p className="text-sm text-muted-foreground">{t('quickStartDesc')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button className="gap-2" onClick={handleTryDemo}>
                <Play className="h-4 w-4" />
                {t('tryDemoArticle')}
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => navigate('/add')}>
                <Plus className="h-4 w-4" />
                {t('importOwnArticle')}
              </Button>
            </div>
          </Card>
        )}

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold flex items-center gap-2">
                <AudioLines className="h-4 w-4 text-primary" />
                {t('homePlaybackCardTitle')}
              </p>
              <p className="text-xs text-muted-foreground">{t('homePlaybackCardHint')}</p>
            </div>
            <Badge variant={playbackStatusVariant[playbackStatus]}>
              {playbackStatusLabel}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{playbackMessage}</p>
        </Card>

        {(!openaiConfigured || !currentUser) && (
          <Card className="p-4 space-y-3 border-accent/30 bg-accent/5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{t('homeUpgradeCardTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('homeUpgradeCardHint')}</p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0 gap-1" onClick={() => navigate('/settings')}>
                {t('homeUpgradeCta')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />{t('homeUpgradeSummary')}</span>
                <Badge variant={aiConfigured ? 'default' : 'outline'}>{aiConfigured ? t('upgradeStatusReady') : t('upgradeStatusSetup')}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" />{t('homeUpgradeVoice')}</span>
                <Badge variant={openaiConfigured ? 'default' : 'outline'}>{openaiConfigured ? t('upgradeStatusReady') : t('upgradeStatusSetup')}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2"><Cloud className="h-4 w-4 text-primary" />{t('homeUpgradeSync')}</span>
                <Badge variant={currentUser ? 'default' : 'outline'}>{currentUser ? t('upgradeStatusReady') : t('upgradeStatusSetup')}</Badge>
              </div>
            </div>
          </Card>
        )}

        {/* Reading stats banner */}
        {articles.length > 0 && (
          <div
            className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-muted/50 cursor-pointer"
            onClick={() => setShowStats(!showStats)}
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              <span>{articles.length} {t('characters').replace('字', '篇')}</span>
              <span>·</span>
              <span>{articles.reduce((sum, a) => sum + a.wordCount, 0).toLocaleString()} {t('characters')}</span>
            </div>
            {showStats && stats.totalMinutesListened > 0 && (
              <span className="text-xs text-muted-foreground">
                {Math.round(stats.totalMinutesListened)} {t('minutes')}
              </span>
            )}
          </div>
        )}

        {/* Search + Sort */}
        {articles.length > 2 && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === 'zh-TW' ? '搜尋文章...' : 'Search articles...'}
                className="pl-9 h-9"
              />
            </div>
            <Button variant="outline" size="sm" className="h-9 gap-1 text-xs shrink-0" onClick={cycleSortMode}>
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortLabel[sortMode]}
            </Button>
          </div>
        )}

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <Button
              variant={selectedTag === null ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs rounded-full px-3"
              onClick={() => setSelectedTag(null)}
            >
              {lang === 'zh-TW' ? '全部' : 'All'}
            </Button>
            {allTags.map((tag) => (
              <Button
                key={tag}
                variant={selectedTag === tag ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs rounded-full px-3"
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              >
                {tag}
              </Button>
            ))}
          </div>
        )}

        {/* Resume Reading banner */}
        {lastPlayedArticle && !searchQuery && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              className="p-4 cursor-pointer btn-press border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors"
              onClick={() => navigate(`/player/${lastPlayedArticle.id}`)}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-accent">{t('resumeReading')}</p>
                  <p className="text-sm text-muted-foreground truncate">{lastPlayedArticle.title}</p>
                </div>
                <span className="text-xs text-muted-foreground">{progressOf(lastPlayedArticle)}%</span>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Article list */}
        {filteredArticles.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium">{searchQuery ? (lang === 'zh-TW' ? '找不到符合的文章' : 'No matching articles') : t('noArticles')}</p>
            {!searchQuery && <p className="text-sm mt-1">{t('noArticlesHint')}</p>}
          </div>
        ) : (
          <AnimatePresence>
            {filteredArticles.map((article) => (
              <motion.div
                key={article.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card
                  className="p-4 cursor-pointer btn-press surface-ceramic hover:border-primary/20 transition-colors"
                  onClick={() => navigate(`/player/${article.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{article.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {article.wordCount.toLocaleString()} {t('characters')}
                        {' · '}
                        {article.lastPlayedAt > 0 ? (
                          <>
                            {t('progress')} {progressOf(article)}%
                            {' · '}
                            {formatTimeAgo(article.lastPlayedAt, lang)}
                          </>
                        ) : (
                          t('notStarted')
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {currentUser && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-primary h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePublic(article.id);
                          }}
                          title={(articlePublicMap[article.id] ?? true) ? t('publicLabel') : t('privateLabel')}
                        >
                          {(articlePublicMap[article.id] ?? true) ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(article.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {article.tags && article.tags.length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {article.tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {article.lastPlayedAt > 0 && (
                    <div className="mt-3 h-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${progressOf(article)}%` }}
                      />
                    </div>
                  )}
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </main>

      {/* Mini player bar — shows last played article for quick resume */}
      {lastPlayedArticle && (
        <div
          className="fixed bottom-0 left-0 right-0 z-10 bg-background/95 backdrop-blur border-t border-border px-6 py-3 cursor-pointer btn-press"
          onClick={() => navigate(`/player/${lastPlayedArticle.id}`)}
        >
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{lastPlayedArticle.title}</p>
              <p className="text-xs text-muted-foreground">{t('progress')} {progressOf(lastPlayedArticle)}%</p>
            </div>
            <div className="h-1 w-16 bg-secondary rounded-full overflow-hidden shrink-0">
              <div className="h-full bg-primary rounded-full" style={{ width: `${progressOf(lastPlayedArticle)}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Onboarding tour */}
      {showOnboarding && <OnboardingTour onComplete={() => setShowOnboarding(false)} onTryDemo={handleTryDemo} />}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default HomePage;
