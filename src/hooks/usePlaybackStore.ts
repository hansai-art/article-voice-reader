import { useState, useEffect } from 'react';
import { getLastPlayedId, getArticle, Article } from '@/lib/storage';

/**
 * Lightweight store for showing mini player on non-player pages.
 * Just tracks the last played article info — actual playback stays in useTTS.
 */
export function useLastPlayed() {
  const [lastPlayed, setLastPlayed] = useState<Article | null>(null);

  useEffect(() => {
    const refresh = () => {
      const id = getLastPlayedId();
      if (id) {
        const a = getArticle(id);
        if (a && a.lastPlayedAt > 0) setLastPlayed(a);
        else setLastPlayed(null);
      } else {
        setLastPlayed(null);
      }
    };

    refresh();

    // Listen for storage changes (from other tabs or player page saving progress)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'article-reader-last-played' || e.key === 'article-reader-articles') {
        refresh();
      }
    };
    window.addEventListener('storage', handleStorage);

    // Also refresh on focus (user navigated back from player)
    const handleFocus = () => refresh();
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return lastPlayed;
}
