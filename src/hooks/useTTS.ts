import { useState, useEffect, useRef, useCallback } from 'react';
import { WebSpeechTTS, splitIntoParagraphs, splitIntoSentences } from '@/lib/tts';
import { Article, saveArticle, setLastPlayedId } from '@/lib/storage';

export function useTTS(article: Article | null) {
  const ttsRef = useRef(new WebSpeechTTS());
  const [isPlaying, setIsPlaying] = useState(false);
  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speed, setSpeed] = useState(1.0);
  const articleRef = useRef(article);
  const playingRef = useRef(false);

  const paragraphs = article ? splitIntoParagraphs(article.content) : [];
  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;

  useEffect(() => {
    articleRef.current = article;
  }, [article]);

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      const v = ttsRef.current.getVoices();
      setVoices(v);
      if (!selectedVoice && v.length > 0) {
        // Prefer Chinese voice
        const zh = v.find((voice) => voice.lang.startsWith('zh'));
        setSelectedVoice(zh || v[0]);
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
        return;
      }

      const sentences = splitIntoSentences(paras[pIdx]);
      if (sIdx >= sentences.length) {
        // Move to next paragraph
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

      ttsRef.current.speak(sentences[sIdx], speed, selectedVoice, () => {
        if (playingRef.current) {
          speakSentence(pIdx, sIdx + 1);
        }
      });
    },
    [speed, selectedVoice, saveProgress]
  );

  const play = useCallback(() => {
    setIsPlaying(true);
    playingRef.current = true;
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
      if (isPlaying) {
        ttsRef.current.stop();
        // Will re-speak with new speed via effect
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
