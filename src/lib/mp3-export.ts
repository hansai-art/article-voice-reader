import { getApiKey, getApiProvider } from './storage';
import { splitIntoParagraphs } from './tts';

export type ExportVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

const OPENAI_VOICES: ExportVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

export function getExportVoices(): ExportVoice[] {
  return OPENAI_VOICES;
}

/**
 * Export article to MP3 using OpenAI TTS API.
 * Processes paragraphs in chunks and merges audio.
 */
export async function exportToMp3(
  content: string,
  voice: ExportVoice = 'nova',
  speed: number = 1.0,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const apiKey = getApiKey();
  const provider = getApiProvider();

  if (!apiKey) throw new Error('NO_API_KEY');
  if (provider !== 'openai') throw new Error('OPENAI_ONLY');

  const paragraphs = splitIntoParagraphs(content);
  const chunks: ArrayBuffer[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i];
    if (text.length === 0) continue;

    // OpenAI TTS has a 4096 char limit per request
    const textChunks = splitTextForTTS(text, 4000);

    for (const chunk of textChunks) {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: chunk,
          voice,
          speed,
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('[MP3 Export] OpenAI TTS error:', err);
        throw new Error(`TTS_ERROR: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      chunks.push(buffer);
    }

    if (onProgress) {
      onProgress(Math.round(((i + 1) / paragraphs.length) * 100));
    }
  }

  // Concatenate all MP3 chunks
  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  return new Blob([merged], { type: 'audio/mpeg' });
}

function splitTextForTTS(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Find a good split point
    let splitAt = remaining.lastIndexOf('。', maxLen);
    if (splitAt === -1) splitAt = remaining.lastIndexOf('.', maxLen);
    if (splitAt === -1) splitAt = remaining.lastIndexOf(' ', maxLen);
    if (splitAt === -1 || splitAt < maxLen / 2) splitAt = maxLen;
    else splitAt += 1;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  return chunks;
}
