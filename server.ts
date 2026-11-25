import 'dotenv/config';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkFirebaseAdminHealth,
  getAdminDb,
  getFirebaseAdminState,
  verifyBearerIdToken,
} from './server/firebaseAdmin.ts';
import { createEmailSender } from './server/emailService.ts';
import type { EmailSender } from './server/emailService.ts';
import type { NotificationDirection } from './server/emailTemplates.ts';
import {
  createFirestoreNotificationStore,
  dispatchCategoryListingNotifications,
  retryFailedEmailNotifications,
} from './server/notificationService.ts';
import type { NotificationStore } from './server/notificationService.ts';
import {
  createFirestoreSeoStore,
  generateAdminSeoSuggestion,
  generateCategoriesSitemapFromSnapshot,
  generateOffersSitemapXml,
  generatePagesSitemapFromSnapshot,
  generateRobotsTxt,
  generateSitemapIndexFromSnapshot,
  injectOfferSeoIntoHtml,
  injectSeoIntoHtml,
  invalidateSeoCache,
  loadSeoCatalogSnapshot,
} from './server/seoRoutes.ts';
import type { SeoDataStore } from './server/seoRoutes.ts';
import { CANONICAL_ORIGIN } from './shared/seoEngine.ts';
import {
  listPublicActiveOffersForServer,
  loadOfferByIdForServer,
} from './server/offerService.ts';
import type { OfferReadStore } from './server/offerService.ts';
import { renderOfferOgPng } from './server/offerOgImage.ts';
import { isOfferPubliclyVisible, OFFER_ID_REGEX } from './shared/sellerOffers.ts';
import {
  generateNarrationAudio,
  getAudioTtsServiceStatus,
  parseWavMetadata,
  resolveSafeServerAudioPath,
  savePersistentServerAudio,
} from './server/audioTtsService.ts';
import type { SingleChunkSynthesizer } from './server/audioTtsService.ts';
import {
  normalizeAudioLanguage,
  normalizeAudioModel,
  normalizeAudioVoice,
} from './shared/audioExplainer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOOTSTRAPPED_ADMIN_EMAIL = 'ajaykumartiwari609@gmail.com';

export interface VerifiedCaller {
  uid: string;
  email?: string;
}

export interface ServerDeps {
  verifyToken?: (authHeader: string | undefined) => Promise<VerifiedCaller>;
  getStore?: () => NotificationStore;
  getSeoStore?: () => SeoDataStore;
  getOfferStore?: () => OfferReadStore;
  getEmailSender?: () => EmailSender;
  getHealthState?: () =>
    | {
        initialized: boolean;
        firestoreAccessOk?: boolean;
        error: string | null;
        projectId: string;
        databaseId: string;
      }
    | Promise<{
        initialized: boolean;
        firestoreAccessOk?: boolean;
        error: string | null;
        projectId: string;
        databaseId: string;
      }>;
  audioStorageDir?: string;
  synthesizeAudioChunk?: SingleChunkSynthesizer;
}

function resolveAppBaseUrl(req: Request): string {
  const configured = (process.env.APP_URL || '').trim();
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/+$/, '');
  }
  const host = req.get('x-forwarded-host') || req.get('host');
  if (host) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    return `${proto}://${host}`.replace(/\/+$/, '');
  }
  return CANONICAL_ORIGIN;
}

export function createApiApp(deps?: ServerDeps): Express {
  const app = express();
  const defaultJsonParser = express.json({ limit: '256kb' });
  const audioUploadJsonParser = express.json({ limit: '35mb' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/audio/upload') {
      audioUploadJsonParser(req, res, next);
      return;
    }
    defaultJsonParser(req, res, next);
  });

  const verifyToken =
    deps?.verifyToken ||
    (async (authHeader: string | undefined): Promise<VerifiedCaller> => {
      const decoded = await verifyBearerIdToken(authHeader);
      return { uid: decoded.uid, email: decoded.email };
    });

  const getStore =
    deps?.getStore ||
    (() => {
      return createFirestoreNotificationStore(getAdminDb());
    });

  const getSender = deps?.getEmailSender || (() => createEmailSender());
  const getHealth = deps?.getHealthState || checkFirebaseAdminHealth;

  async function verifyAdminCaller(authHeader: string | undefined): Promise<VerifiedCaller> {
    const caller = await verifyToken(authHeader);
    if ((caller.email || '').trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
      return caller;
    }
    if (deps?.getSeoStore) {
      const allowed = await deps.getSeoStore().isAdminUser(caller.uid, caller.email);
      if (allowed) return caller;
      const err = new Error('Administrator authorization required.') as Error & { statusCode?: number };
      err.statusCode = 403;
      throw err;
    }
    try {
      const adminState = getFirebaseAdminState();
      if (adminState.initialized) {
        const store = createFirestoreSeoStore(getAdminDb());
        const allowed = await store.isAdminUser(caller.uid, caller.email);
        if (allowed) return caller;
      }
    } catch {
      // Fall through to 403 if Admin lookup cannot verify privilege
    }
    const err = new Error('Administrator authorization required.') as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }

  app.get('/sitemap.xml', async (_req: Request, res: Response) => {
    try {
      const [snapshot, activeOffers] = await Promise.all([
        loadSeoCatalogSnapshot({
          customStore: deps?.getSeoStore?.(),
        }),
        listPublicActiveOffersForServer(deps?.getOfferStore?.()),
      ]);
      res.status(200);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
      res.send(generateSitemapIndexFromSnapshot(snapshot, CANONICAL_ORIGIN, activeOffers));
    } catch (err) {
      res.status(500).type('text/plain').send(err instanceof Error ? err.message : 'Unable to render sitemap.');
    }
  });

  app.get('/sitemap-pages.xml', async (_req: Request, res: Response) => {
    try {
      const snapshot = await loadSeoCatalogSnapshot({
        customStore: deps?.getSeoStore?.(),
      });
      res.status(200);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
      res.send(generatePagesSitemapFromSnapshot(snapshot, CANONICAL_ORIGIN));
    } catch (err) {
      res.status(500).type('text/plain').send(err instanceof Error ? err.message : 'Unable to render pages sitemap.');
    }
  });

  app.get('/sitemap-categories.xml', async (_req: Request, res: Response) => {
    try {
      const snapshot = await loadSeoCatalogSnapshot({
        customStore: deps?.getSeoStore?.(),
      });
      res.status(200);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
      res.send(generateCategoriesSitemapFromSnapshot(snapshot, CANONICAL_ORIGIN));
    } catch (err) {
      res
        .status(500)
        .type('text/plain')
        .send(err instanceof Error ? err.message : 'Unable to render categories sitemap.');
    }
  });

  app.get('/sitemap-offers.xml', async (_req: Request, res: Response) => {
    try {
      const activeOffers = await listPublicActiveOffersForServer(deps?.getOfferStore?.());
      res.status(200);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
      res.send(generateOffersSitemapXml(activeOffers, CANONICAL_ORIGIN));
    } catch (err) {
      res
        .status(500)
        .type('text/plain')
        .send(err instanceof Error ? err.message : 'Unable to render offers sitemap.');
    }
  });

  app.get('/api/offers', async (_req: Request, res: Response) => {
    try {
      const offers = await listPublicActiveOffersForServer(deps?.getOfferStore?.());
      res.status(200).json({ ok: true, offers });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to load public seller offers.',
      });
    }
  });

  app.get('/api/offers/:offerId', async (req: Request, res: Response) => {
    const offerId = String(req.params.offerId || '').trim();
    if (!OFFER_ID_REGEX.test(offerId)) {
      res.status(400).json({ ok: false, error: 'Invalid offer ID format.' });
      return;
    }
    try {
      const offer = await loadOfferByIdForServer(offerId, deps?.getOfferStore?.());
      if (!offer || !isOfferPubliclyVisible(offer)) {
        res.status(404).json({ ok: false, error: 'Offer not found or no longer active.' });
        return;
      }
      res.status(200).json({ ok: true, offer });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to load offer details.',
      });
    }
  });

  app.get('/api/offers/:offerId/og-image.png', async (req: Request, res: Response) => {
    const offerId = String(req.params.offerId || '').trim();
    if (!OFFER_ID_REGEX.test(offerId)) {
      res.status(400).type('text/plain').send('Invalid offer ID.');
      return;
    }
    try {
      const offer = await loadOfferByIdForServer(offerId, deps?.getOfferStore?.());
      const visibleOffer = offer && isOfferPubliclyVisible(offer) ? offer : null;
      const pngBuffer = renderOfferOgPng(visibleOffer, offerId, CANONICAL_ORIGIN);
      res.status(200);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
      res.send(pngBuffer);
    } catch (err) {
      res.status(500).type('text/plain').send(err instanceof Error ? err.message : 'Unable to render preview image.');
    }
  });

  app.get('/robots.txt', (_req: Request, res: Response) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(generateRobotsTxt(CANONICAL_ORIGIN));
  });

  app.get('/api/seo/summary', async (_req: Request, res: Response) => {
    try {
      const snapshot = await loadSeoCatalogSnapshot({
        customStore: deps?.getSeoStore?.(),
      });
      res.status(200).json({
        ok: true,
        audit: snapshot.audit,
        lastUpdatedIso: snapshot.lastUpdatedIso,
        source: snapshot.source,
        sitemapUrl: `${CANONICAL_ORIGIN}/sitemap.xml`,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to load SEO summary.',
      });
    }
  });

  app.post('/api/seo/regenerate', async (req: Request, res: Response) => {
    try {
      const caller = await verifyAdminCaller(req.headers.authorization);
      invalidateSeoCache();
      const customStore = deps?.getSeoStore?.();
      const snapshot = await loadSeoCatalogSnapshot({
        customStore,
        forceRefresh: true,
      });

      if (customStore?.recordRegeneration) {
        await customStore.recordRegeneration({
          actorUid: caller.uid,
          actorEmail: caller.email || '',
          totalUrls: snapshot.audit.totalUrlsInSitemap,
          status: snapshot.audit.sitemapStatus,
        });
      } else if (getFirebaseAdminState().initialized) {
        try {
          const store = createFirestoreSeoStore(getAdminDb());
          if (store.recordRegeneration) {
            await store.recordRegeneration({
              actorUid: caller.uid,
              actorEmail: caller.email || '',
              totalUrls: snapshot.audit.totalUrlsInSitemap,
              status: snapshot.audit.sitemapStatus,
            });
          }
        } catch {
          // Client-side Admin SDK records seo_settings/seo_logs directly when backend IAM SA is absent
        }
      }

      res.status(200).json({
        ok: true,
        audit: snapshot.audit,
        lastUpdatedIso: new Date().toISOString(),
        source: snapshot.source,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to regenerate sitemap.';
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 500;
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.post('/api/seo/suggest', async (req: Request, res: Response) => {
    try {
      await verifyAdminCaller(req.headers.authorization);
      const body = (req.body || {}) as {
        pageTitle?: unknown;
        slug?: unknown;
        contentSummary?: unknown;
        existingTitles?: unknown;
      };
      const pageTitle = typeof body.pageTitle === 'string' ? body.pageTitle.trim() : '';
      const slug = typeof body.slug === 'string' ? body.slug.trim() : '/';
      const contentSummary = typeof body.contentSummary === 'string' ? body.contentSummary.trim() : '';
      const existingTitles = Array.isArray(body.existingTitles)
        ? body.existingTitles.filter((t): t is string => typeof t === 'string')
        : [];

      if (!pageTitle) {
        res.status(400).json({ ok: false, error: 'pageTitle is required to generate SEO suggestions.' });
        return;
      }

      const suggestion = await generateAdminSeoSuggestion({
        pageTitle,
        slug,
        contentSummary,
        existingTitles,
      });
      res.status(200).json({
        ok: true,
        ...suggestion,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate SEO suggestion.';
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 500;
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.get('/api/audio/status', async (req: Request, res: Response) => {
    try {
      await verifyAdminCaller(req.headers.authorization);
      res.status(200).json({
        ok: true,
        ...getAudioTtsServiceStatus(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to check audio generation status.';
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 500;
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.post('/api/audio/generate', async (req: Request, res: Response) => {
    try {
      await verifyAdminCaller(req.headers.authorization);
      const body = (req.body || {}) as {
        language?: unknown;
        script?: unknown;
        voiceName?: unknown;
        model?: unknown;
      };
      const language = normalizeAudioLanguage(body.language);
      const script = typeof body.script === 'string' ? body.script : '';
      const voiceName = normalizeAudioVoice(body.voiceName);
      const model = normalizeAudioModel(body.model);

      const generated = await generateNarrationAudio(
        { language, script, voiceName, model },
        { synthesizer: deps?.synthesizeAudioChunk }
      );

      res.status(200).json({
        ok: true,
        language: generated.language,
        voiceName: generated.voiceName,
        modelUsed: generated.modelUsed,
        fallbackUsed: generated.fallbackUsed,
        mimeType: generated.mimeType,
        durationSeconds: generated.durationSeconds,
        fileSizeBytes: generated.fileSizeBytes,
        audioBase64: generated.wavBuffer.toString('base64'),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate voice narration.';
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 500;
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.post('/api/audio/upload', async (req: Request, res: Response) => {
    try {
      await verifyAdminCaller(req.headers.authorization);
      const body = (req.body || {}) as {
        language?: unknown;
        audioBase64?: unknown;
        mimeType?: unknown;
        fileName?: unknown;
        durationSeconds?: unknown;
      };
      const language = normalizeAudioLanguage(body.language);
      const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64.trim() : '';
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : '';
      const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : undefined;

      if (!audioBase64) {
        res.status(400).json({ ok: false, error: 'Audio file data is required.' });
        return;
      }

      const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',').pop() || '' : audioBase64;
      const buffer = Buffer.from(cleanBase64, 'base64');

      const saved = savePersistentServerAudio({
        language,
        buffer,
        mimeType,
        originalFileName: fileName,
        storageDir: deps?.audioStorageDir,
      });

      let durationSeconds =
        typeof body.durationSeconds === 'number' && Number.isFinite(body.durationSeconds) && body.durationSeconds > 0
          ? Math.round(body.durationSeconds * 10) / 10
          : 0;
      if (durationSeconds === 0 && saved.mimeType === 'audio/wav') {
        durationSeconds = parseWavMetadata(buffer).durationSeconds;
      }

      res.status(200).json({
        ok: true,
        language,
        audioUrl: saved.publicUrl,
        storagePath: `server/site-audio/${saved.fileName}`,
        storageProvider: 'server-storage',
        fileName: saved.fileName,
        mimeType: saved.mimeType,
        fileSizeBytes: saved.fileSizeBytes,
        durationSeconds,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save audio file.';
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 500;
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.get('/api/audio/files/:fileName', (req: Request, res: Response) => {
    const resolved = resolveSafeServerAudioPath(req.params.fileName, deps?.audioStorageDir);
    if (!resolved) {
      res.status(404).json({ ok: false, error: 'Audio file not found.' });
      return;
    }
    res.setHeader('Content-Type', resolved.contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(resolved.filePath);
  });

  app.get('/api/health', async (_req: Request, res: Response) => {
    const adminState = await getHealth();
    const sender = getSender();
    res.json({
      status: 'ok',
      firebaseAdmin: adminState,
      emailProvider: {
        provider: sender.getProviderName(),
        configured: sender.isConfigured(),
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/notifications/dispatch', async (req: Request, res: Response) => {
    try {
      const caller = await verifyToken(req.headers.authorization);
      const body = (req.body || {}) as {
        listingId?: unknown;
        notificationType?: unknown;
      };

      const listingId = typeof body.listingId === 'string' ? body.listingId.trim() : '';
      const notificationType =
        body.notificationType === 'buyer_requirement' || body.notificationType === 'seller_listing'
          ? (body.notificationType as NotificationDirection)
          : null;

      if (!listingId || !notificationType) {
        res.status(400).json({
          ok: false,
          error: 'Both listingId and notificationType ("buyer_requirement" or "seller_listing") are required.',
        });
        return;
      }

      const store = getStore();
      const sender = getSender();
      const summary = await dispatchCategoryListingNotifications(store, sender, {
        callerUid: caller.uid,
        callerEmail: caller.email,
        listingId,
        notificationType,
        appBaseUrl: resolveAppBaseUrl(req),
      });

      res.status(200).json({
        ok: true,
        ...summary,
        provider: sender.getProviderName(),
        providerConfigured: sender.isConfigured(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Notification dispatch failed.';
      const isPermDenied =
        (err as { code?: number | string })?.code === 7 || msg.includes('PERMISSION_DENIED');
      const statusCode = isPermDenied
        ? 503
        : (err as Error & { statusCode?: number }).statusCode ||
          (msg.includes('not initialized') ? 503 : 500);
      res.status(statusCode).json({
        ok: false,
        error: isPermDenied
          ? 'Firebase Admin SDK lacks Firestore IAM permission on intense-brook-3fs6l. Configure FIREBASE_SERVICE_ACCOUNT_JSON in backend secrets.'
          : msg,
      });
    }
  });

  app.post('/api/notifications/retry', async (req: Request, res: Response) => {
    try {
      const caller = await verifyToken(req.headers.authorization);
      const body = (req.body || {}) as { notificationId?: unknown };
      const notificationId =
        typeof body.notificationId === 'string' && body.notificationId.trim()
          ? body.notificationId.trim()
          : undefined;

      const store = getStore();
      const sender = getSender();
      const summary = await retryFailedEmailNotifications(store, sender, {
        callerUid: caller.uid,
        callerEmail: caller.email,
        notificationId,
        appBaseUrl: resolveAppBaseUrl(req),
      });

      res.status(200).json({
        ok: true,
        ...summary,
        provider: sender.getProviderName(),
        providerConfigured: sender.isConfigured(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed email retry error.';
      const isPermDenied =
        (err as { code?: number | string })?.code === 7 || msg.includes('PERMISSION_DENIED');
      const statusCode = isPermDenied
        ? 503
        : (err as Error & { statusCode?: number }).statusCode ||
          (msg.includes('not initialized') ? 503 : 500);
      res.status(statusCode).json({
        ok: false,
        error: isPermDenied
          ? 'Firebase Admin SDK lacks Firestore IAM permission on intense-brook-3fs6l. Configure FIREBASE_SERVICE_ACCOUNT_JSON in backend secrets.'
          : msg,
      });
    }
  });

  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'API route not found.' });
  });

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) {
      const errorObj = err as { status?: number; statusCode?: number; message?: string };
      const status = errorObj?.status || errorObj?.statusCode || 500;
      res.status(status).json({
        ok: false,
        error: errorObj?.message || 'Unexpected API server error.',
      });
      return;
    }
    next(err);
  });

  return app;
}

async function startServer() {
  const app = createApiApp();
  const httpServer = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: !hmrDisabled,
        ws: { server: httpServer },
        watch: hmrDisabled ? null : undefined,
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.get('*', async (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ ok: false, error: 'API route not found.' });
        return;
      }
      if (path.extname(req.path)) {
        next();
        return;
      }
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        const rawTemplate = fs.readFileSync(indexPath, 'utf8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawTemplate);
        const offerMatch = req.path.match(/^\/offer\/([^/]+)\/?$/i);
        let html: string;
        if (offerMatch) {
          const offerId = decodeURIComponent(offerMatch[1]);
          const offer = await loadOfferByIdForServer(offerId);
          html = injectOfferSeoIntoHtml(transformed, offer, offerId, {
            canonicalOrigin: CANONICAL_ORIGIN,
            mediaOrigin: resolveAppBaseUrl(req),
          });
        } else {
          const snapshot = await loadSeoCatalogSnapshot();
          html = injectSeoIntoHtml(transformed, req.path, snapshot);
        }
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(html);
      } catch (err) {
        if (err instanceof Error) {
          vite.ssrFixStacktrace(err);
        }
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    app.use(express.static(distDir, { index: false }));
    app.get('*', async (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ ok: false, error: 'API route not found.' });
        return;
      }
      if (fs.existsSync(indexHtmlPath)) {
        const rawHtml = fs.readFileSync(indexHtmlPath, 'utf8');
        const offerMatch = req.path.match(/^\/offer\/([^/]+)\/?$/i);
        let html: string;
        if (offerMatch) {
          const offerId = decodeURIComponent(offerMatch[1]);
          const offer = await loadOfferByIdForServer(offerId);
          html = injectOfferSeoIntoHtml(rawHtml, offer, offerId, {
            canonicalOrigin: CANONICAL_ORIGIN,
            mediaOrigin: resolveAppBaseUrl(req),
          });
        } else {
          const snapshot = await loadSeoCatalogSnapshot();
          html = injectSeoIntoHtml(rawHtml, req.path, snapshot);
        }
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(html);
      } else {
        res.status(503).send('Production bundle not built yet. Run npm run build.');
      }
    });
  }

  // Periodic background retry for any failed email deliveries (every 5 minutes)
  const retryInterval = setInterval(async () => {
    try {
      const adminState = getFirebaseAdminState();
      const sender = createEmailSender();
      if (!adminState.initialized || !sender.isConfigured()) return;
      const store = createFirestoreNotificationStore(getAdminDb());
      const appBaseUrl =
        process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
          ? process.env.APP_URL.replace(/\/+$/, '')
          : CANONICAL_ORIGIN;
      await retryFailedEmailNotifications(store, sender, {
        systemBypassAuth: true,
        appBaseUrl,
        maxAttempts: 5,
      });
    } catch {
      // swallow background sweep errors; delivery logs record any failures
    }
  }, 5 * 60 * 1000);
  retryInterval.unref();

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`ETP EPR Bazaar server listening on http://0.0.0.0:${port}`);
  });
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  void startServer();
}
