import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getArticle, Article } from '@/lib/storage';
import { useLanguage } from '@/hooks/useLanguage';
import { useTTS } from '@/hooks/useTTS';
import { estimateReadingTime } from '@/lib/tts';

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const PlayerPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [article, setArticle] = useState<Article | null>(null);
  const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  // Auto-scroll to active paragraph
  useEffect(() => {
    const el = paragraphRefs.current[paragraphIndex];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [paragraphIndex]);

  const totalTime = article ? estimateReadingTime(article.wordCount, speed) : 0;
  const elapsedTime = Math.round(totalTime * (progressPercent / 100));

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
            onClick={() => {
              navigate('/');
            }}
            className="touch-target btn-press"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold truncate flex-1">{article.title}</h1>
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
              <span>{formatTime(totalTime)}</span>
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
