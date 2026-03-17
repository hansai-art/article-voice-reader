import { useState, useEffect, useRef, useCallback } from 'react';
import { WebSpeechTTS, splitIntoParagraphs, splitIntoSentences } from '@/lib/tts';
import { Article, saveArticle, setLastPlayedId, getGlobalSpeed, setGlobalSpeed } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';
import { t } from '@/lib/i18n';

const MAX_RETRIES = 2;

/** Sort voices: zh-TW first, then zh-CN/zh-HK, then other zh, then rest alphabetically */
function sortVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => {
    const rank = (v: SpeechSynthesisVoice) => {
      if (v.lang === 'zh-TW' || v.lang === 'zh_TW') return 0;
      if (v.lang === 'zh-HK' || v.lang === 'zh_HK') return 1;
      if (v.lang === 'zh-CN' || v.lang === 'zh_CN') return 2;
      if (v.lang.startsWith('zh')) return 3;
      if (v.lang.startsWith('en')) return 4;
      return 5;
    };
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

export function useTTS(article: Article | null) {
  const ttsRef = useRef(new WebSpeechTTS());
  const [isPlaying, setIsPlaying] = useState(false);
  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speed, setSpeed] = useState(() => getGlobalSpeed());
  const articleRef = useRef(article);
  const playingRef = useRef(false);
  const retryCountRef = useRef(0);

  const paragraphs = article ? splitIntoParagraphs(article.content) : [];
  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;

  useEffect(() => {
    articleRef.current = article;
  }, [article]);

  // Load voices (sorted: zh-TW first)
  useEffect(() => {
    const loadVoices = () => {
      const raw = ttsRef.current.getVoices();
      const sorted = sortVoices(raw);
      setVoices(sorted);
      if (!selectedVoice && sorted.length > 0) {
        const zhTW = sorted.find((v) => v.lang === 'zh-TW' || v.lang === 'zh_TW');
        const zh = zhTW || sorted.find((v) => v.lang.startsWith('zh'));
        setSelectedVoice(zh || sorted[0]);
      }
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  // Restore state from article
  useEffect(() => {
    if (article) {
      setParagraphIndex(article.paragraphIndex || 0);
      setSentenceIndex(article.sentenceOffset || 0);
      if (article.speed) setSpeed(article.speed);
      if (article.voiceURI) {
        const v = ttsRef.current.getVoices().find((v) => v.voiceURI === article.voiceURI);
        if (v) setSelectedVoice(v);
      }
    }
  }, [article?.id]);

  const saveProgress = useCallback(
    (pIdx: number, sIdx: number) => {
      if (!articleRef.current) return;
      const updated = {
        ...articleRef.current,
        paragraphIndex: pIdx,
        sentenceOffset: sIdx,
        speed,
        voiceURI: selectedVoice?.voiceURI || '',
        lastPlayedAt: Date.now(),
      };
      articleRef.current = updated;
      saveArticle(updated);
      setLastPlayedId(updated.id);
    },
    [speed, selectedVoice]
  );

  const speakSentence = useCallback(
    (pIdx: number, sIdx: number) => {
      const paras = paragraphsRef.current;
      if (pIdx >= paras.length) {
        setIsPlaying(false);
        playingRef.current = false;
        retryCountRef.current = 0;
        return;
      }

      const sentences = splitIntoSentences(paras[pIdx]);
      if (sIdx >= sentences.length) {
        const nextP = pIdx + 1;
        setParagraphIndex(nextP);
        setSentenceIndex(0);
        saveProgress(nextP, 0);
        speakSentence(nextP, 0);
        return;
      }

      setParagraphIndex(pIdx);
      setSentenceIndex(sIdx);
      saveProgress(pIdx, sIdx);

      ttsRef.current.speak(
        sentences[sIdx],
        speed,
        selectedVoice,
        () => {
          retryCountRef.current = 0;
          if (playingRef.current) {
            speakSentence(pIdx, sIdx + 1);
          }
        },
        undefined,
        (error, detail) => {
          // "canceled" and "interrupted" are handled in tts.ts — won't reach here
          console.error(`[TTS Error] ${detail}`);
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            toast({
              title: `${t('ttsRetrying')} (${retryCountRef.current}/${MAX_RETRIES})`,
              description: `Error: ${error}`,
              duration: 3000,
            });
            setTimeout(() => {
              if (playingRef.current) {
                speakSentence(pIdx, sIdx);
              }
            }, 800);
          } else {
            retryCountRef.current = 0;
            setIsPlaying(false);
            playingRef.current = false;
            toast({
              title: t('ttsError'),
              description: `Error: ${error} | ${detail}`,
              variant: 'destructive',
              duration: 8000,
            });
          }
        }
      );
    },
    [speed, selectedVoice, saveProgress]
  );

  const play = useCallback(() => {
    setIsPlaying(true);
    playingRef.current = true;
    retryCountRef.current = 0;
    speakSentence(paragraphIndex, sentenceIndex);
  }, [paragraphIndex, sentenceIndex, speakSentence]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    playingRef.current = false;
    ttsRef.current.stop();
    saveProgress(paragraphIndex, sentenceIndex);
  }, [paragraphIndex, sentenceIndex, saveProgress]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const skipForward = useCallback(() => {
    const nextP = Math.min(paragraphIndex + 1, paragraphs.length - 1);
    ttsRef.current.stop();
    setParagraphIndex(nextP);
    setSentenceIndex(0);
    saveProgress(nextP, 0);
    if (playingRef.current) {
      speakSentence(nextP, 0);
    }
  }, [paragraphIndex, paragraphs.length, speakSentence, saveProgress]);

  const skipBackward = useCallback(() => {
    const prevP = Math.max(paragraphIndex - 1, 0);
    ttsRef.current.stop();
    setParagraphIndex(prevP);
    setSentenceIndex(0);
    saveProgress(prevP, 0);
    if (playingRef.current) {
      speakSentence(prevP, 0);
    }
  }, [paragraphIndex, speakSentence, saveProgress]);

  const seekToParagraph = useCallback(
    (idx: number) => {
      ttsRef.current.stop();
      setParagraphIndex(idx);
      setSentenceIndex(0);
      saveProgress(idx, 0);
      if (playingRef.current) {
        speakSentence(idx, 0);
      }
    },
    [speakSentence, saveProgress]
  );

  const changeSpeed = useCallback(
    (newSpeed: number) => {
      setSpeed(newSpeed);
      setGlobalSpeed(newSpeed);
      if (isPlaying) {
        ttsRef.current.stop();
      }
    },
    [isPlaying]
  );

  // Re-speak when speed changes during playback
  useEffect(() => {
    if (isPlaying && playingRef.current) {
      ttsRef.current.stop();
      speakSentence(paragraphIndex, sentenceIndex);
    }
  }, [speed, selectedVoice]);

  // Cleanup
  useEffect(() => {
    return () => {
      ttsRef.current.stop();
    };
  }, []);

  const progressPercent =
    paragraphs.length > 0 ? Math.round((paragraphIndex / paragraphs.length) * 100) : 0;

  return {
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
    play,
    pause,
  };
}
