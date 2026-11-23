import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from '../firebase';
import { apiFetchJson } from './apiClient';
import { SiteAudioExplainerRecord } from '../types';
import {
  AudioLanguage,
  AudioTtsModel,
  AudioVoiceName,
  DEFAULT_AUDIO_METADATA,
  isAllowedAudioMimeType,
  MAX_AUDIO_FILE_BYTES,
  validateNarrationScript,
} from '../../shared/audioExplainer';

export interface AudioTtsStatusResponse {
  ok: boolean;
  geminiConfigured?: boolean;
  preferredModel?: AudioTtsModel;
  fallbackModel?: AudioTtsModel;
  defaultVoice?: AudioVoiceName;
  maxUploadBytes?: number;
  error?: string;
}

export interface GeneratedAudioApiResponse {
  ok: boolean;
  language?: AudioLanguage;
  voiceName?: AudioVoiceName;
  modelUsed?: AudioTtsModel;
  fallbackUsed?: boolean;
  mimeType?: 'audio/wav';
  durationSeconds?: number;
  fileSizeBytes?: number;
  audioBase64?: string;
  error?: string;
}

export interface PersistedAudioResult {
  audioUrl: string;
  storagePath: string;
  storageProvider: 'firebase-storage' | 'server-storage';
  fileName: string;
  mimeType: 'audio/wav' | 'audio/mpeg';
  fileSizeBytes: number;
  durationSeconds: number;
}

export async function getAudioTtsStatusApi(idToken: string): Promise<AudioTtsStatusResponse> {
  const res = await apiFetchJson<AudioTtsStatusResponse>(
    '/api/audio/status',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    },
    'Audio generation API is not connected on this host.'
  );
  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: res.data?.error || res.error || 'Unable to reach audio service.',
    };
  }
  return res.data;
}

export async function generateAudioNarrationApi(
  idToken: string,
  payload: {
    language: AudioLanguage;
    script: string;
    voiceName: AudioVoiceName;
    model: AudioTtsModel;
  }
): Promise<GeneratedAudioApiResponse> {
  const res = await apiFetchJson<GeneratedAudioApiResponse>(
    '/api/audio/generate',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    },
    'Voice generation API is not connected on this host. Please ensure the Node.js server is running.'
  );
  if (!res.ok || !res.data || !res.data.ok) {
    throw new Error(res.data?.error || res.error || 'Voice narration generation failed.');
  }
  return res.data;
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read audio file data.'));
    reader.readAsDataURL(blob);
  });
}

export async function measureBrowserAudioDuration(blob: Blob): Promise<number> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return 0;
  const objectUrl = URL.createObjectURL(blob);
  return new Promise<number>((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      resolve(0);
    }, 4500);

    const finalize = (duration: number) => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(duration) && duration > 0 ? Math.round(duration * 10) / 10 : 0);
    };

    audio.onloadedmetadata = () => finalize(audio.duration);
    audio.onerror = () => finalize(0);
    audio.src = objectUrl;
  });
}

async function uploadAudioToServerFallbackApi(params: {
  idToken: string;
  language: AudioLanguage;
  audioBase64: string;
  mimeType: string;
  fileName: string;
  durationSeconds: number;
}): Promise<PersistedAudioResult> {
  const res = await apiFetchJson<{
    ok: boolean;
    audioUrl?: string;
    storagePath?: string;
    fileName?: string;
    mimeType?: 'audio/wav' | 'audio/mpeg';
    fileSizeBytes?: number;
    durationSeconds?: number;
    error?: string;
  }>(
    '/api/audio/upload',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.idToken}`,
      },
      body: JSON.stringify({
        language: params.language,
        audioBase64: params.audioBase64,
        mimeType: params.mimeType,
        fileName: params.fileName,
        durationSeconds: params.durationSeconds,
      }),
    },
    'Audio upload API is not connected on this host. Please ensure Firebase Storage rules or the Node.js server are active.'
  );
  const data = res.data;
  if (!res.ok || !data || !data.ok || !data.audioUrl) {
    throw new Error(data?.error || res.error || 'Failed to store audio file.');
  }
  return {
    audioUrl: data.audioUrl,
    storagePath: data.storagePath || `server/site-audio/${data.fileName || params.fileName}`,
    storageProvider: 'server-storage',
    fileName: data.fileName || params.fileName,
    mimeType: data.mimeType || (params.mimeType.includes('mpeg') || params.mimeType.includes('mp3') ? 'audio/mpeg' : 'audio/wav'),
    fileSizeBytes: data.fileSizeBytes || 0,
    durationSeconds: data.durationSeconds || params.durationSeconds,
  };
}

/**
 * Persists an MP3 or WAV audio blob to Firebase Storage (`site_audio/{lang}/*`),
 * automatically falling back to persistent server storage (`/api/audio/upload`) if
 * bucket Storage rules are not yet deployed.
 */
export async function persistAudioBlob(params: {
  idToken: string;
  language: AudioLanguage;
  blob: Blob;
  mimeType: string;
  fileName: string;
  durationSeconds?: number;
  existingBase64?: string;
}): Promise<PersistedAudioResult> {
  if (!isAllowedAudioMimeType(params.mimeType)) {
    throw new Error('Only MP3 and WAV audio files are supported.');
  }
  if (params.blob.size === 0) {
    throw new Error('Selected audio file is empty.');
  }
  if (params.blob.size > MAX_AUDIO_FILE_BYTES) {
    throw new Error('Audio file exceeds the 25 MB maximum upload limit.');
  }

  const isMp3 = params.mimeType.toLowerCase().includes('mpeg') || params.mimeType.toLowerCase().includes('mp3');
  const normalizedMime: 'audio/wav' | 'audio/mpeg' = isMp3 ? 'audio/mpeg' : 'audio/wav';
  const ext = isMp3 ? 'mp3' : 'wav';
  const safeBase =
    params.fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || `epr-bazaar-${params.language}`;
  const finalFileName = `${params.language}_${safeBase}_${Date.now()}.${ext}`;

  const measuredDuration =
    params.durationSeconds && params.durationSeconds > 0
      ? Math.round(params.durationSeconds * 10) / 10
      : await measureBrowserAudioDuration(params.blob);

  if (storage) {
    try {
      const storagePath = `site_audio/${params.language}/${finalFileName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, params.blob, {
        contentType: normalizedMime,
        cacheControl: 'public, max-age=31536000',
      });
      const audioUrl = await getDownloadURL(storageRef);
      return {
        audioUrl,
        storagePath,
        storageProvider: 'firebase-storage',
        fileName: finalFileName,
        mimeType: normalizedMime,
        fileSizeBytes: params.blob.size,
        durationSeconds: measuredDuration,
      };
    } catch {
      // Fall back to persistent server storage if Firebase Storage rules are not deployed yet
    }
  }

  const audioBase64 = params.existingBase64 || (await blobToBase64(params.blob));
  return uploadAudioToServerFallbackApi({
    idToken: params.idToken,
    language: params.language,
    audioBase64,
    mimeType: normalizedMime,
    fileName: finalFileName,
    durationSeconds: measuredDuration,
  });
}

export async function saveSiteAudioExplainerDoc(params: {
  language: AudioLanguage;
  title?: string;
  narrationScript: string;
  audioUrl?: string;
  storagePath?: string;
  storageProvider?: 'firebase-storage' | 'server-storage' | 'none';
  mimeType?: 'audio/wav' | 'audio/mpeg' | 'audio/mp3' | '';
  fileName?: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  sourceType?: 'ai-generated' | 'uploaded' | 'none';
  modelUsed?: string;
  voiceName?: string;
  published?: boolean;
  actorUid: string;
  actorEmail: string;
}): Promise<void> {
  const langMeta = DEFAULT_AUDIO_METADATA[params.language];
  const validation = validateNarrationScript(params.narrationScript);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid narration script.');
  }

  const refDoc = doc(db, 'site_audio_explainers', params.language);
  try {
    const snap = await getDoc(refDoc);
    const existing = snap.exists() ? (snap.data() as SiteAudioExplainerRecord) : null;

    const nextAudioUrl = params.audioUrl !== undefined ? params.audioUrl : existing?.audioUrl || '';
    const nextPublished =
      params.published !== undefined ? params.published : existing?.published || false;

    if (nextPublished && !nextAudioUrl) {
      throw new Error('Generate or upload an audio file before publishing.');
    }

    const payload = {
      id: params.language,
      language: params.language,
      languageLabel: langMeta.languageLabel,
      title: (params.title || existing?.title || langMeta.title).trim().slice(0, 160),
      narrationScript: validation.clean,
      audioUrl: nextAudioUrl.slice(0, 1200),
      storagePath: (params.storagePath !== undefined ? params.storagePath : existing?.storagePath || '').slice(0, 400),
      storageProvider:
        params.storageProvider !== undefined
          ? params.storageProvider
          : existing?.storageProvider || (nextAudioUrl ? 'server-storage' : 'none'),
      mimeType:
        params.mimeType !== undefined
          ? params.mimeType
          : existing?.mimeType || '',
      fileName: (params.fileName !== undefined ? params.fileName : existing?.fileName || '').slice(0, 240),
      fileSizeBytes:
        params.fileSizeBytes !== undefined
          ? Math.max(0, Math.round(params.fileSizeBytes))
          : existing?.fileSizeBytes || 0,
      durationSeconds:
        params.durationSeconds !== undefined
          ? Math.max(0, Math.round(params.durationSeconds * 10) / 10)
          : existing?.durationSeconds || 0,
      sourceType:
        params.sourceType !== undefined
          ? params.sourceType
          : existing?.sourceType || 'none',
      modelUsed: (params.modelUsed !== undefined ? params.modelUsed : existing?.modelUsed || '').slice(0, 120),
      voiceName: (params.voiceName !== undefined ? params.voiceName : existing?.voiceName || 'Charon').slice(0, 60),
      published: nextPublished,
      updatedByUid: params.actorUid,
      updatedByEmail: (params.actorEmail || '').slice(0, 160),
      createdAt: existing?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (existing) {
      await updateDoc(refDoc, payload);
    } else {
      await setDoc(refDoc, payload);
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Generate or upload') || error.message.includes('Narration script'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `site_audio_explainers/${params.language}`);
  }
}

export async function toggleSiteAudioPublishDoc(params: {
  record: SiteAudioExplainerRecord;
  publish: boolean;
  actorUid: string;
  actorEmail: string;
}): Promise<void> {
  if (params.publish && !params.record.audioUrl) {
    throw new Error('Generate or upload an audio file before publishing this language.');
  }
  const refDoc = doc(db, 'site_audio_explainers', params.record.language);
  try {
    await updateDoc(refDoc, {
      published: params.publish,
      updatedByUid: params.actorUid,
      updatedByEmail: (params.actorEmail || '').slice(0, 160),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `site_audio_explainers/${params.record.language}`);
  }
}
