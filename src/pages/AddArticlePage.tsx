import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, Sparkles, Link, Loader2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/hooks/useLanguage';
import { createArticle, saveArticle } from '@/lib/storage';
import { uploadArticle } from '@/lib/auto-sync';
import { parseFile } from '@/lib/file-parser';
import { estimateReadingTime, cleanText } from '@/lib/tts';
import { fetchArticleFromURL } from '@/lib/url-parser';
import { parseImageOCR, isImageFile } from '@/lib/ocr-parser';
import { toast } from '@/hooks/use-toast';

const AddArticlePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ocrRef = useRef<HTMLInputElement>(null);

  // Accept content from browser extension via URL params
  useEffect(() => {
    const paramContent = searchParams.get('content');
    const paramTitle = searchParams.get('title');
    if (paramContent) {
      setContent(paramContent);
      if (paramTitle) setFileName(paramTitle);
      return;
    }

    // Auto-detect clipboard content
    (async () => {
      try {
        if (!navigator.clipboard?.readText) return;
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim().length > 100) {
          setContent(clipText);
          toast({ title: t('clipboardDetected'), duration: 3000 });
        }
      } catch {
        // Clipboard permission denied — that's fine
      }
    })();
  }, [searchParams, t]);

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
        toast({ title: result.title, duration: 3000 });
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : 'UNKNOWN';
      if (err === 'INVALID_URL') toast({ title: t('urlInvalid'), variant: 'destructive' });
      else if (err === 'NO_CONTENT') toast({ title: t('urlNoContent'), variant: 'destructive' });
      else toast({ title: t('urlFetchError'), description: err, variant: 'destructive', duration: 5000 });
    } finally {
      setUrlLoading(false);
    }
  };

  // File upload
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

    // Check if it's an image for OCR
    if (isImageFile(file)) {
      setOcrProgress(0);
      try {
        const text = await parseImageOCR(file, (p) => setOcrProgress(Math.round(p.progress * 100)));
        if (text) {
          setContent((prev) => prev ? prev + '\n\n' + text : text);
          toast({ title: t('ocrDone'), duration: 2000 });
        }
      } catch {
        toast({ title: t('ocrError'), variant: 'destructive' });
      } finally {
        setOcrProgress(null);
      }
      return;
    }

    setLoading(true);
    setFileName(file.name);
    try {
      const text = await parseFile(file);
      if (text) setContent(text);
    } finally {
      setLoading(false);
    }
  }, [t]);

  // OCR upload
  const handleOcrFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrProgress(0);
    try {
      const text = await parseImageOCR(file, (p) => setOcrProgress(Math.round(p.progress * 100)));
      if (text) {
        setContent((prev) => prev ? prev + '\n\n' + text : text);
        setFileName(file.name);
        toast({ title: t('ocrDone'), duration: 2000 });
      }
    } catch {
      toast({ title: t('ocrError'), variant: 'destructive' });
    } finally {
      setOcrProgress(null);
      if (ocrRef.current) ocrRef.current.value = '';
    }
  };

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
    uploadArticle(article); // auto-sync to cloud
    navigate(`/player/${article.id}`);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="touch-target btn-press">
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
          <Button onClick={handleUrlFetch} disabled={!urlInput.trim() || urlLoading} className="btn-press shrink-0">
            {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('urlFetch')}
          </Button>
        </div>

        {/* Or divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-sm text-muted-foreground">{t('orDivider')}</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* File + OCR uploads side by side */}
        <div className="grid grid-cols-2 gap-3">
          {/* File upload */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors btn-press"
          >
            <input ref={fileRef} type="file" accept=".txt,.pdf,.docx,.md" className="hidden" onChange={handleFile} />
            {loading ? (
              <div className="animate-pulse">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="font-medium text-sm">{t('uploadFile')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('uploadHint')}</p>
              </>
            )}
          </div>

          {/* OCR upload */}
          <div
            onClick={() => ocrRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-colors btn-press"
          >
            <input ref={ocrRef} type="file" accept="image/*" className="hidden" onChange={handleOcrFile} />
            {ocrProgress !== null ? (
              <div className="animate-pulse">
                <Camera className="h-8 w-8 mx-auto text-accent mb-2" />
                <p className="text-xs text-accent font-medium">
                  {t('ocrProcessing').replace('{progress}', String(ocrProgress))}
                </p>
              </div>
            ) : (
              <>
                <Camera className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="font-medium text-sm">{t('ocrUpload')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('ocrHint')}</p>
              </>
            )}
          </div>
        </div>

        {fileName && (
          <p className="text-sm text-primary text-center">{fileName}</p>
        )}

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
              <span>{t('wordCount')}: {wordCount.toLocaleString()} {t('characters')}</span>
              <span>{t('estimatedTime')}: ~{readTime} {t('minutes')}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleClean} className="btn-press gap-1.5 text-xs">
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
