import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  WebSpeechTTS, OpenAITTS, splitIntoParagraphs, splitIntoSentences,
  TTSEngine, OpenAIVoice, getOpenAIVoices, detectLanguage,
} from '@/lib/tts';
import {
  Article, saveArticle, setLastPlayedId, getGlobalSpeed, setGlobalSpeed,
  getApiKey, getApiProvider, getTTSEngine, setTTSEngine, TTSEngineType,
  getOpenAIVoicePref, setOpenAIVoicePref, updateReadingStats,
} from '@/lib/storage';
import { toast } from '@/hooks/use-toast';
import { t } from '@/lib/i18n';
import { uploadProgressDebounced } from '@/lib/auto-sync';
import { detectDevice, getTTSLimits, diagLog } from '@/lib/diagnostics';

const MAX_RETRIES = 2;

/** Filter to zh + en only, sort: zh-TW first, then other zh, then en */
function filterAndSortVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices
    .filter((v) => v.lang.startsWith('zh') || v.lang.startsWith('en'))
    .sort((a, b) => {
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
  const webTTSRef = useRef(new WebSpeechTTS());
  const openaiTTSRef = useRef<OpenAITTS | null>(null);
  const [engineType, setEngineType] = useState<TTSEngineType>(() => getTTSEngine());
  const [openaiVoice, setOpenaiVoice] = useState<OpenAIVoice>(() => getOpenAIVoicePref() as OpenAIVoice);
  const [isPlaying, setIsPlaying] = useState(false);
  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speed, setSpeed] = useState(() => getGlobalSpeed());
  const articleRef = useRef(article);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const playingRef = useRef(false);
  const retryCountRef = useRef(0);
  const onFinishedRef = useRef<(() => void) | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const engineTypeRef = useRef(engineType);
  const paragraphIndexRef = useRef(0);
  const sentenceIndexRef = useRef(0);
  const speakSentenceRef = useRef<(pIdx: number, sIdx: number) => void>(() => {});

  // Device-aware TTS limits
  const deviceRef = useRef(detectDevice());
  const ttsLimits = useRef(getTTSLimits(deviceRef.current));

  const paragraphs = useMemo(
    () => (article ? splitIntoParagraphs(article.content) : []),
    [article]
  );
  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;

  // Log device info on first mount
  useEffect(() => {
    const d = deviceRef.current;
    const limits = ttsLimits.current;
    diagLog('info', `Device: ${d.os} ${d.osVersion} / ${d.browser} ${d.browserVersion} / ${d.mobile ? 'mobile' : 'desktop'} / maxLen=${limits.maxUtteranceLength}`);
  }, []);

  // Keep ref in sync
  useEffect(() => {
    engineTypeRef.current = engineType;
  }, [engineType]);

  // Get the active TTS engine
  const getEngine = useCallback((): TTSEngine => {
    if (engineTypeRef.current === 'openai' && openaiTTSRef.current) {
      return openaiTTSRef.current;
    }
    return webTTSRef.current;
  }, []);

  // Initialize/update OpenAI TTS engine
  useEffect(() => {
    const apiKey = getApiKey();
    if (apiKey && getApiProvider() === 'openai') {
      if (!openaiTTSRef.current) {
        openaiTTSRef.current = new OpenAITTS(apiKey, openaiVoice);
      } else {
        openaiTTSRef.current.setApiKey(apiKey);
        openaiTTSRef.current.setOpenAIVoice(openaiVoice);
      }
    }
  }, [openaiVoice]);

  useEffect(() => {
    articleRef.current = article;
  }, [article]);

  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);

  useEffect(() => {
    paragraphIndexRef.current = paragraphIndex;
  }, [paragraphIndex]);

  useEffect(() => {
    sentenceIndexRef.current = sentenceIndex;
  }, [sentenceIndex]);

  // Load voices (sorted: zh-TW first)
  useEffect(() => {
    const loadVoices = () => {
      const raw = webTTSRef.current.getVoices();
      const sorted = filterAndSortVoices(raw);
      setVoices(sorted);
      if (!selectedVoiceRef.current && sorted.length > 0) {
        // Auto-detect language from article content and pick matching voice
        const lang = articleRef.current ? detectLanguage(articleRef.current.content) : 'zh';
        let preferred: SpeechSynthesisVoice | undefined;
        if (lang === 'en') {
          preferred = sorted.find((v) => v.lang.startsWith('en'));
        } else {
          preferred = sorted.find((v) => v.lang === 'zh-TW' || v.lang === 'zh_TW')
            || sorted.find((v) => v.lang.startsWith('zh'));
        }
        setSelectedVoice(preferred || sorted[0]);
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
        const v = webTTSRef.current.getVoices().find((v) => v.voiceURI === article.voiceURI);
        if (v) setSelectedVoice(v);
      }
    }
  }, [article]);

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
      uploadProgressDebounced(updated); // auto-sync progress (10s debounce)
    },
    [speed, selectedVoice]
  );

  // Prefetch next sentence for OpenAI TTS
  const prefetchNext = useCallback(
    (pIdx: number, sIdx: number) => {
      if (engineTypeRef.current !== 'openai' || !openaiTTSRef.current) return;
      const paras = paragraphsRef.current;
      if (pIdx >= paras.length) return;
      const sentences = splitIntoSentences(paras[pIdx], ttsLimits.current.maxUtteranceLength);
      let nextText: string | null = null;
      if (sIdx + 1 < sentences.length) {
        nextText = sentences[sIdx + 1];
      } else if (pIdx + 1 < paras.length) {
        const nextSentences = splitIntoSentences(paras[pIdx + 1], ttsLimits.current.maxUtteranceLength);
        if (nextSentences.length > 0) nextText = nextSentences[0];
      }
      if (nextText) {
        openaiTTSRef.current.prefetch(nextText, speed);
      }
    },
    [speed]
  );

  const speakSentence = useCallback(
    (pIdx: number, sIdx: number) => {
      const paras = paragraphsRef.current;
      if (pIdx >= paras.length) {
        setIsPlaying(false);
        playingRef.current = false;
        retryCountRef.current = 0;
        // Track listening time + mark completed
        if (playStartTimeRef.current > 0) {
          const minutesListened = (Date.now() - playStartTimeRef.current) / 60000;
          updateReadingStats(minutesListened, true);
          playStartTimeRef.current = 0;
        }
        onFinishedRef.current?.();
        return;
      }

      const sentences = splitIntoSentences(paras[pIdx], ttsLimits.current.maxUtteranceLength);
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

      // Prefetch next sentence for OpenAI
      prefetchNext(pIdx, sIdx);

      const engine = getEngine();

      engine.speak(
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
          console.error(`[TTS Error] ${detail}`);
          diagLog('tts_error', `${error}: ${detail}`, { pIdx, sIdx, engine: engineTypeRef.current });

          // If OpenAI fails, fall back to browser TTS
          if (engineTypeRef.current === 'openai') {
            console.warn('[TTS] OpenAI failed, falling back to browser voice');
            toast({
              title: t('ttsOpenaiError'),
              variant: 'destructive',
              duration: 5000,
            });
            setEngineType('browser');
            setTTSEngine('browser');
            engineTypeRef.current = 'browser';
            // Retry with browser engine
            if (playingRef.current) {
              setTimeout(() => speakSentence(pIdx, sIdx), 300);
            }
            return;
          }

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
            // Retry exhausted: skip this sentence and continue playing
            retryCountRef.current = 0;
            console.warn(`[TTS] Skipping sentence after ${MAX_RETRIES} retries: "${sentences[sIdx].slice(0, 30)}..."`);
            diagLog('tts_skip', `Skipped: "${sentences[sIdx].slice(0, 50)}..."`, { pIdx, sIdx });
            toast({
              title: t('ttsSkipped'),
              duration: 3000,
            });
            if (playingRef.current) {
              setTimeout(() => speakSentence(pIdx, sIdx + 1), 300);
            }
          }
        }
      );
    },
    [speed, selectedVoice, saveProgress, getEngine, prefetchNext]
  );

  useEffect(() => {
    speakSentenceRef.current = speakSentence;
  }, [speakSentence]);

  /**
   * Normalizes playback startup for both fresh play and sentence replay.
   * `restartTimer` is true for a brand-new play request, but false when replaying
   * the current sentence so existing listening-time tracking can continue.
   */
  const startPlaybackSession = useCallback((restartTimer = false) => {
    retryCountRef.current = 0;
    if (!playingRef.current) {
      setIsPlaying(true);
      playingRef.current = true;
    }
    if (restartTimer || playStartTimeRef.current === 0) {
      playStartTimeRef.current = Date.now();
    }
  }, []);

  const play = useCallback(() => {
    startPlaybackSession(true);
    speakSentence(paragraphIndex, sentenceIndex);
  }, [paragraphIndex, sentenceIndex, speakSentence, startPlaybackSession]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    playingRef.current = false;
    getEngine().stop();
    saveProgress(paragraphIndex, sentenceIndex);
    // Track listening time
    if (playStartTimeRef.current > 0) {
      const minutesListened = (Date.now() - playStartTimeRef.current) / 60000;
      if (minutesListened > 0.1) updateReadingStats(minutesListened);
      playStartTimeRef.current = 0;
    }
  }, [paragraphIndex, sentenceIndex, saveProgress, getEngine]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const replayCurrentSentence = useCallback(() => {
    getEngine().stop();
    startPlaybackSession();
    saveProgress(paragraphIndex, sentenceIndex);
    speakSentence(paragraphIndex, sentenceIndex);
  }, [paragraphIndex, sentenceIndex, saveProgress, speakSentence, getEngine, startPlaybackSession]);

  const skipCurrentSentence = useCallback(() => {
    const sentences = paragraphIndex < paragraphs.length
      ? splitIntoSentences(paragraphs[paragraphIndex], ttsLimits.current.maxUtteranceLength)
      : [];
    let nextParagraphIndex = paragraphIndex;
    let nextSentenceIndex = sentenceIndex + 1;

    if (nextSentenceIndex >= sentences.length) {
      nextParagraphIndex = paragraphIndex + 1;
      nextSentenceIndex = 0;
    }

    getEngine().stop();
    retryCountRef.current = 0;
    setParagraphIndex(nextParagraphIndex);
    setSentenceIndex(nextSentenceIndex);
    saveProgress(nextParagraphIndex, nextSentenceIndex);

    if (playingRef.current) {
      speakSentence(nextParagraphIndex, nextSentenceIndex);
    }
  }, [paragraphIndex, sentenceIndex, paragraphs, saveProgress, speakSentence, getEngine]);

  const skipForward = useCallback(() => {
    const nextP = Math.min(paragraphIndex + 1, paragraphs.length - 1);
    getEngine().stop();
    setParagraphIndex(nextP);
    setSentenceIndex(0);
    saveProgress(nextP, 0);
    if (playingRef.current) {
      speakSentence(nextP, 0);
    }
  }, [paragraphIndex, paragraphs.length, speakSentence, saveProgress, getEngine]);

  const skipBackward = useCallback(() => {
    const prevP = Math.max(paragraphIndex - 1, 0);
    getEngine().stop();
    setParagraphIndex(prevP);
    setSentenceIndex(0);
    saveProgress(prevP, 0);
    if (playingRef.current) {
      speakSentence(prevP, 0);
    }
  }, [paragraphIndex, speakSentence, saveProgress, getEngine]);

  const seekToParagraph = useCallback(
    (idx: number) => {
      getEngine().stop();
      setParagraphIndex(idx);
      setSentenceIndex(0);
      saveProgress(idx, 0);
      if (playingRef.current) {
        speakSentence(idx, 0);
      }
    },
    [speakSentence, saveProgress, getEngine]
  );

  const changeSpeed = useCallback(
    (newSpeed: number) => {
      setSpeed(newSpeed);
      setGlobalSpeed(newSpeed);
      // 播放中調速：停止當前語音，用新速度從同一句重播
      if (isPlaying && playingRef.current) {
        getEngine().stop();
        // 用 setTimeout 確保 stop 完成後再 speak
        setTimeout(() => {
          if (playingRef.current) {
            speakSentence(paragraphIndex, sentenceIndex);
          }
        }, 100);
      }
    },
    [isPlaying, paragraphIndex, sentenceIndex, speakSentence, getEngine]
  );

  const switchEngine = useCallback(
    (type: TTSEngineType) => {
      // Validate OpenAI prerequisites
      if (type === 'openai') {
        const apiKey = getApiKey();
        const provider = getApiProvider();
        if (!apiKey || provider !== 'openai') {
          toast({
            title: t('ttsEngineOpenaiNeedKey'),
            variant: 'destructive',
            duration: 5000,
          });
          return;
        }
        // Ensure OpenAI engine is initialized
        if (!openaiTTSRef.current) {
          openaiTTSRef.current = new OpenAITTS(apiKey, openaiVoice);
        } else {
          openaiTTSRef.current.setApiKey(apiKey);
        }
      }

      // Stop current playback
      const wasPlaying = playingRef.current;
      if (wasPlaying) {
        getEngine().stop();
      }

      setEngineType(type);
      setTTSEngine(type);
      engineTypeRef.current = type;

      toast({
        title: t('ttsEngineSwitched'),
        description: type === 'openai' ? t('ttsEngineOpenai') : t('ttsEngineBrowser'),
        duration: 2000,
      });

      // Resume playback with new engine
      if (wasPlaying) {
        setTimeout(() => {
          playingRef.current = true;
          setIsPlaying(true);
          speakSentence(paragraphIndex, sentenceIndex);
        }, 200);
      }
    },
    [paragraphIndex, sentenceIndex, speakSentence, getEngine, openaiVoice]
  );

  const changeOpenAIVoice = useCallback(
    (voice: OpenAIVoice) => {
      setOpenaiVoice(voice);
      setOpenAIVoicePref(voice);
      if (openaiTTSRef.current) {
        openaiTTSRef.current.setOpenAIVoice(voice);
      }
      // If currently playing with OpenAI, restart
      if (engineTypeRef.current === 'openai' && playingRef.current) {
        getEngine().stop();
        setTimeout(() => speakSentence(paragraphIndex, sentenceIndex), 200);
      }
    },
    [paragraphIndex, sentenceIndex, speakSentence, getEngine]
  );

  // Re-speak when voice changes during playback (speed is handled in changeSpeed)
  useEffect(() => {
    if (!playingRef.current) return;

    const engine = getEngine();
    engine.stop();
    const currentParagraphIndex = paragraphIndexRef.current;
    const currentSentenceIndex = sentenceIndexRef.current;

    setTimeout(() => {
      if (playingRef.current) {
        speakSentenceRef.current(currentParagraphIndex, currentSentenceIndex);
      }
    }, 100);
  }, [selectedVoice, getEngine]);

  // Cleanup
  useEffect(() => {
    const webTTS = webTTSRef.current;
    const openaiTTS = openaiTTSRef.current;

    return () => {
      webTTS.stop();
      openaiTTS?.stop();
    };
  }, []);

  const progressPercent =
    paragraphs.length > 0 ? Math.round((paragraphIndex / paragraphs.length) * 100) : 0;

  return {
    isPlaying,
    paragraphIndex,
    sentenceIndex,
    paragraphs,
    progressPercent,
    voices,
    selectedVoice,
    setSelectedVoice,
    speed,
    changeSpeed,
    togglePlay,
    replayCurrentSentence,
    skipCurrentSentence,
    skipForward,
    skipBackward,
    seekToParagraph,
    play,
    pause,
    // New: engine switching
    engineType,
    switchEngine,
    openaiVoice,
    changeOpenAIVoice,
    openaiVoices: getOpenAIVoices(),
    setOnFinished: (cb: (() => void) | null) => { onFinishedRef.current = cb; },
  };
}
