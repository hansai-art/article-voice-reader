export interface TTSEngine {
  speak(text: string, rate: number, voice: SpeechSynthesisVoice | null, onEnd: () => void, onBoundary?: (charIndex: number) => void): void;
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
  // Split on Chinese and English sentence endings
  const sentences = paragraph.split(/(?<=[。！？.!?])\s*/);
  return sentences.filter((s) => s.trim().length > 0);
}

export class WebSpeechTTS implements TTSEngine {
  private synth = window.speechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  speak(
    text: string,
    rate: number,
    voice: SpeechSynthesisVoice | null,
    onEnd: () => void,
    onBoundary?: (charIndex: number) => void
  ) {
    this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    if (voice) utterance.voice = voice;
    utterance.onend = () => onEnd();
    utterance.onerror = (e) => {
      if (e.error !== 'canceled') onEnd();
    };
    if (onBoundary) {
      utterance.onboundary = (e) => onBoundary(e.charIndex);
    }
    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  stop() {
    this.synth.cancel();
    this.currentUtterance = null;
  }

  pause() {
    this.synth.pause();
  }

  resume() {
    this.synth.resume();
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
}

export function estimateReadingTime(charCount: number, speed: number = 1): number {
  // ~250 chars/min for Chinese at 1x speed
  return Math.ceil(charCount / (250 * speed));
}
