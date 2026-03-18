import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, Sparkles, Link, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/hooks/useLanguage';
import { createArticle, saveArticle } from '@/lib/storage';
import { parseFile } from '@/lib/file-parser';
import { estimateReadingTime, cleanText } from '@/lib/tts';
import { fetchArticleFromURL } from '@/lib/url-parser';
import { toast } from '@/hooks/use-toast';

const AddArticlePage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const wordCount = content.length;
  const readTime = estimateReadingTime(wordCount);

  // URL import
  const handleUrlFetch = async () => {
    const url = urlInput.trim();
    if (!url) return;

    setUrlLoading(true);
    try {
      const result = await fetchArticleFromURL(url);
      if (result) {
        setContent(result.content);
        setFileName(result.title);
        toast({ title: `${result.title}`, duration: 3000 });
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : 'UNKNOWN';
      if (err === 'INVALID_URL') {
        toast({ title: t('urlInvalid'), variant: 'destructive' });
      } else if (err === 'NO_CONTENT') {
        toast({ title: t('urlNoContent'), variant: 'destructive' });
      } else {
        toast({ title: t('urlFetchError'), description: err, variant: 'destructive', duration: 5000 });
      }
    } finally {
      setUrlLoading(false);
    }
  };

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setFileName(file.name);
    try {
      const text = await parseFile(file);
      if (text) setContent(text);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setLoading(true);
    setFileName(file.name);
    try {
      const text = await parseFile(file);
      if (text) setContent(text);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClean = () => {
    if (!content.trim()) return;
    const cleaned = cleanText(content);
    const diff = content.length - cleaned.length;
    if (diff > 0) {
      setContent(cleaned);
      toast({ title: t('cleanTextDone').replace('{count}', String(diff)), duration: 3000 });
    } else {
      toast({ title: t('cleanTextNoop'), duration: 2000 });
    }
  };

  const handleStart = () => {
    if (!content.trim()) return;
    const title = fileName ? fileName.replace(/\.[^.]+$/, '') : undefined;
    const article = createArticle(content.trim(), title);
    saveArticle(article);
    navigate(`/player/${article.id}`);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
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
          <h1 className="text-lg font-bold">{t('addArticle')}</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 mt-6 space-y-6 pb-8">
        {/* URL import */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUrlFetch(); }}
              placeholder={t('urlPlaceholder')}
              className="pl-9"
              disabled={urlLoading}
            />
          </div>
          <Button
            onClick={handleUrlFetch}
            disabled={!urlInput.trim() || urlLoading}
            className="btn-press shrink-0"
          >
            {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('urlFetch')}
          </Button>
        </div>

        {/* Or divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-sm text-muted-foreground">{t('orDivider')}</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* File upload dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors btn-press"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.pdf,.docx,.md"
            className="hidden"
            onChange={handleFile}
          />
          {loading ? (
            <div className="animate-pulse">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">{t('uploadFile')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('uploadHint')}</p>
              {fileName && (
                <p className="text-sm text-primary mt-2">{fileName}</p>
              )}
            </>
          )}
        </div>

        {/* Or divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-sm text-muted-foreground">{t('orDivider')}</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Textarea */}
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('pasteContent')}
          className="min-h-[200px] text-base resize-y prose-reader"
        />

        {/* Stats + Clean button */}
        {wordCount > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                {t('wordCount')}: {wordCount.toLocaleString()} {t('characters')}
              </span>
              <span>
                {t('estimatedTime')}: ~{readTime} {t('minutes')}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClean}
              className="btn-press gap-1.5 text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('cleanText')}
            </Button>
          </div>
        )}

        {/* Start Reading */}
        <Button
          className="w-full touch-target btn-press text-base font-semibold"
          size="lg"
          disabled={!content.trim()}
          onClick={handleStart}
        >
          {t('startReading')}
        </Button>
      </main>
    </div>
  );
};

export default AddArticlePage;
