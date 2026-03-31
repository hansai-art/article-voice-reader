import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward,
  Pencil, Check, X, Minus, Plus, Sparkles, Loader2, Download,
  Volume2, Bot, Bookmark, ListOrdered, List, Type, MessageSquare, Tag,
  Settings2, Eye, EyeOff, Timer, Palette, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getArticle, getArticles, saveArticle, Article, getFontSize, setFontSize as saveFontSize, getReadingTheme, setReadingTheme as saveReadingTheme, ReadingTheme } from '@/lib/storage';
import { useLanguage } from '@/hooks/useLanguage';
import { useTTS } from '@/hooks/useTTS';
import { useWakeLock } from '@/hooks/useWakeLock';
import { estimateReadingTime, extractHeadings, applyBionicReading, splitIntoSentences } from '@/lib/tts';
import { generateSummary, SummaryResult } from '@/lib/ai-summary';
import { exportToMp3, getExportVoices, ExportVoice } from '@/lib/mp3-export';
import { getApiKey, getApiProvider } from '@/lib/storage';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { toast } from '@/hooks/use-toast';
import { getPublicArticleById } from '@/lib/supabase';
import { uploadArticle } from '@/lib/auto-sync';

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0];
const SLEEP_OPTIONS = [0, 15, 30, 45, 60, 90];
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
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [bionicMode, setBionicMode] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [showToolbar, setShowToolbar] = useState(false);
  const [readingTheme, setReadingThemeState] = useState<ReadingTheme>(() => getReadingTheme());
  const [rsvpMode, setRsvpMode] = useState(false);
  const [isPublicView, setIsPublicView] = useState(false);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wakeLock = useWakeLock();

  useEffect(() => {
    if (!id) return;
    const a = getArticle(id);
    if (a) {
      setArticle(a);
      setBookmarks(new Set(a.bookmarks || []));
      setNotes(a.notes || {});
    } else {
      // Try loading from Supabase as a public article
      getPublicArticleById(id).then((remote) => {
        if (remote) {
          const mapped: Article = {
            id: remote.article_id || remote.id,
            title: remote.title || 'Untitled',
            content: remote.content || '',
            wordCount: remote.word_count || 0,
            createdAt: new Date(remote.created_at).getTime(),
            lastPlayedAt: 0,
            paragraphIndex: 0,
          };
          setArticle(mapped);
          setIsPublicView(true);
        } else {
          navigate('/');
        }
      });
    }
  }, [id]);

  const {
    isPlaying, paragraphIndex, sentenceIndex, paragraphs, progressPercent,
    voices, selectedVoice, setSelectedVoice, speed, changeSpeed,
    togglePlay, skipForward, skipBackward, seekToParagraph, pause,
    engineType, switchEngine, openaiVoice, changeOpenAIVoice, openaiVoices, setOnFinished,
  } = useTTS(article);

  // Auto-play next
  useEffect(() => {
    setOnFinished(() => {
      if (!autoPlayNext || !article) return;
      const all = getArticles();
      const idx = all.findIndex((a) => a.id === article.id);
      const next = all[idx + 1];
      if (next) {
        toast({ title: t('playingNext').replace('{title}', next.title), duration: 3000 });
        navigate(`/player/${next.id}`);
      }
    });
  }, [autoPlayNext, article, navigate, setOnFinished, t]);

  // Wake lock
  useEffect(() => {
    if (isPlaying) wakeLock.request(); else wakeLock.release();
  }, [isPlaying, wakeLock]);

  // Media Session
  useEffect(() => {
    if (!('mediaSession' in navigator) || !article) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: article.title, artist: '語音朗讀器', album: `${article.wordCount} 字`,
    });
    navigator.mediaSession.setActionHandler('play', () => togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => togglePlay());
    navigator.mediaSession.setActionHandler('previoustrack', () => skipBackward());
    navigator.mediaSession.setActionHandler('nexttrack', () => skipForward());
    return () => {
      ['play', 'pause', 'previoustrack', 'nexttrack'].forEach((a) =>
        navigator.mediaSession.setActionHandler(a as any, null)
      );
    };
  }, [article, togglePlay, skipForward, skipBackward]);

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => { return () => { pause(); }; }, [pause]);

  // Sleep timer
  const startSleepTimer = useCallback((minutes: number) => {
    if (sleepTimerRef.current) { clearInterval(sleepTimerRef.current); sleepTimerRef.current = null; }
    setSleepMinutes(minutes);
    if (minutes === 0) { setSleepRemaining(0); return; }
    const endTime = Date.now() + minutes * 60 * 1000;
    setSleepRemaining(minutes);
    sleepTimerRef.current = setInterval(() => {
      const left = Math.ceil((endTime - Date.now()) / 60000);
      if (left <= 0) { pause(); setSleepMinutes(0); setSleepRemaining(0); clearInterval(sleepTimerRef.current!); sleepTimerRef.current = null; }
      else setSleepRemaining(left);
    }, 10000);
  }, [pause]);

  useEffect(() => { return () => { if (sleepTimerRef.current) clearInterval(sleepTimerRef.current); }; }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditingTitle || editingNote !== null) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); skipForward(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); skipBackward(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skipForward, skipBackward, isEditingTitle, editingNote]);

  // Auto-scroll
  useEffect(() => {
    const el = paragraphRefs.current[paragraphIndex];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [paragraphIndex]);

  const changeFontSize = (d: number) => {
    const next = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + d));
    setFontSizeState(next); saveFontSize(next);
  };

  // Title
  const startEditTitle = () => { if (!article) return; setEditTitle(article.title); setIsEditingTitle(true); };
  const handleSaveTitle = () => { if (!article || !editTitle.trim()) return; const u = { ...article, title: editTitle.trim() }; saveArticle(u); uploadArticle(u); setArticle(u); setIsEditingTitle(false); };

  // Bookmarks
  const toggleBookmark = (idx: number) => {
    const next = new Set(bookmarks);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setBookmarks(next);
    if (article) { const u = { ...article, bookmarks: Array.from(next) }; saveArticle(u); uploadArticle(u); setArticle(u); }
    toast({ title: next.has(idx) ? t('bookmarkAdd') : t('bookmarkRemove'), duration: 1500 });
  };

  // Notes
  const startNote = (idx: number) => { setEditingNote(idx); setNoteText(notes[idx] || ''); };
  const saveNote = () => {
    if (editingNote === null || !article) return;
    const u = { ...notes };
    noteText.trim() ? (u[editingNote] = noteText.trim()) : delete u[editingNote];
    setNotes(u);
    const ua = { ...article, notes: u }; saveArticle(ua); uploadArticle(ua); setArticle(ua);
    setEditingNote(null);
    toast({ title: noteText.trim() ? t('noteSaved') : t('noteDeleted'), duration: 1500 });
  };

  const headings = useMemo(() => extractHeadings(paragraphs), [paragraphs]);
  const swipeHandlers = useSwipeGesture(skipForward, skipBackward);

  // AI Summary
  const handleGenerateSummary = async () => {
    if (!article || !getApiKey()) { toast({ title: t('summaryNoApiKey'), variant: 'destructive' }); return; }
    setSummaryLoading(true);
    try {
      const result = await generateSummary(article.content, 'zh-TW');
      setSummary(result); setShowSummary(true);
    } catch (e) {
      toast({ title: t('summaryError'), description: String(e), variant: 'destructive', duration: 5000 });
    } finally { setSummaryLoading(false); }
  };

  // MP3
  const handleExportMp3 = async (voice: ExportVoice = 'nova') => {
    if (!article || !getApiKey() || getApiProvider() !== 'openai') { toast({ title: t('exportMp3NeedOpenai'), variant: 'destructive' }); return; }
    setMp3Loading(true); setMp3Progress(0);
    try {
      const blob = await exportToMp3(article.content, voice, speed, (p) => setMp3Progress(p));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${article.title}.mp3`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: t('exportMp3Done') });
    } catch (e) {
      toast({ title: t('exportMp3Error'), description: String(e), variant: 'destructive' });
    } finally { setMp3Loading(false); }
  };

  // Progress
  const totalTime = article ? estimateReadingTime(article.wordCount, speed) : 0;
  const elapsedTime = totalTime * (progressPercent / 100);
  const remainingTime = totalTime - elapsedTime;
  const fmt = (m: number) => `${Math.floor(m)}:${Math.round((m - Math.floor(m)) * 60).toString().padStart(2, '0')}`;

  // Sentence-level highlighting
  const currentSentences = useMemo(() => {
    if (paragraphIndex >= paragraphs.length) return [];
    return splitIntoSentences(paragraphs[paragraphIndex]);
  }, [paragraphs, paragraphIndex]);

  if (!article) return null;

  return (
    <div className="min-h-screen pb-[200px]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="touch-target btn-press shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {isEditingTitle ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setIsEditingTitle(false); }}
                className="h-8 text-sm" autoFocus />
              <Button variant="ghost" size="icon" onClick={handleSaveTitle} className="h-8 w-8 shrink-0"><Check className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => setIsEditingTitle(false)} className="h-8 w-8 shrink-0"><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <>
              <h1 className={`text-base font-bold truncate flex-1 ${isPublicView ? '' : 'cursor-pointer'}`} onClick={isPublicView ? undefined : startEditTitle}>{article.title}</h1>
              {/* Header actions: TOC, Tags, Export, Summary */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground"><List className="h-4 w-4" /></Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 max-h-64 overflow-y-auto" align="end">
                  <p className="text-xs font-medium px-2 py-1 text-muted-foreground">{t('tableOfContents')}</p>
                  {headings.length === 0 ? <p className="text-xs text-muted-foreground px-2 py-1">{t('noHeadings')}</p>
                    : headings.map((h) => (
                      <Button key={h.index} variant={h.index === paragraphIndex ? 'secondary' : 'ghost'} className="w-full justify-start text-xs h-7 truncate"
                        onClick={() => seekToParagraph(h.index)}>{h.text.slice(0, 40)}</Button>
                    ))}
                </PopoverContent>
              </Popover>
              {!isPublicView && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground"><Tag className="h-4 w-4" /></Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-3" align="end">
                    <p className="text-xs font-medium text-muted-foreground mb-2">{t('tags')}</p>
                    {article.tags?.length ? (
                      <div className="flex gap-1 flex-wrap mb-2">
                        {article.tags.map((tag) => (
                          <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => { const u = { ...article, tags: article.tags!.filter((t) => t !== tag) }; saveArticle(u); uploadArticle(u); setArticle(u); }}>{tag} ×</span>
                        ))}
                      </div>
                    ) : null}
                    <Input placeholder={t('tagPlaceholder')} className="h-7 text-xs"
                      onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (!v) return; const tags = [...(article.tags || [])]; if (!tags.includes(v)) tags.push(v); const u = { ...article, tags }; saveArticle(u); uploadArticle(u); setArticle(u); (e.target as HTMLInputElement).value = ''; } }} />
                  </PopoverContent>
                </Popover>
              )}
            </>
          )}
        </div>
      </header>

      {/* AI Summary */}
      <div className="max-w-lg mx-auto px-6 mt-3">
        {!showSummary ? (
          <Button variant="outline" size="sm" onClick={handleGenerateSummary} disabled={summaryLoading} className="btn-press gap-1.5 text-xs w-full">
            {summaryLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('summaryGenerating')}</>
              : <><Sparkles className="h-3.5 w-3.5" />{t('generateSummary')}</>}
          </Button>
        ) : summary && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-1.5"><Sparkles className="h-4 w-4" />{t('summary')}</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowSummary(false)}><X className="h-3.5 w-3.5" /></Button>
            </div>
            <p className="text-sm leading-relaxed">{summary.summary}</p>
            {summary.keyPoints.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{t('keyPoints')}</p>
                <ul className="space-y-1">{summary.keyPoints.map((p, i) => (
                  <li key={i} className="text-sm flex items-start gap-2"><span className="text-primary mt-0.5">•</span>{p}</li>
                ))}</ul>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Side progress bar */}
      <div className="reading-progress-bar">
        <div className="reading-progress-fill" style={{ height: `${progressPercent}%` }} />
      </div>

      {/* RSVP overlay */}
      {rsvpMode && isPlaying && (
        <div className="rsvp-overlay" onClick={() => setRsvpMode(false)}>
          <div className="text-center">
            <p className="rsvp-text">{currentSentences[sentenceIndex] || ''}</p>
            <p className="text-sm text-muted-foreground mt-8">{t('rsvpExit')}</p>
          </div>
        </div>
      )}

      {/* Article content with sentence-level highlighting */}
      <main className={`max-w-lg mx-auto px-6 mt-3 rounded-lg ${readingTheme !== 'default' ? `reading-theme-${readingTheme} py-4` : ''}`} {...swipeHandlers}>
        <div className="space-y-3 prose-reader leading-relaxed" style={{ fontSize: `${fontSize}px` }}>
          {paragraphs.map((para, idx) => {
            const distance = Math.abs(idx - paragraphIndex);
            const immersiveClass = immersiveMode
              ? distance === 0 ? '' : distance === 1 ? 'opacity-30' : 'opacity-5 pointer-events-none'
              : '';
            const isBookmarked = bookmarks.has(idx);
            const isCurrentPara = idx === paragraphIndex;
            const sentences = isCurrentPara ? currentSentences : [];

            return (
              <motion.div
                key={idx}
                ref={(el) => { paragraphRefs.current[idx] = el; }}
                className={`px-4 py-2.5 rounded-lg cursor-pointer transition-all duration-300 relative ${
                  isCurrentPara ? 'bg-accent/8 border-l-4 border-accent'
                    : isBookmarked ? 'border-l-4 border-primary/40 bg-primary/5'
                      : 'border-l-4 border-transparent hover:bg-muted/30'
                } ${immersiveClass}`}
                onClick={() => seekToParagraph(idx)}
                onDoubleClick={() => toggleBookmark(idx)}
              >
                {isBookmarked && <Bookmark className="absolute top-2 right-2 h-3 w-3 text-primary/40 fill-primary/20" />}

                {/* Sentence-level highlighting for current paragraph */}
                {isCurrentPara && sentences.length > 1 ? (
                  <p className="text-foreground">
                    {sentences.map((s, si) => (
                      <span key={si} className={`transition-colors duration-200 ${
                        si === sentenceIndex ? 'bg-accent/20 rounded px-0.5' : si < sentenceIndex ? 'opacity-60' : ''
                      }`}>{s}</span>
                    ))}
                  </p>
                ) : bionicMode ? (
                  <p className={isCurrentPara ? 'text-foreground' : 'text-muted-foreground'}
                    dangerouslySetInnerHTML={{ __html: applyBionicReading(para) }} />
                ) : (
                  <p className={isCurrentPara ? 'text-foreground' : 'text-muted-foreground'}>{para}</p>
                )}

                {notes[idx] && editingNote !== idx && (
                  <div className="mt-1.5 text-xs text-primary/60 bg-primary/5 rounded px-2 py-1 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); startNote(idx); }}>
                    <MessageSquare className="h-3 w-3 inline mr-1" />{notes[idx]}
                  </div>
                )}
                {editingNote === idx && (
                  <div className="mt-1.5 flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Input value={noteText} onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditingNote(null); }}
                      placeholder={t('notePlaceholder')} className="h-7 text-xs" autoFocus />
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={saveNote}><Check className="h-3 w-3" /></Button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* Redesigned Bottom Dock — clean, professional */}
      <div className="dock z-20 px-6 py-3 pb-[env(safe-area-inset-bottom,12px)]">
        <div className="max-w-lg mx-auto space-y-2.5">
          {/* Progress */}
          <div className="space-y-0.5">
            <Slider value={[paragraphIndex]} max={Math.max(paragraphs.length - 1, 1)} step={1}
              onValueChange={([v]) => seekToParagraph(v)} className="touch-target" />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{fmt(elapsedTime)}</span>
              <span>{t('paragraphCount').replace('{current}', String(paragraphIndex + 1)).replace('{total}', String(paragraphs.length))} · {progressPercent}%</span>
              <span>-{fmt(remainingTime)}</span>
            </div>
          </div>

          {/* Main controls row: Speed | Skip | Play | Skip | Voice | More */}
          <div className="flex items-center gap-1">
            {/* Speed pill */}
            <Select value={speed.toString()} onValueChange={(v) => changeSpeed(parseFloat(v))}>
              <SelectTrigger className="h-10 w-16 text-xs font-medium rounded-full border-0 bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>{SPEED_OPTIONS.map((s) => <SelectItem key={s} value={s.toString()}>{s}x</SelectItem>)}</SelectContent>
            </Select>

            <div className="flex-1 flex items-center justify-center gap-2">
              <Button variant="ghost" size="icon" onClick={skipBackward} className="h-10 w-10 btn-press"><SkipBack className="h-5 w-5" /></Button>
              <Button onClick={togglePlay} className="h-14 w-14 rounded-full btn-press shadow-lg" size="icon">
                {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 ml-0.5" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={skipForward} className="h-10 w-10 btn-press"><SkipForward className="h-5 w-5" /></Button>
            </div>

            {/* Voice pill */}
            <div className="w-16">
              {engineType === 'openai' ? (
                <Select value={openaiVoice} onValueChange={(v) => changeOpenAIVoice(v as any)}>
                  <SelectTrigger className="h-10 text-xs font-medium rounded-full border-0 bg-muted/50"><SelectValue /></SelectTrigger>
                  <SelectContent>{openaiVoices.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Select value={selectedVoice?.voiceURI || ''} onValueChange={(uri) => { const v = voices.find((v) => v.voiceURI === uri); if (v) setSelectedVoice(v); }}>
                  <SelectTrigger className="h-10 text-[10px] font-medium rounded-full border-0 bg-muted/50 truncate"><SelectValue placeholder="語音" /></SelectTrigger>
                  <SelectContent>{voices.length === 0 ? <SelectItem value="none" disabled>{t('noVoices')}</SelectItem>
                    : voices.map((v) => <SelectItem key={v.voiceURI} value={v.voiceURI}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>

            {/* More settings toggle */}
            <Button variant="ghost" size="icon" className={`h-10 w-10 ${showToolbar ? 'text-accent' : ''}`}
              onClick={() => setShowToolbar(!showToolbar)}>
              <Settings2 className="h-5 w-5" />
            </Button>
          </div>

          {/* Expandable toolbar — only shows when toggled */}
          <AnimatePresence>
            {showToolbar && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-between gap-1 pt-1 border-t border-border">
                  {/* TTS engine */}
                  <Button variant="ghost" size="icon" className={`h-9 w-9 ${engineType === 'openai' ? 'text-accent' : ''}`}
                    title={engineType === 'openai' ? t('ttsEngineOpenai') : t('ttsEngineBrowser')}
                    onClick={() => switchEngine(engineType === 'openai' ? 'browser' : 'openai')}>
                    {engineType === 'openai' ? <Bot className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  {/* Font size */}
                  <div className="flex items-center" title={t('fontSize')}>
                    <Button variant="ghost" size="icon" className="h-9 w-8" onClick={() => changeFontSize(-1)} disabled={fontSize <= FONT_MIN}><Minus className="h-3 w-3" /></Button>
                    <span className="text-[10px] text-muted-foreground w-5 text-center">{fontSize}</span>
                    <Button variant="ghost" size="icon" className="h-9 w-8" onClick={() => changeFontSize(1)} disabled={fontSize >= FONT_MAX}><Plus className="h-3 w-3" /></Button>
                  </div>
                  {/* Reading theme */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9" title={t('readingTheme')}><Palette className="h-4 w-4" /></Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-36 p-2" align="start">
                      <p className="text-xs font-medium px-2 py-1 text-muted-foreground">{t('readingTheme')}</p>
                      {(['default', 'sepia', 'cream', 'dark', 'amoled'] as ReadingTheme[]).map((th) => (
                        <Button key={th} variant={readingTheme === th ? 'secondary' : 'ghost'}
                          className="w-full justify-start text-sm h-7"
                          onClick={() => { setReadingThemeState(th); saveReadingTheme(th); }}>
                          <span className={`inline-block w-3 h-3 rounded-full mr-2 border ${
                            th === 'default' ? 'bg-background' : th === 'sepia' ? 'bg-[#f4ecd8]' : th === 'cream' ? 'bg-[#fdf6e3]' : th === 'dark' ? 'bg-[#1a1a2e]' : 'bg-black'
                          }`} />
                          {t(`theme${th.charAt(0).toUpperCase() + th.slice(1)}` as any)}
                        </Button>
                      ))}
                    </PopoverContent>
                  </Popover>
                  {/* Bionic */}
                  <Button variant="ghost" size="icon" className={`h-9 w-9 ${bionicMode ? 'text-accent' : ''}`}
                    title={t('bionicReading')}
                    onClick={() => setBionicMode(!bionicMode)}><Type className="h-4 w-4" /></Button>
                  {/* RSVP */}
                  <Button variant="ghost" size="icon" className={`h-9 w-9 ${rsvpMode ? 'text-accent' : ''}`}
                    title={t('rsvpMode')}
                    onClick={() => setRsvpMode(!rsvpMode)}><Zap className="h-4 w-4" /></Button>
                  {/* Note */}
                  <Button variant="ghost" size="icon" className="h-9 w-9"
                    title={t('noteAdd')}
                    onClick={() => editingNote !== null ? setEditingNote(null) : startNote(paragraphIndex)}><MessageSquare className="h-4 w-4" /></Button>
                  {/* Immersive */}
                  <Button variant="ghost" size="icon" className={`h-9 w-9 ${immersiveMode ? 'text-accent' : ''}`}
                    title={t('immersiveMode')}
                    onClick={() => setImmersiveMode(!immersiveMode)}>{immersiveMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                  {/* Auto-play next: show ON/OFF label for clarity */}
                  <Button variant="ghost" size="sm" className={`h-9 px-2 gap-1 text-xs ${autoPlayNext ? 'text-accent' : 'text-muted-foreground'}`}
                    title={t('autoPlayNext')}
                    onClick={() => { setAutoPlayNext(!autoPlayNext); toast({ title: !autoPlayNext ? t('autoPlayNextOn') : t('autoPlayNextOff'), duration: 1500 }); }}>
                    <ListOrdered className="h-4 w-4" />
                    {autoPlayNext ? 'ON' : 'OFF'}
                  </Button>
                  {/* Sleep */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className={`h-9 w-9 ${sleepMinutes > 0 ? 'text-accent' : ''}`} title={t('sleepTimer')}><Timer className="h-4 w-4" /></Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-2" align="end">
                      <p className="text-xs font-medium px-2 py-1 text-muted-foreground">{t('sleepTimer')}</p>
                      {SLEEP_OPTIONS.map((m) => (
                        <Button key={m} variant={sleepMinutes === m ? 'secondary' : 'ghost'} className="w-full justify-start text-sm h-8"
                          onClick={() => startSleepTimer(m)}>{m === 0 ? t('sleepTimerOff') : `${m} ${t('sleepTimerSet')}`}</Button>
                      ))}
                      {sleepRemaining > 0 && <p className="text-xs text-accent px-2 pt-1">{t('sleepTimerActive').replace('{min}', String(sleepRemaining))}</p>}
                    </PopoverContent>
                  </Popover>
                  {/* MP3 Export */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9" disabled={mp3Loading}>
                        {mp3Loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-2" align="end">
                      <p className="text-xs font-medium px-2 py-1 text-muted-foreground">{t('exportMp3Voice')}</p>
                      {getExportVoices().map((v) => (
                        <Button key={v} variant="ghost" className="w-full justify-start text-sm h-8" onClick={() => handleExportMp3(v)}>{v}</Button>
                      ))}
                      {mp3Loading && <p className="text-xs text-accent px-2 pt-1">{t('exportMp3Progress').replace('{progress}', String(mp3Progress))}</p>}
                    </PopoverContent>
                  </Popover>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default PlayerPage;
