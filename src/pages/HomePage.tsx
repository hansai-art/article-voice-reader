import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Globe, Trash2, BookOpen, Sun, Moon, Download, Upload, Settings, Search, ArrowUpDown, BarChart3 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
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
} from '@/lib/storage';
import { useLanguage } from '@/hooks/useLanguage';
import { formatTimeAgo } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';

type SortMode = 'recent' | 'created' | 'progress' | 'title';

const HomePage = () => {
  const navigate = useNavigate();
  const { lang, toggleLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [articles, setArticles] = useState<Article[]>([]);
  const [lastPlayedArticle, setLastPlayedArticle] = useState<Article | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showStats, setShowStats] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setArticles(getArticles());
    const lastId = getLastPlayedId();
    if (lastId) {
      const a = getArticle(lastId);
      if (a && a.lastPlayedAt > 0) setLastPlayedArticle(a);
    }
  }, []);

  const handleDelete = (id: string) => {
    deleteArticle(id);
    setArticles(getArticles());
    if (lastPlayedArticle?.id === id) setLastPlayedArticle(null);
    setDeleteTarget(null);
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
  const filteredArticles = useMemo(() => {
    let list = articles;

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
  }, [articles, searchQuery, sortMode]);

  // Reading stats
  const stats = getReadingStats();
  const sortLabel: Record<SortMode, string> = {
    recent: lang === 'zh-TW' ? '最近播放' : 'Recent',
    created: lang === 'zh-TW' ? '建立時間' : 'Created',
    progress: lang === 'zh-TW' ? '進度' : 'Progress',
    title: lang === 'zh-TW' ? '標題' : 'Title',
  };

  return (
    <div className="min-h-screen pb-6">
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(article.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
