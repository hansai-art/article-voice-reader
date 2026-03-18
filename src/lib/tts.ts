export interface TTSEngine {
  speak(
    text: string,
    rate: number,
    voice: SpeechSynthesisVoice | null,
    onEnd: () => void,
    onBoundary?: (charIndex: number) => void,
    onError?: (error: string, detail: string) => void
  ): void;
  stop(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  isSpeaking(): boolean;
  getVoices(): SpeechSynthesisVoice[];
}

export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function splitIntoSentences(paragraph: string): string[] {
  const sentences = paragraph.split(/(?<=[。！？.!?])\s*/);
  return sentences.filter((s) => s.trim().length > 0);
}

export class WebSpeechTTS implements TTSEngine {
  private synth = window.speechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private resumeInterval: ReturnType<typeof setInterval> | null = null;

  speak(
    text: string,
    rate: number,
    voice: SpeechSynthesisVoice | null,
    onEnd: () => void,
    onBoundary?: (charIndex: number) => void,
    onError?: (error: string, detail: string) => void
  ) {
    // Don't cancel before speaking — just let the new utterance queue
    // Only cancel if something is actively speaking and we need to interrupt
    if (this.synth.speaking || this.synth.pending) {
      this.synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      this.stopResumeInterval();
      onEnd();
    };

    utterance.onerror = (e) => {
      this.stopResumeInterval();
      // "canceled" and "interrupted" are expected when we stop/skip — not real errors
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      if (onError) {
        const detail = `error="${e.error}" text="${text.slice(0, 50)}..." voice="${voice?.name || 'none'}" rate=${rate}`;
        onError(e.error, detail);
      } else {
        onEnd();
      }
    };

    if (onBoundary) {
      utterance.onboundary = (e) => onBoundary(e.charIndex);
    }

    this.currentUtterance = utterance;
    this.synth.speak(utterance);

    // Chrome bug workaround: speechSynthesis pauses after ~15s without interaction
    // Periodically call resume() to keep it going
    this.startResumeInterval();
  }

  stop() {
    this.stopResumeInterval();
    this.synth.cancel();
    this.currentUtterance = null;
  }

  pause() {
    this.stopResumeInterval();
    this.synth.pause();
  }

  resume() {
    this.synth.resume();
    this.startResumeInterval();
  }

  isPaused() {
    return this.synth.paused;
  }

  isSpeaking() {
    return this.synth.speaking;
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.synth.getVoices();
  }

  private startResumeInterval() {
    this.stopResumeInterval();
    // Every 10 seconds, call resume() to prevent Chrome's auto-pause
    this.resumeInterval = setInterval(() => {
      if (this.synth.speaking && !this.synth.paused) {
        this.synth.resume();
      }
    }, 10000);
  }

  private stopResumeInterval() {
    if (this.resumeInterval) {
      clearInterval(this.resumeInterval);
      this.resumeInterval = null;
    }
  }
}

export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

const OPENAI_VOICES: OpenAIVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

export function getOpenAIVoices(): OpenAIVoice[] {
  return OPENAI_VOICES;
}

/**
 * OpenAI TTS engine — streams sentences through the OpenAI TTS API
 * and plays them back via HTMLAudioElement.
 */
export class OpenAITTS implements TTSEngine {
  private audio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private paused = false;
  private speaking = false;
  private abortController: AbortController | null = null;
  private apiKey: string;
  private openaiVoice: OpenAIVoice = 'nova';
  private prefetchedAudio: Map<string, Blob> = new Map();
  private prefetchController: AbortController | null = null;

  constructor(apiKey: string, voice: OpenAIVoice = 'nova') {
    this.apiKey = apiKey;
    this.openaiVoice = voice;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  setOpenAIVoice(voice: OpenAIVoice) {
    this.openaiVoice = voice;
  }

  getOpenAIVoice(): OpenAIVoice {
    return this.openaiVoice;
  }

  /**
   * Pre-fetch audio for a given text so it's ready when needed.
   */
  prefetch(text: string, rate: number) {
    if (this.prefetchedAudio.has(text)) return;
    this.prefetchController?.abort();
    this.prefetchController = new AbortController();
    this.fetchAudio(text, rate, this.prefetchController.signal)
      .then((blob) => {
        if (blob) this.prefetchedAudio.set(text, blob);
      })
      .catch(() => {
        // prefetch failure is non-critical
      });
  }

  async speak(
    text: string,
    rate: number,
    _voice: SpeechSynthesisVoice | null,
    onEnd: () => void,
    _onBoundary?: (charIndex: number) => void,
    onError?: (error: string, detail: string) => void
  ) {
    this.stop();
    this.speaking = true;
    this.paused = false;

    try {
      // Check if we have a prefetched blob
      let blob = this.prefetchedAudio.get(text);
      if (blob) {
        this.prefetchedAudio.delete(text);
      } else {
        this.abortController = new AbortController();
        blob = await this.fetchAudio(text, rate, this.abortController.signal);
      }

      if (!blob) {
        this.speaking = false;
        if (onError) onError('fetch_failed', `Failed to fetch audio for "${text.slice(0, 50)}..."`);
        else onEnd();
        return;
      }

      // If we were stopped while fetching, don't play
      if (!this.speaking) return;

      this.currentObjectUrl = URL.createObjectURL(blob);
      this.audio = new Audio(this.currentObjectUrl);

      this.audio.onended = () => {
        this.cleanup();
        this.speaking = false;
        onEnd();
      };

      this.audio.onerror = () => {
        this.cleanup();
        this.speaking = false;
        if (onError) onError('playback_error', `Audio playback failed for "${text.slice(0, 50)}..."`);
        else onEnd();
      };

      await this.audio.play();
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // intentional stop
      this.cleanup();
      this.speaking = false;
      const msg = err?.message || 'Unknown error';
      if (onError) onError('openai_tts_error', msg);
      else onEnd();
    }
  }

  stop() {
    this.abortController?.abort();
    this.abortController = null;
    this.prefetchController?.abort();
    this.prefetchController = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
    }
    this.cleanup();
    this.speaking = false;
    this.paused = false;
    // Clear prefetch cache
    this.prefetchedAudio.clear();
  }

  pause() {
    if (this.audio && this.speaking) {
      this.audio.pause();
      this.paused = true;
    }
  }

  resume() {
    if (this.audio && this.paused) {
      this.audio.play();
      this.paused = false;
    }
  }

  isPaused() {
    return this.paused;
  }

  isSpeaking() {
    return this.speaking;
  }

  getVoices(): SpeechSynthesisVoice[] {
    // OpenAI TTS doesn't use browser voices
    return [];
  }

  private async fetchAudio(
    text: string,
    speed: number,
    signal: AbortSignal
  ): Promise<Blob | null> {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: this.openaiVoice,
        speed,
        response_format: 'mp3',
      }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI TTS API ${response.status}: ${errText}`);
    }

    return response.blob();
  }

  private cleanup() {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.audio = null;
  }
}

export function estimateReadingTime(charCount: number, speed: number = 1): number {
  return Math.ceil(charCount / (250 * speed));
}

/**
 * Clean up text that was copy-pasted from web pages.
 * Removes: extra whitespace, short junk lines, common web artifacts.
 */
export function cleanText(text: string): string {
  let lines = text.split('\n');

  // Trim each line
  lines = lines.map((l) => l.trim());

  // Remove common web artifacts
  lines = lines.filter((line) => {
    // Skip empty lines (will handle spacing later)
    if (line === '') return true;
    // Remove lines that are just symbols/punctuation noise
    if (/^[•·▪▸►◆■□●○|—–\-=_~*#>]+$/.test(line)) return false;
    // Remove common web UI patterns
    if (/^(share|分享|tweet|like|讚|留言|comment|reply|回覆|subscribe|訂閱|follow|追蹤|more|更多|menu|選單|home|首頁|search|搜尋|login|登入|sign up|註冊|advertisement|廣告|ad|loading|載入中|read more|繼續閱讀|click here|點此|download|下載|print|列印|copy|複製|previous|上一篇|next|下一篇|related|相關)$/i.test(line)) return false;
    // Remove lines that look like breadcrumbs (Home > Category > ...)
    if (/^[\w\u4e00-\u9fff]+(\s*[>›»\/]\s*[\w\u4e00-\u9fff]+){2,}$/.test(line)) return false;
    return true;
  });

  // Collapse 3+ consecutive empty lines into 2 (one blank line between paragraphs)
  let result: string[] = [];
  let emptyCount = 0;
  for (const line of lines) {
    if (line === '') {
      emptyCount++;
      if (emptyCount <= 2) result.push(line);
    } else {
      emptyCount = 0;
      // Collapse multiple spaces within a line
      result.push(line.replace(/\s{2,}/g, ' '));
    }
  }

  // Remove leading/trailing empty lines
  let text2 = result.join('\n').trim();

  // Remove isolated very short lines (1-2 chars) that are sandwiched between empty lines
  // These are typically page numbers, bullet markers, etc.
  text2 = text2.replace(/\n\n.{1,2}\n\n/g, '\n\n');

  return text2;
}
