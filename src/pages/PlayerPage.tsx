import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Pause, SkipBack, SkipForward, Pencil, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getArticle, saveArticle, Article } from '@/lib/storage';
import { useLanguage } from '@/hooks/useLanguage';
import { useTTS } from '@/hooks/useTTS';
import { useWakeLock } from '@/hooks/useWakeLock';
import { estimateReadingTime } from '@/lib/tts';

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const PlayerPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [article, setArticle] = useState<Article | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wakeLock = useWakeLock();

  useEffect(() => {
    if (id) {
      const a = getArticle(id);
      if (a) setArticle(a);
      else navigate('/');
    }
  }, [id]);

  const {
    isPlaying,
    paragraphIndex,
    paragraphs,
    progressPercent,
    voices,
    selectedVoice,
    setSelectedVoice,
    speed,
    changeSpeed,
    togglePlay,
    skipForward,
    skipBackward,
    seekToParagraph,
  } = useTTS(article);

  // Wake lock: acquire when playing, release when paused
  useEffect(() => {
    if (isPlaying) {
      wakeLock.request();
    } else {
      wakeLock.release();
    }
  }, [isPlaying, wakeLock]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when editing title
      if (isEditingTitle) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skipBackward();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skipForward, skipBackward, isEditingTitle]);

  // Auto-scroll to active paragraph
  useEffect(() => {
    const el = paragraphRefs.current[paragraphIndex];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [paragraphIndex]);

  // Title editing
  const startEditTitle = () => {
    if (!article) return;
    setEditTitle(article.title);
    setIsEditingTitle(true);
  };

  const saveTitle = () => {
    if (!article || !editTitle.trim()) return;
    const updated = { ...article, title: editTitle.trim() };
    saveArticle(updated);
    setArticle(updated);
    setIsEditingTitle(false);
  };

  const cancelEditTitle = () => {
    setIsEditingTitle(false);
  };

  // Progress calculations
  const totalTime = article ? estimateReadingTime(article.wordCount, speed) : 0;
  const elapsedTime = totalTime * (progressPercent / 100);
  const remainingTime = totalTime - elapsedTime;

  const formatTime = (mins: number) => {
    const m = Math.floor(mins);
    const s = Math.round((mins - m) * 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!article) return null;

  return (
    <div className="min-h-screen pb-[220px]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="touch-target btn-press shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {isEditingTitle ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') cancelEditTitle();
                }}
                className="h-8 text-sm"
                autoFocus
              />
              <Button variant="ghost" size="icon" onClick={saveTitle} className="shrink-0 h-8 w-8">
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={cancelEditTitle} className="shrink-0 h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate flex-1">{article.title}</h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={startEditTitle}
                className="shrink-0 h-8 w-8 text-muted-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Article content */}
      <main className="max-w-lg mx-auto px-6 mt-6">
        <div className="space-y-4 prose-reader text-base leading-relaxed">
          {paragraphs.map((para, idx) => (
            <motion.div
              key={idx}
              ref={(el) => { paragraphRefs.current[idx] = el; }}
              className={`px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                idx === paragraphIndex
                  ? 'bg-accent/10 border-l-4 border-accent'
                  : 'border-l-4 border-transparent hover:bg-muted/50'
              }`}
              onClick={() => seekToParagraph(idx)}
              animate={idx === paragraphIndex ? { scale: 1 } : { scale: 1 }}
            >
              <p className={idx === paragraphIndex ? 'text-foreground' : 'text-muted-foreground'}>
                {para}
              </p>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Fixed Bottom Dock */}
      <div className="dock z-20 px-6 py-4 pb-[env(safe-area-inset-bottom,16px)]">
        <div className="max-w-lg mx-auto space-y-3">
          {/* Progress slider */}
          <div className="space-y-1">
            <Slider
              value={[paragraphIndex]}
              max={Math.max(paragraphs.length - 1, 1)}
              step={1}
              onValueChange={([v]) => seekToParagraph(v)}
              className="touch-target"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(elapsedTime)}</span>
              <span className="text-center">{progressPercent}%</span>
              <span>-{formatTime(remainingTime)}</span>
            </div>
          </div>

          {/* Transport controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={skipBackward}
              className="touch-target btn-press"
            >
              <SkipBack className="h-6 w-6" />
            </Button>
            <Button
              onClick={togglePlay}
              className="h-14 w-14 rounded-full btn-press"
              size="icon"
            >
              {isPlaying ? (
                <Pause className="h-7 w-7" />
              ) : (
                <Play className="h-7 w-7 ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={skipForward}
              className="touch-target btn-press"
            >
              <SkipForward className="h-6 w-6" />
            </Button>
          </div>

          {/* Speed & Voice */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Select value={speed.toString()} onValueChange={(v) => changeSpeed(parseFloat(v))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t('speed')} />
                </SelectTrigger>
                <SelectContent>
                  {SPEED_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s.toString()}>
                      {s}x
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select
                value={selectedVoice?.voiceURI || ''}
                onValueChange={(uri) => {
                  const v = voices.find((v) => v.voiceURI === uri);
                  if (v) setSelectedVoice(v);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t('voice')} />
                </SelectTrigger>
                <SelectContent>
                  {voices.length === 0 ? (
                    <SelectItem value="none" disabled>
                      {t('noVoices')}
                    </SelectItem>
                  ) : (
                    voices.map((v) => (
                      <SelectItem key={v.voiceURI} value={v.voiceURI}>
                        {v.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerPage;
