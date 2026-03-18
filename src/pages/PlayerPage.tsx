import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward,
  Pencil, Check, X, Minus, Plus, Timer, Eye, EyeOff, Sparkles, Loader2, Download,
  Volume2, Bot, Bookmark, ListOrdered,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getArticle, getArticles, saveArticle, Article, getFontSize, setFontSize as saveFontSize } from '@/lib/storage';
import { useLanguage } from '@/hooks/useLanguage';
import { useTTS } from '@/hooks/useTTS';
import { useWakeLock } from '@/hooks/useWakeLock';
import { estimateReadingTime } from '@/lib/tts';
import { generateSummary, SummaryResult } from '@/lib/ai-summary';
import { exportToMp3, getExportVoices, ExportVoice } from '@/lib/mp3-export';
import { getApiKey, getApiProvider } from '@/lib/storage';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { toast } from '@/hooks/use-toast';

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0];
const SLEEP_OPTIONS = [0, 15, 30, 45, 60, 90]; // 0 = off
const FONT_MIN = 14;
const FONT_MAX = 24;

const PlayerPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [article, setArticle] = useState<Article | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [fontSize, setFontSizeState] = useState(() => getFontSize());
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [mp3Loading, setMp3Loading] = useState(false);
  const [mp3Progress, setMp3Progress] = useState(0);
  const [autoPlayNext, setAutoPlayNext] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wakeLock = useWakeLock();

  useEffect(() => {
    if (id) {
      const a = getArticle(id);
      if (a) {
        setArticle(a);
        setBookmarks(new Set(a.bookmarks || []));
      } else {
        navigate('/');
      }
    }
  }, [id]);

  // Auto-play next article when current finishes
  useEffect(() => {
    setOnFinished(() => {
      if (!autoPlayNext || !article) return;
      const allArticles = getArticles();
      const currentIdx = allArticles.findIndex((a) => a.id === article.id);
      const next = allArticles[currentIdx + 1];
      if (next) {
        toast({ title: t('playingNext').replace('{title}', next.title), duration: 3000 });
        navigate(`/player/${next.id}`);
      }
    });
  }, [autoPlayNext, article, navigate, setOnFinished, t]);

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
    pause,
    engineType,
    switchEngine,
    openaiVoice,
    changeOpenAIVoice,
    openaiVoices,
    setOnFinished,
  } = useTTS(article);

  // Wake lock
  useEffect(() => {
    if (isPlaying) wakeLock.request();
    else wakeLock.release();
  }, [isPlaying, wakeLock]);

  // Media Session API — lock screen / notification playback controls
  useEffect(() => {
    if (!('mediaSession' in navigator) || !article) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: article.title,
      artist: '語音朗讀器',
      album: `${article.wordCount} 字`,
    });

    navigator.mediaSession.setActionHandler('play', () => togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => togglePlay());
    navigator.mediaSession.setActionHandler('previoustrack', () => skipBackward());
    navigator.mediaSession.setActionHandler('nexttrack', () => skipForward());

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [article, togglePlay, skipForward, skipBackward]);

  // Update Media Session playback state
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  // Auto-pause when navigating away
  useEffect(() => {
    return () => {
      pause();
    };
  }, [pause]);

  // Sleep timer
  const startSleepTimer = useCallback((minutes: number) => {
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    setSleepMinutes(minutes);
    if (minutes === 0) {
      setSleepRemaining(0);
      return;
    }
    const endTime = Date.now() + minutes * 60 * 1000;
    setSleepRemaining(minutes);
    sleepTimerRef.current = setInterval(() => {
      const left = Math.ceil((endTime - Date.now()) / 60000);
      if (left <= 0) {
        pause();
        setSleepMinutes(0);
        setSleepRemaining(0);
        if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
        sleepTimerRef.current = null;
      } else {
        setSleepRemaining(left);
      }
    }, 10000);
  }, [pause]);

  useEffect(() => {
    return () => {
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  // Auto-scroll
  useEffect(() => {
    const el = paragraphRefs.current[paragraphIndex];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [paragraphIndex]);

  // Font size
  const changeFontSize = (delta: number) => {
    const next = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + delta));
    setFontSizeState(next);
    saveFontSize(next);
  };

  // Title editing
  const startEditTitle = () => {
    if (!article) return;
    setEditTitle(article.title);
    setIsEditingTitle(true);
  };
  const handleSaveTitle = () => {
    if (!article || !editTitle.trim()) return;
    const updated = { ...article, title: editTitle.trim() };
    saveArticle(updated);
    setArticle(updated);
    setIsEditingTitle(false);
  };
  const cancelEditTitle = () => setIsEditingTitle(false);

  // Bookmarks
  const toggleBookmark = (idx: number) => {
    const next = new Set(bookmarks);
    if (next.has(idx)) {
      next.delete(idx);
      toast({ title: t('bookmarkRemove'), duration: 1500 });
    } else {
      next.add(idx);
      toast({ title: t('bookmarkAdd'), duration: 1500 });
    }
    setBookmarks(next);
    if (article) {
      const updated = { ...article, bookmarks: Array.from(next) };
      saveArticle(updated);
      setArticle(updated);
    }
  };

  // Swipe gestures
  const swipeHandlers = useSwipeGesture(skipForward, skipBackward);

  // AI Summary
  const handleGenerateSummary = async () => {
    if (!article) return;
    if (!getApiKey()) {
      toast({ title: t('summaryNoApiKey'), variant: 'destructive' });
      return;
    }
    setSummaryLoading(true);
    try {
      const lang = document.documentElement.lang === 'en' ? 'en' : 'zh-TW';
      const result = await generateSummary(article.content, lang as 'zh-TW' | 'en');
      setSummary(result);
      setShowSummary(true);
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Unknown';
      console.error('[AI Summary]', err);
      toast({ title: t('summaryError'), description: err, variant: 'destructive', duration: 5000 });
    } finally {
      setSummaryLoading(false);
    }
  };

  // MP3 export
  const handleExportMp3 = async (voice: ExportVoice = 'nova') => {
    if (!article) return;
    if (!getApiKey() || getApiProvider() !== 'openai') {
      toast({ title: t('exportMp3NeedOpenai'), variant: 'destructive' });
      return;
    }
    setMp3Loading(true);
    setMp3Progress(0);
    try {
      const blob = await exportToMp3(article.content, voice, speed, (p) => setMp3Progress(p));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${article.title}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t('exportMp3Done') });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown';
      console.error('[MP3 Export]', msg);
      toast({ title: t('exportMp3Error'), description: msg, variant: 'destructive' });
    } finally {
      setMp3Loading(false);
    }
  };

  // Progress
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
    <div className="min-h-screen pb-[260px]">
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
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') cancelEditTitle();
                }}
                className="h-8 text-sm"
                autoFocus
              />
              <Button variant="ghost" size="icon" onClick={handleSaveTitle} className="shrink-0 h-8 w-8">
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={cancelEditTitle} className="shrink-0 h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate flex-1">{article.title}</h1>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-muted-foreground" disabled={mp3Loading}>
                    {mp3Loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-2" align="end">
                  <p className="text-xs font-medium px-2 py-1 text-muted-foreground">{t('exportMp3Voice')}</p>
                  {getExportVoices().map((v) => (
                    <Button key={v} variant="ghost" className="w-full justify-start text-sm h-8" onClick={() => handleExportMp3(v)}>
                      {v}
                    </Button>
                  ))}
                  {mp3Loading && (
                    <p className="text-xs text-accent px-2 pt-1">
                      {t('exportMp3Progress').replace('{progress}', String(mp3Progress))}
                    </p>
                  )}
                </PopoverContent>
              </Popover>
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

      {/* AI Summary section */}
      <div className="max-w-lg mx-auto px-6 mt-4">
        {!showSummary ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateSummary}
            disabled={summaryLoading}
            className="btn-press gap-1.5 text-xs w-full"
          >
            {summaryLoading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('summaryGenerating')}</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> {t('generateSummary')}</>
            )}
          </Button>
        ) : summary && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" /> {t('summary')}
              </h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowSummary(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-sm leading-relaxed">{summary.summary}</p>
            {summary.keyPoints.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{t('keyPoints')}</p>
                <ul className="space-y-1">
                  {summary.keyPoints.map((point, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Article content */}
      <main className="max-w-lg mx-auto px-6 mt-4" {...swipeHandlers}>
        <div className="space-y-4 prose-reader leading-relaxed" style={{ fontSize: `${fontSize}px` }}>
          {paragraphs.map((para, idx) => {
            const distance = Math.abs(idx - paragraphIndex);
            const immersiveOpacity = immersiveMode
              ? distance === 0 ? 'opacity-100' : distance === 1 ? 'opacity-30' : 'opacity-5 pointer-events-none'
              : '';
            const isBookmarked = bookmarks.has(idx);
            return (
              <motion.div
                key={idx}
                ref={(el) => { paragraphRefs.current[idx] = el; }}
                className={`px-4 py-3 rounded-lg cursor-pointer transition-all duration-300 relative ${
                  idx === paragraphIndex
                    ? 'bg-accent/10 border-l-4 border-accent'
                    : isBookmarked
                      ? 'border-l-4 border-primary/40 bg-primary/5'
                      : 'border-l-4 border-transparent hover:bg-muted/50'
                } ${immersiveOpacity}`}
                onClick={() => seekToParagraph(idx)}
                onDoubleClick={() => toggleBookmark(idx)}
              >
                {isBookmarked && (
                  <Bookmark className="absolute top-2 right-2 h-3.5 w-3.5 text-primary/50 fill-primary/30" />
                )}
                <p className={idx === paragraphIndex ? 'text-foreground' : 'text-muted-foreground'}>
                  {para}
                </p>
              </motion.div>
            );
          })}
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
              <span>{t('paragraphCount').replace('{current}', String(paragraphIndex + 1)).replace('{total}', String(paragraphs.length))} · {progressPercent}%</span>
              <span>-{formatTime(remainingTime)}</span>
            </div>
          </div>

          {/* Transport controls */}
          <div className="flex items-center justify-center gap-4">
            <Button variant="ghost" size="icon" onClick={skipBackward} className="touch-target btn-press">
              <SkipBack className="h-6 w-6" />
            </Button>
            <Button onClick={togglePlay} className="h-14 w-14 rounded-full btn-press" size="icon">
              {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={skipForward} className="touch-target btn-press">
              <SkipForward className="h-6 w-6" />
            </Button>
          </div>

          {/* Speed, Voice, Font, Sleep */}
          <div className="flex items-center gap-2">
            {/* Speed */}
            <div className="flex-1">
              <Select value={speed.toString()} onValueChange={(v) => changeSpeed(parseFloat(v))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t('speed')} />
                </SelectTrigger>
                <SelectContent>
                  {SPEED_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s.toString()}>{s}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Voice — shows browser voices or OpenAI voices depending on engine */}
            <div className="flex-1">
              {engineType === 'openai' ? (
                <Select value={openaiVoice} onValueChange={(v) => changeOpenAIVoice(v as any)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={t('ttsEngineOpenaiVoice')} />
                  </SelectTrigger>
                  <SelectContent>
                    {openaiVoices.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
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
                      <SelectItem value="none" disabled>{t('noVoices')}</SelectItem>
                    ) : (
                      voices.map((v) => (
                        <SelectItem key={v.voiceURI} value={v.voiceURI}>{v.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* TTS Engine toggle */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 ${engineType === 'openai' ? 'text-accent' : ''}`}
              onClick={() => switchEngine(engineType === 'openai' ? 'browser' : 'openai')}
              title={engineType === 'openai' ? t('ttsEngineOpenai') : t('ttsEngineBrowser')}
            >
              {engineType === 'openai' ? <Bot className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>

            {/* Font size */}
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => changeFontSize(-1)} disabled={fontSize <= FONT_MIN}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground w-4 text-center">{fontSize}</span>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => changeFontSize(1)} disabled={fontSize >= FONT_MAX}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Auto-play next */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 ${autoPlayNext ? 'text-accent' : ''}`}
              onClick={() => {
                setAutoPlayNext(!autoPlayNext);
                toast({ title: !autoPlayNext ? t('autoPlayNextOn') : t('autoPlayNextOff'), duration: 1500 });
              }}
            >
              <ListOrdered className="h-4 w-4" />
            </Button>

            {/* Immersive mode */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 ${immersiveMode ? 'text-accent' : ''}`}
              onClick={() => setImmersiveMode(!immersiveMode)}
            >
              {immersiveMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>

            {/* Sleep timer */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 ${sleepMinutes > 0 ? 'text-accent' : ''}`}
                >
                  <Timer className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                <div className="space-y-1">
                  <p className="text-xs font-medium px-2 py-1 text-muted-foreground">{t('sleepTimer')}</p>
                  {SLEEP_OPTIONS.map((m) => (
                    <Button
                      key={m}
                      variant={sleepMinutes === m ? 'secondary' : 'ghost'}
                      className="w-full justify-start text-sm h-8"
                      onClick={() => startSleepTimer(m)}
                    >
                      {m === 0 ? t('sleepTimerOff') : `${m} ${t('sleepTimerSet')}`}
                    </Button>
                  ))}
                  {sleepRemaining > 0 && (
                    <p className="text-xs text-accent px-2 pt-1">
                      {t('sleepTimerActive').replace('{min}', String(sleepRemaining))}
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerPage;
