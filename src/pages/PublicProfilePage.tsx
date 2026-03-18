import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/hooks/useLanguage';
import { getProfileByUsername, getPublicArticles } from '@/lib/supabase';
import { formatTimeAgo } from '@/lib/i18n';

const PublicProfilePage = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();

  const [profile, setProfile] = useState<any>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    (async () => {
      const p = await getProfileByUsername(username);
      if (!p) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProfile(p);
      const arts = await getPublicArticles(p.id);
      setArticles(arts);
      setLoading(false);
    })();
  }, [username]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">404</h1>
          <p className="text-xl text-muted-foreground mb-4">{t('profileNotFound')}</p>
          <a href="/" className="text-primary underline hover:text-primary/90">
            {t('back')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-6">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="touch-target btn-press">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">{profile?.display_name || profile?.username || username}</h1>
            {profile?.display_name && profile?.username && (
              <p className="text-xs text-muted-foreground">@{profile.username}</p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 mt-6 space-y-4">
        {/* Public articles heading */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <span>{t('publicArticles')} ({articles.length})</span>
        </div>

        {/* Article list */}
        {articles.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium">{t('noPublicArticles')}</p>
          </div>
        ) : (
          articles.map((article) => (
            <Card
              key={article.article_id || article.id}
              className="p-4 cursor-pointer btn-press surface-ceramic hover:border-primary/20 transition-colors"
              onClick={() => navigate(`/player/${article.article_id || article.id}`)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{article.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {(article.word_count || 0).toLocaleString()} {t('characters')}
                    {article.created_at && (
                      <> {' · '} {formatTimeAgo(new Date(article.created_at).getTime(), lang)}</>
                    )}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Play className="h-5 w-5 text-primary ml-0.5" />
                </div>
              </div>
            </Card>
          ))
        )}
      </main>
    </div>
  );
};

export default PublicProfilePage;
