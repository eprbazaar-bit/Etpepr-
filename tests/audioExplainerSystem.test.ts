import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApiApp } from '../server.ts';
import {
  buildWavBufferFromPcm,
  concatenateWavBuffers,
  parseWavMetadata,
  splitNarrationIntoChunks,
} from '../server/audioTtsService.ts';
import type { SingleChunkSynthesizer } from '../server/audioTtsService.ts';
import {
  DEFAULT_AUDIO_METADATA,
  FALLBACK_TTS_MODEL,
  formatAudioDuration,
  PREFERRED_TTS_MODEL,
  validateNarrationScript,
} from '../shared/audioExplainer.ts';

function makeSilentWav(durationSec = 0.5, sampleRate = 24000): Buffer {
  const numSamples = Math.round(sampleRate * durationSec);
  const pcm = Buffer.alloc(numSamples * 2); // 16-bit mono
  return buildWavBufferFromPcm(pcm, sampleRate, 1, 16);
}

function startAudioTestServer(options: {
  audioStorageDir: string;
  synthesizer?: SingleChunkSynthesizer;
}) {
  const app = createApiApp({
    audioStorageDir: options.audioStorageDir,
    synthesizeAudioChunk: options.synthesizer,
    verifyToken: async (authHeader) => {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const err = new Error('Missing authorization token') as Error & { statusCode?: number };
        err.statusCode = 401;
        throw err;
      }
      const token = authHeader.slice('Bearer '.length).trim();
      if (token === 'admin-token') {
        return { uid: 'admin-1', email: 'ajaykumartiwari609@gmail.com' };
      }
      return { uid: 'buyer-1', email: 'buyer@company.com' };
    },
  });

  const server = http.createServer(app);
  return {
    listen: () =>
      new Promise<string>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr !== 'string') {
            resolve(`http://127.0.0.1:${addr.port}`);
          }
        });
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe('EPR Bazaar AI Voice Explanation System', () => {
  it('provides accurate 9-point English and Hindi default scripts without invented unsupported features', () => {
    const enScript = DEFAULT_AUDIO_METADATA.en.defaultScript;
    const hiScript = DEFAULT_AUDIO_METADATA.hi.defaultScript;

    assert.equal(validateNarrationScript(enScript).valid, true);
    assert.equal(validateNarrationScript(hiScript).valid, true);

    assert.equal(enScript.split('\n\n').length, 9);
    assert.equal(hiScript.split('\n\n').length, 9);

    assert.match(enScript, /Nyanvi EcoClean Private Limited/i);
    assert.match(enScript, /Recyclers/i);
    assert.match(enScript, /PIBOs/i);
    assert.match(enScript, /KYC, GSTIN/i);
    assert.match(enScript, /CPCB/i);
    assert.match(hiScript, /न्यानवी इकोक्लीन प्राइवेट लिमिटेड/);
    assert.match(hiScript, /PIBOs/);
    assert.match(hiScript, /KYC, GSTIN/);

    // Must not invent unsupported payment gateways, escrow, or government approval claims
    const forbidden = /(escrow|payment gateway|instant cpcb transfer|government approved|sebi regulated)/i;
    assert.equal(forbidden.test(enScript), false);
    assert.equal(forbidden.test(hiScript), false);

    assert.equal(formatAudioDuration(0), '0:00');
    assert.equal(formatAudioDuration(95), '1:35');
  });

  it('builds, parses, splits, and concatenates WAV audio buffers cleanly with section pauses', () => {
    const clip1 = makeSilentWav(0.5);
    const clip2 = makeSilentWav(0.5);

    const meta1 = parseWavMetadata(clip1);
    assert.equal(meta1.isValidWav, true);
    assert.equal(meta1.sampleRate, 24000);
    assert.equal(meta1.durationSeconds, 0.5);

    const combined = concatenateWavBuffers([clip1, clip2], 500);
    const combinedMeta = parseWavMetadata(combined);
    assert.equal(combinedMeta.isValidWav, true);
    assert.equal(combinedMeta.durationSeconds, 1.5); // 0.5 + 0.5 pause + 0.5

    const chunks = splitNarrationIntoChunks(DEFAULT_AUDIO_METADATA.en.defaultScript, 900);
    assert.ok(chunks.length >= 2);
    for (const c of chunks) {
      assert.ok(c.length > 0);
    }
  });

  it('enforces Admin RBAC on audio status, generation, and upload endpoints', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epr-audio-rbac-'));
    const srv = startAudioTestServer({ audioStorageDir: tempDir });
    const baseUrl = await srv.listen();

    try {
      const noAuthRes = await fetch(`${baseUrl}/api/audio/status`);
      assert.equal(noAuthRes.status, 401);

      const buyerRes = await fetch(`${baseUrl}/api/audio/status`, {
        headers: { Authorization: 'Bearer buyer-token' },
      });
      assert.equal(buyerRes.status, 403);

      const buyerGenRes = await fetch(`${baseUrl}/api/audio/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer buyer-token',
        },
        body: JSON.stringify({
          language: 'en',
          script: DEFAULT_AUDIO_METADATA.en.defaultScript,
        }),
      });
      assert.equal(buyerGenRes.status, 403);

      const adminStatusRes = await fetch(`${baseUrl}/api/audio/status`, {
        headers: { Authorization: 'Bearer admin-token' },
      });
      assert.equal(adminStatusRes.status, 200);
      const statusJson = (await adminStatusRes.json()) as {
        ok: boolean;
        preferredModel: string;
        fallbackModel: string;
      };
      assert.equal(statusJson.ok, true);
      assert.equal(statusJson.preferredModel, PREFERRED_TTS_MODEL);
      assert.equal(statusJson.fallbackModel, FALLBACK_TTS_MODEL);
    } finally {
      await srv.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('generates WAV audio via preferred TTS model and falls back cleanly when preferred model is unavailable', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epr-audio-tts-'));
    const calls: string[] = [];

    const srv = startAudioTestServer({
      audioStorageDir: tempDir,
      synthesizer: async ({ model }) => {
        calls.push(model);
        if (model === PREFERRED_TTS_MODEL) {
          throw new Error('404 model not found in this region');
        }
        return makeSilentWav(0.6);
      },
    });
    const baseUrl = await srv.listen();

    try {
      // Short script rejected
      const badRes = await fetch(`${baseUrl}/api/audio/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-token',
        },
        body: JSON.stringify({ language: 'en', script: 'Too short' }),
      });
      assert.equal(badRes.status, 400);

      // Valid script triggers fallback from gemini-3.8-flash-tts -> gemini-3.8-flash-lite-tts
      const genRes = await fetch(`${baseUrl}/api/audio/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-token',
        },
        body: JSON.stringify({
          language: 'hi',
          script: DEFAULT_AUDIO_METADATA.hi.defaultScript,
          voiceName: 'Charon',
          model: PREFERRED_TTS_MODEL,
        }),
      });
      assert.equal(genRes.status, 200);
      const json = (await genRes.json()) as {
        ok: boolean;
        language: string;
        modelUsed: string;
        fallbackUsed: boolean;
        mimeType: string;
        durationSeconds: number;
        audioBase64: string;
      };
      assert.equal(json.ok, true);
      assert.equal(json.language, 'hi');
      assert.equal(json.modelUsed, FALLBACK_TTS_MODEL);
      assert.equal(json.fallbackUsed, true);
      assert.equal(json.mimeType, 'audio/wav');
      assert.ok(json.durationSeconds > 0);
      assert.ok(calls.includes(PREFERRED_TTS_MODEL));
      assert.ok(calls.includes(FALLBACK_TTS_MODEL));

      const decoded = Buffer.from(json.audioBase64, 'base64');
      assert.equal(parseWavMetadata(decoded).isValidWav, true);
    } finally {
      await srv.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('validates uploaded MP3/WAV files, persists them, and serves 206 Partial Content byte ranges', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epr-audio-upload-'));
    const srv = startAudioTestServer({ audioStorageDir: tempDir });
    const baseUrl = await srv.listen();

    try {
      // Reject non-audio MIME
      const invalidMimeRes = await fetch(`${baseUrl}/api/audio/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-token',
        },
        body: JSON.stringify({
          language: 'en',
          mimeType: 'text/plain',
          fileName: 'malicious.txt',
          audioBase64: Buffer.from('hello world').toString('base64'),
        }),
      });
      assert.equal(invalidMimeRes.status, 400);

      // Reject masqueraded WAV without RIFF magic bytes
      const fakeWavRes = await fetch(`${baseUrl}/api/audio/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-token',
        },
        body: JSON.stringify({
          language: 'en',
          mimeType: 'audio/wav',
          fileName: 'fake.wav',
          audioBase64: Buffer.from('not-a-real-wav-file').toString('base64'),
        }),
      });
      assert.equal(fakeWavRes.status, 400);

      // Accept real WAV upload
      const realWav = makeSilentWav(0.4);
      const uploadWavRes = await fetch(`${baseUrl}/api/audio/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-token',
        },
        body: JSON.stringify({
          language: 'en',
          mimeType: 'audio/wav',
          fileName: 'epr-bazaar-en.wav',
          audioBase64: realWav.toString('base64'),
        }),
      });
      assert.equal(uploadWavRes.status, 200);
      const wavUploadJson = (await uploadWavRes.json()) as {
        ok: boolean;
        audioUrl: string;
        mimeType: string;
        durationSeconds: number;
      };
      assert.equal(wavUploadJson.ok, true);
      assert.equal(wavUploadJson.mimeType, 'audio/wav');
      assert.equal(wavUploadJson.durationSeconds, 0.4);

      // Verify full GET + Accept-Ranges
      const fullAudioRes = await fetch(`${baseUrl}${wavUploadJson.audioUrl}`);
      assert.equal(fullAudioRes.status, 200);
      assert.equal(fullAudioRes.headers.get('accept-ranges'), 'bytes');
      assert.match(fullAudioRes.headers.get('content-type') || '', /audio\/wav/);

      // Verify HTTP Byte-Range 206 Partial Content (required for iOS Safari audio playback)
      const rangeRes = await fetch(`${baseUrl}${wavUploadJson.audioUrl}`, {
        headers: { Range: 'bytes=0-63' },
      });
      assert.equal(rangeRes.status, 206);
      assert.match(rangeRes.headers.get('content-range') || '', /^bytes 0-63\//);
      const chunkBytes = Buffer.from(await rangeRes.arrayBuffer());
      assert.equal(chunkBytes.length, 64);

      // Accept valid MP3 (ID3 header)
      const fakeMp3WithId3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(128, 0x11)]);
      const uploadMp3Res = await fetch(`${baseUrl}/api/audio/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-token',
        },
        body: JSON.stringify({
          language: 'hi',
          mimeType: 'audio/mpeg',
          fileName: 'epr-bazaar-hi.mp3',
          audioBase64: fakeMp3WithId3.toString('base64'),
          durationSeconds: 88.5,
        }),
      });
      assert.equal(uploadMp3Res.status, 200);
      const mp3Json = (await uploadMp3Res.json()) as { ok: boolean; mimeType: string; durationSeconds: number };
      assert.equal(mp3Json.ok, true);
      assert.equal(mp3Json.mimeType, 'audio/mpeg');
      assert.equal(mp3Json.durationSeconds, 88.5);

      // Block path traversal on file streaming route
      const traversalRes = await fetch(`${baseUrl}/api/audio/files/..%2Fpackage.json`);
      assert.equal(traversalRes.status, 404);
    } finally {
      await srv.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
