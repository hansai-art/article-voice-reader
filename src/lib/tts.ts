import { diagLog } from './diagnostics';

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

export function splitIntoSentences(paragraph: string, maxLength: number = 80): string[] {
  const sentences = paragraph.split(/(?<=[。！？.!?])\s*/);
  const result: string[] = [];
  for (const s of sentences) {
    const trimmed = s.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > maxLength) {
      // 用逗號、分號、冒號等次要斷點再切
      const sub = trimmed.split(/(?<=[，,；;：:、])\s*/);
      let buf = '';
      for (const part of sub) {
        if (buf.length + part.length > maxLength && buf.length > 0) {
          result.push(buf);
          buf = part;
        } else {
          buf += part;
        }
      }
      // 如果還是太長（沒有次要斷點），強制按長度切
      if (buf.length > maxLength) {
        for (let i = 0; i < buf.length; i += maxLength) {
          result.push(buf.slice(i, i + maxLength));
        }
      } else if (buf.length > 0) {
        result.push(buf);
      }
    } else {
      result.push(trimmed);
    }
  }
  return result;
}

export class WebSpeechTTS implements TTSEngine {
  private synth = window.speechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private resumeInterval: ReturnType<typeof setInterval> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private intentionallyStopped = false;
  private watchdogRetryCount = 0;
  private lastEstimatedMs = 0;
  private static readonly MAX_WATCHDOG_RETRIES = 2;
  private static readonly WATCHDOG_BACKOFF_BASE_MS = 300;

  speak(
    text: string,
    rate: number,
    voice: SpeechSynthesisVoice | null,
    onEnd: () => void,
    onBoundary?: (charIndex: number) => void,
    onError?: (error: string, detail: string) => void
  ) {
    this.intentionallyStopped = false;

    if (this.synth.speaking || this.synth.pending) {
      this.synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    if (voice) utterance.voice = voice;

    const cleanup = () => {
      this.stopResumeInterval();
      this.stopWatchdog();
      this.watchdogRetryCount = 0;
    };

    utterance.onend = () => {
      cleanup();
      onEnd();
    };

    utterance.onerror = (e) => {
      cleanup();
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

    // Chrome bug workaround: periodically pause+resume
    this.startResumeInterval();

    // Watchdog: if onend/onerror never fires, force retry
    // Estimate max duration: ~150ms per char at rate 1, min 8s, max 30s
    const estimatedMs = Math.min(30000, Math.max(8000, (text.length * 150) / rate));
    this.lastEstimatedMs = estimatedMs;
    this.startWatchdog(estimatedMs, () => {
      if (this.intentionallyStopped) return;
      // Limit watchdog retries to prevent infinite loops
      if (this.watchdogRetryCount >= WebSpeechTTS.MAX_WATCHDOG_RETRIES) {
        console.warn(`[TTS Watchdog] Max retries (${WebSpeechTTS.MAX_WATCHDOG_RETRIES}) reached, giving up`);
        diagLog('tts_watchdog_exhausted', `Gave up after ${WebSpeechTTS.MAX_WATCHDOG_RETRIES} retries: "${text.slice(0, 50)}..."`, { textLength: text.length, rate });
        this.synth.cancel();
        this.watchdogRetryCount = 0;
        if (onError) {
          onError('watchdog_exhausted', `Utterance stalled repeatedly for "${text.slice(0, 50)}..."`);
        } else {
          onEnd();
        }
        return;
      }
      this.watchdogRetryCount++;
      console.warn(`[TTS Watchdog] Utterance stalled after ${estimatedMs}ms, retry ${this.watchdogRetryCount}/${WebSpeechTTS.MAX_WATCHDOG_RETRIES}`);
      diagLog('tts_watchdog', `Stall detected after ${estimatedMs}ms: "${text.slice(0, 50)}..."`, { textLength: text.length, rate, retry: this.watchdogRetryCount });
      this.synth.cancel();
      // Re-speak the same text with exponential backoff
      const backoff = this.watchdogRetryCount * WebSpeechTTS.WATCHDOG_BACKOFF_BASE_MS;
      setTimeout(() => {
        if (!this.intentionallyStopped) {
          this.speak(text, rate, voice, onEnd, onBoundary, onError);
        }
      }, backoff);
    });
  }

  stop() {
    this.intentionallyStopped = true;
    this.stopResumeInterval();
    this.stopWatchdog();
    this.watchdogRetryCount = 0;
    this.synth.cancel();
    this.currentUtterance = null;
  }

  pause() {
    this.stopResumeInterval();
    this.stopWatchdog();
    this.synth.pause();
  }

  resume() {
    this.synth.resume();
    this.startResumeInterval();
    // Restart watchdog on resume using the original estimated duration (not a fixed 15s)
    if (this.currentUtterance) {
      const timeout = Math.max(15000, this.lastEstimatedMs);
      this.startWatchdog(timeout, () => {
        if (this.intentionallyStopped) return;
        console.warn('[TTS Watchdog] Stalled after resume, forcing next');
        this.synth.cancel();
      });
    }
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
    this.resumeInterval = setInterval(() => {
      if (this.synth.speaking && !this.synth.paused) {
        this.synth.pause();
        this.synth.resume();
      }
    }, 5000);
  }

  private stopResumeInterval() {
    if (this.resumeInterval) {
      clearInterval(this.resumeInterval);
      this.resumeInterval = null;
    }
  }

  private startWatchdog(timeoutMs: number, onTimeout: () => void) {
    this.stopWatchdog();
    this.watchdog = setTimeout(onTimeout, timeoutMs);
  }

  private stopWatchdog() {
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
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
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return; // intentional stop
      this.cleanup();
      this.speaking = false;
      const msg = err instanceof Error ? err.message : 'Unknown error';
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
    if (/^[\w\u4e00-\u9fff]+(\s*[>›»/]\s*[\w\u4e00-\u9fff]+){2,}$/.test(line)) return false;
    return true;
  });

  // Collapse 3+ consecutive empty lines into 2 (one blank line between paragraphs)
  const result: string[] = [];
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

/**
 * Detect the primary language of text content.
 * Returns 'zh' for Chinese-heavy text, 'en' for English-heavy, 'mixed' otherwise.
 */
export function detectLanguage(text: string): 'zh' | 'en' | 'mixed' {
  const sample = text.slice(0, 2000);
  const cjkChars = (sample.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const latinChars = (sample.match(/[a-zA-Z]/g) || []).length;
  const total = cjkChars + latinChars;
  if (total === 0) return 'zh'; // default
  const cjkRatio = cjkChars / total;
  if (cjkRatio > 0.6) return 'zh';
  if (cjkRatio < 0.2) return 'en';
  return 'mixed';
}

/**
 * Extract headings/TOC from paragraphs.
 * Identifies short lines (< 60 chars) that look like headings.
 */
export function extractHeadings(paragraphs: string[]): { index: number; text: string }[] {
  return paragraphs
    .map((p, idx) => ({ index: idx, text: p.trim() }))
    .filter(({ text }) => {
      if (text.length > 80 || text.length < 2) return false;
      // Looks like a heading: short, no ending punctuation, or starts with number/section marker
      if (/^[一二三四五六七八九十\d]+[、.\s]/.test(text)) return true;
      if (/^(第[一二三四五六七八九十\d]+[章節篇部])/.test(text)) return true;
      if (/^#{1,6}\s/.test(text)) return true;
      if (/^\d+\.\s/.test(text)) return true;
      // Short lines without sentence-ending punctuation
      if (text.length <= 40 && !/[。！？.!?]$/.test(text)) return true;
      return false;
    });
}

/**
 * Apply bionic reading: bold the first half of each word.
 * Returns HTML string with <b> tags.
 */
export function applyBionicReading(text: string): string {
  // For Chinese: bold first char of every 2-char group
  // For English: bold first half of each word
  return text.replace(/[\u4e00-\u9fff]{2,}|[a-zA-Z]+/g, (match) => {
    if (/[\u4e00-\u9fff]/.test(match)) {
      // Chinese: bold every other character
      let result = '';
      for (let i = 0; i < match.length; i++) {
        result += i % 2 === 0 ? `<b>${match[i]}</b>` : match[i];
      }
      return result;
    } else {
      // English: bold first half
      const mid = Math.ceil(match.length / 2);
      return `<b>${match.slice(0, mid)}</b>${match.slice(mid)}`;
    }
  });
}
