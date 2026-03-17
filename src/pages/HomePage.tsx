import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Globe, Trash2, BookOpen, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { getArticles, deleteArticle, getLastPlayedId, getArticle, Article } from '@/lib/storage';
import { useLanguage } from '@/hooks/useLanguage';
import { formatTimeAgo } from '@/lib/i18n';

const HomePage = () => {
  const navigate = useNavigate();
  const { lang, toggleLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [articles, setArticles] = useState<Article[]>([]);
  const [lastPlayedArticle, setLastPlayedArticle] = useState<Article | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const progressOf = (a: Article) => {
    if (!a.content) return 0;
    const paras = a.content.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    return paras.length > 0 ? Math.round((a.paragraphIndex / paras.length) * 100) : 0;
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
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="touch-target btn-press"
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLanguage}
              className="touch-target btn-press"
            >
              <Globe className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 mt-4 space-y-4">
        {/* Add Article button */}
        <Button
          className="w-full touch-target btn-press text-base font-semibold gap-2"
          size="lg"
          onClick={() => navigate('/add')}
        >
          <Plus className="h-5 w-5" />
          {t('addArticle')}
        </Button>

        {/* Resume Reading banner */}
        {lastPlayedArticle && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
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
                  <p className="text-sm text-muted-foreground truncate">
                    {lastPlayedArticle.title}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {progressOf(lastPlayedArticle)}%
                </span>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Article list */}
        {articles.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium">{t('noArticles')}</p>
            <p className="text-sm mt-1">{t('noArticlesHint')}</p>
          </div>
        ) : (
          <AnimatePresence>
            {articles.map((article) => (
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
                  {/* Progress bar */}
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

      {/* Delete confirmation dialog */}
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
