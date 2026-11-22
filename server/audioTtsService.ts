import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import {
  DEFAULT_AUDIO_METADATA,
  FALLBACK_TTS_MODEL,
  isAllowedAudioMimeType,
  MAX_AUDIO_FILE_BYTES,
  normalizeAudioLanguage,
  normalizeAudioModel,
  normalizeAudioVoice,
  PREFERRED_TTS_MODEL,
  validateNarrationScript,
} from '../shared/audioExplainer.ts';
import type { AudioLanguage, AudioTtsModel, AudioVoiceName } from '../shared/audioExplainer.ts';

export interface TtsGenerationInput {
  language: AudioLanguage;
  script: string;
  voiceName?: AudioVoiceName;
  model?: AudioTtsModel;
}

export interface TtsGenerationResult {
  wavBuffer: Buffer;
  mimeType: 'audio/wav';
  durationSeconds: number;
  fileSizeBytes: number;
  modelUsed: AudioTtsModel;
  fallbackUsed: boolean;
  voiceName: AudioVoiceName;
  language: AudioLanguage;
}

export interface TtsServiceStatus {
  geminiConfigured: boolean;
  preferredModel: AudioTtsModel;
  fallbackModel: AudioTtsModel;
  defaultVoice: AudioVoiceName;
  maxUploadBytes: number;
}

export type SingleChunkSynthesizer = (params: {
  text: string;
  style: string;
  voiceName: AudioVoiceName;
  model: AudioTtsModel;
}) => Promise<Buffer>;

const AUDIO_STORAGE_DIR = path.resolve(process.cwd(), 'data', 'site-audio');
const MAX_CHUNK_CHARS = 1350;
const SECTION_PAUSE_MS = 450;

export function getAudioTtsServiceStatus(): TtsServiceStatus {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const geminiConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
  return {
    geminiConfigured,
    preferredModel: PREFERRED_TTS_MODEL,
    fallbackModel: FALLBACK_TTS_MODEL,
    defaultVoice: 'Charon',
    maxUploadBytes: MAX_AUDIO_FILE_BYTES,
  };
}

function createGeminiTtsClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY is not configured in server environment secrets. Add GEMINI_API_KEY in Settings > Secrets or upload an MP3/WAV narration manually.'
    ) as Error & { statusCode?: number };
    err.statusCode = 503;
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Inspects a standard PCM WAV buffer (RIFF/WAVE) and extracts format metadata & duration.
 */
export function parseWavMetadata(wavBuffer: Buffer): {
  isValidWav: boolean;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
  durationSeconds: number;
} {
  if (
    wavBuffer.length < 44 ||
    wavBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
    wavBuffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return {
      isValidWav: false,
      sampleRate: 24000,
      numChannels: 1,
      bitsPerSample: 16,
      dataOffset: 44,
      dataSize: Math.max(0, wavBuffer.length - 44),
      durationSeconds: 0,
    };
  }

  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = 44;
  let dataSize = Math.max(0, wavBuffer.length - 44);

  let offset = 12;
  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ' && offset + 24 <= wavBuffer.length) {
      numChannels = wavBuffer.readUInt16LE(offset + 10) || 1;
      sampleRate = wavBuffer.readUInt32LE(offset + 12) || 24000;
      bitsPerSample = wavBuffer.readUInt16LE(offset + 22) || 16;
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, Math.max(0, wavBuffer.length - dataOffset));
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  const durationSeconds = bytesPerSecond > 0 ? Math.round((dataSize / bytesPerSecond) * 10) / 10 : 0;

  return {
    isValidWav: true,
    sampleRate,
    numChannels,
    bitsPerSample,
    dataOffset,
    dataSize,
    durationSeconds,
  };
}

/**
 * Builds a compliant 44-byte RIFF/WAVE header around raw PCM bytes.
 */
export function buildWavBufferFromPcm(
  pcmData: Buffer,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * Concatenates multiple unary Gemini TTS WAV buffers into one clean WAV file,
 * inserting a brief silent pause between clips and rewriting the RIFF header.
 */
export function concatenateWavBuffers(wavBuffers: Buffer[], pauseMs = SECTION_PAUSE_MS): Buffer {
  if (wavBuffers.length === 0) {
    throw new Error('No audio buffers available to combine.');
  }
  if (wavBuffers.length === 1) {
    const first = wavBuffers[0];
    const meta = parseWavMetadata(first);
    return meta.isValidWav ? first : buildWavBufferFromPcm(first);
  }

  const firstMeta = parseWavMetadata(wavBuffers[0]);
  const sampleRate = firstMeta.sampleRate;
  const numChannels = firstMeta.numChannels;
  const bitsPerSample = firstMeta.bitsPerSample;
  const bytesPerSample = numChannels * (bitsPerSample / 8);
  const pauseSamples = Math.max(0, Math.round((sampleRate * pauseMs) / 1000));
  const silenceBuf = Buffer.alloc(pauseSamples * bytesPerSample);

  const pcmSegments: Buffer[] = [];
  wavBuffers.forEach((buf, idx) => {
    const meta = parseWavMetadata(buf);
    const pcm = meta.isValidWav
      ? buf.subarray(meta.dataOffset, meta.dataOffset + meta.dataSize)
      : buf;
    pcmSegments.push(pcm);
    if (idx < wavBuffers.length - 1 && silenceBuf.length > 0) {
      pcmSegments.push(silenceBuf);
    }
  });

  return buildWavBufferFromPcm(Buffer.concat(pcmSegments), sampleRate, numChannels, bitsPerSample);
}

/**
 * Splits long narration text cleanly along paragraph boundaries so long Hindi/English
 * scripts stay well within unary Gemini TTS limits while maintaining natural section pauses.
 */
export function splitNarrationIntoChunks(script: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const clean = script.trim();
  if (clean.length <= maxChars) return [clean];

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (!current) {
      current = para;
      continue;
    }
    if (current.length + 2 + para.length <= maxChars) {
      current = `${current}\n\n${para}`;
    } else {
      chunks.push(current);
      current = para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function synthesizeChunkWithGemini(params: {
  text: string;
  style: string;
  voiceName: AudioVoiceName;
  model: AudioTtsModel;
}): Promise<Buffer> {
  const ai = createGeminiTtsClient();
  const response = await ai.models.generateContent({
    model: params.model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: params.text,
            speechMetadata: {
              style: params.style,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: params.voiceName,
          },
        },
      },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find((p) => Boolean(p.inlineData?.data));
  const base64Audio = audioPart?.inlineData?.data;
  if (!base64Audio) {
    throw new Error(`Gemini TTS (${params.model}) returned an empty audio response.`);
  }
  const rawBuffer = Buffer.from(base64Audio, 'base64');
  const meta = parseWavMetadata(rawBuffer);
  return meta.isValidWav ? rawBuffer : buildWavBufferFromPcm(rawBuffer);
}

function isModelAvailabilityError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('not found') ||
    msg.includes('404') ||
    msg.includes('not supported') ||
    msg.includes('unavailable') ||
    msg.includes('does not exist')
  );
}

export async function generateNarrationAudio(
  input: TtsGenerationInput,
  options?: { synthesizer?: SingleChunkSynthesizer }
): Promise<TtsGenerationResult> {
  const language = normalizeAudioLanguage(input.language);
  const voiceName = normalizeAudioVoice(input.voiceName);
  const requestedModel = normalizeAudioModel(input.model);

  const validation = validateNarrationScript(input.script);
  if (!validation.valid) {
    const err = new Error(validation.error || 'Invalid narration script.') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const synth = options?.synthesizer || synthesizeChunkWithGemini;
  const style = DEFAULT_AUDIO_METADATA[language].voiceStylePrompt;
  const chunks = splitNarrationIntoChunks(validation.clean);

  let modelUsed: AudioTtsModel = requestedModel;
  let fallbackUsed = false;

  const synthesizeAll = async (model: AudioTtsModel): Promise<Buffer[]> => {
    const out: Buffer[] = [];
    for (const chunk of chunks) {
      const buf = await synth({ text: chunk, style, voiceName, model });
      out.push(buf);
    }
    return out;
  };

  let clipBuffers: Buffer[];
  try {
    clipBuffers = await synthesizeAll(requestedModel);
  } catch (err) {
    if (requestedModel === PREFERRED_TTS_MODEL && isModelAvailabilityError(err)) {
      modelUsed = FALLBACK_TTS_MODEL;
      fallbackUsed = true;
      clipBuffers = await synthesizeAll(FALLBACK_TTS_MODEL);
    } else {
      throw err;
    }
  }

  const wavBuffer = concatenateWavBuffers(clipBuffers, SECTION_PAUSE_MS);
  const meta = parseWavMetadata(wavBuffer);

  return {
    wavBuffer,
    mimeType: 'audio/wav',
    durationSeconds: meta.durationSeconds,
    fileSizeBytes: wavBuffer.length,
    modelUsed,
    fallbackUsed,
    voiceName,
    language,
  };
}

export function ensureAudioStorageDir(customDir?: string): string {
  const dir = customDir || AUDIO_STORAGE_DIR;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function savePersistentServerAudio(params: {
  language: AudioLanguage;
  buffer: Buffer;
  mimeType: string;
  originalFileName?: string;
  storageDir?: string;
}): {
  fileName: string;
  filePath: string;
  publicUrl: string;
  mimeType: 'audio/wav' | 'audio/mpeg';
  fileSizeBytes: number;
} {
  if (!params.buffer || params.buffer.length === 0) {
    const err = new Error('Audio payload is empty.') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  if (params.buffer.length > MAX_AUDIO_FILE_BYTES) {
    const err = new Error('Audio file exceeds the 25 MB maximum upload limit.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 413;
    throw err;
  }
  if (!isAllowedAudioMimeType(params.mimeType)) {
    const err = new Error('Only MP3 and WAV audio files are supported.') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const isMp3 = params.mimeType.toLowerCase().includes('mpeg') || params.mimeType.toLowerCase().includes('mp3');
  const ext = isMp3 ? 'mp3' : 'wav';
  const normalizedMime: 'audio/wav' | 'audio/mpeg' = isMp3 ? 'audio/mpeg' : 'audio/wav';

  // Basic magic byte verification to reject masqueraded non-audio files
  if (!isMp3) {
    const header = params.buffer.toString('ascii', 0, 4);
    if (header !== 'RIFF') {
      const err = new Error('Uploaded file is not a valid WAV audio file.') as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
  } else {
    const hasId3 = params.buffer.toString('ascii', 0, 3) === 'ID3';
    const hasFrameSync = params.buffer.length >= 2 && params.buffer[0] === 0xff && (params.buffer[1] & 0xe0) === 0xe0;
    if (!hasId3 && !hasFrameSync) {
      const err = new Error('Uploaded file is not a valid MP3 audio file.') as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
  }

  const dir = ensureAudioStorageDir(params.storageDir);
  const stamp = Date.now();
  const safeBase = (params.originalFileName || `epr-bazaar-${params.language}`)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `epr-bazaar-${params.language}`;

  const fileName = `${params.language}_${safeBase}_${stamp}.${ext}`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, params.buffer);

  return {
    fileName,
    filePath,
    publicUrl: `/api/audio/files/${encodeURIComponent(fileName)}`,
    mimeType: normalizedMime,
    fileSizeBytes: params.buffer.length,
  };
}

export function resolveSafeServerAudioPath(
  fileName: string,
  storageDir?: string
): { filePath: string; contentType: 'audio/wav' | 'audio/mpeg' } | null {
  const clean = (fileName || '').trim();
  if (!/^[a-zA-Z0-9._-]+\.(wav|mp3)$/i.test(clean) || clean.includes('..')) {
    return null;
  }
  const dir = path.resolve(storageDir || AUDIO_STORAGE_DIR);
  const resolved = path.resolve(dir, clean);
  if (!resolved.startsWith(dir + path.sep)) {
    return null;
  }
  if (!fs.existsSync(resolved)) {
    return null;
  }
  const contentType = clean.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';
  return { filePath: resolved, contentType };
}
