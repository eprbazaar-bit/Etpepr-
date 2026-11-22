import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  calculatePageSeoScore,
  generateDeterministicBlogDraft,
  generateDeterministicFaqs,
  generateDeterministicKeywordIdeas,
  generateDeterministicMetaContentAudit,
  sanitizePublicTextForAi,
} from '../shared/aiSeoEngine.ts';
import type {
  AiBlogDraftResult,
  AiKeywordIdeaDraft,
  AiMetaContentAuditDraft,
  PageSeoScoreReport,
  SearchIntentType,
  SeoBlogInput,
  SeoFaqInput,
  SeoInternalLinkInput,
} from '../shared/aiSeoEngine.ts';
import { buildCanonicalUrl, normalizeSlug, truncateSeoText } from '../shared/seoEngine.ts';
import type { CategorySeoInput, SeoPageInput } from '../shared/seoEngine.ts';

export type AllowedAiModel = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export interface AiRuntimeConfig {
  aiEnabled: boolean;
  model: AllowedAiModel;
  dailyLimit: number;
}

export interface AiServiceUsageStatus {
  aiEnabled: boolean;
  model: AllowedAiModel;
  geminiConfigured: boolean;
  dailyLimit: number;
  dailyRequestsUsed: number;
  totalRequestsUsed: number;
  cacheEntries: number;
  minuteRequestsUsed: number;
  lastUsageDate: string;
}

const DEFAULT_MODEL: AllowedAiModel = 'gemini-4-hydrogen';
const CACHE_TTL_MS = 15 * 60 * 1000;
const MINUTE_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 20;

const responseCache = new Map<string, { value: unknown; expiresAt: number }>();
const minuteTimestamps: number[] = [];

let usageState = {
  lastUsageDate: new Date().toISOString().slice(0, 10),
  dailyRequestsUsed: 0,
  totalRequestsUsed: 0,
};

export function resetAiServiceUsageForTests(): void {
  responseCache.clear();
  minuteTimestamps.length = 0;
  usageState = {
    lastUsageDate: new Date().toISOString().slice(0, 10),
    dailyRequestsUsed: 0,
    totalRequestsUsed: 0,
  };
}

function rollDailyUsageIfNeeded(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (usageState.lastUsageDate !== today) {
    usageState.lastUsageDate = today;
    usageState.dailyRequestsUsed = 0;
  }
}

export function normalizeAllowedModel(model: unknown): AllowedAiModel {
  return model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : DEFAULT_MODEL;
}

export function getAiServiceStatus(cfg?: Partial<AiRuntimeConfig>): AiServiceUsageStatus {
  rollDailyUsageIfNeeded();
  const now = Date.now();
  while (minuteTimestamps.length > 0 && now - minuteTimestamps[0] > MINUTE_WINDOW_MS) {
    minuteTimestamps.shift();
  }
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const geminiConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
  return {
    aiEnabled: cfg?.aiEnabled !== false,
    model: normalizeAllowedModel(cfg?.model),
    geminiConfigured,
    dailyLimit: Math.max(1, Math.min(500, Number(cfg?.dailyLimit) || 60)),
    dailyRequestsUsed: usageState.dailyRequestsUsed,
    totalRequestsUsed: usageState.totalRequestsUsed,
    cacheEntries: responseCache.size,
    minuteRequestsUsed: minuteTimestamps.length,
    lastUsageDate: usageState.lastUsageDate,
  };
}

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function checkRateAndQuota(cfg: AiRuntimeConfig): void {
  if (!cfg.aiEnabled) {
    const err = new Error('Gemini AI SEO Engine is currently paused in Admin Settings.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 403;
    throw err;
  }
  rollDailyUsageIfNeeded();
  const dailyLimit = Math.max(1, Math.min(500, Number(cfg.dailyLimit) || 60));
  if (usageState.dailyRequestsUsed >= dailyLimit) {
    const err = new Error(
      `Daily AI SEO generation limit (${dailyLimit}) reached for today. Adjust the daily limit in Workflow & Settings or wait for daily reset.`
    ) as Error & { statusCode?: number };
    err.statusCode = 429;
    throw err;
  }

  const now = Date.now();
  while (minuteTimestamps.length > 0 && now - minuteTimestamps[0] > MINUTE_WINDOW_MS) {
    minuteTimestamps.shift();
  }
  if (minuteTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const err = new Error('AI request rate limit reached. Please retry in a few seconds.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 429;
    throw err;
  }
}

async function callGeminiStructured<T>(params: {
  cacheKey: string;
  config: AiRuntimeConfig;
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  fallback: () => T;
  validate: (raw: unknown) => T | null;
}): Promise<{ data: T; usedGemini: boolean; cached: boolean; modelUsed: string; notice?: string }> {
  checkRateAndQuota(params.config);

  const cached = responseCache.get(params.cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      data: cached.value as T,
      usedGemini: true,
      cached: true,
      modelUsed: params.config.model,
    };
  }

  const ai = createGeminiClient();
  const model = normalizeAllowedModel(params.config.model);

  if (!ai) {
    const data = params.fallback();
    return {
      data,
      usedGemini: false,
      cached: false,
      modelUsed: 'deterministic-fallback',
      notice: 'Gemini service credential not detected in runtime environment; deterministic SEO draft generated.',
    };
  }

  const maxAttempts = 2;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      minuteTimestamps.push(Date.now());
      usageState.dailyRequestsUsed += 1;
      usageState.totalRequestsUsed += 1;

      const genConfig: Record<string, unknown> = {
        systemInstruction: params.systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: params.responseSchema,
      };
      if (model === 'gemini-4-hydrogen') {
        genConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      const response = await ai.models.generateContent({
        model,
        contents: params.prompt,
        config: genConfig as never,
      });

      const rawText = (response.text || '').trim();
      const parsed = JSON.parse(rawText) as unknown;
      const validated = params.validate(parsed);
      if (validated) {
        responseCache.set(params.cacheKey, {
          value: validated,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return {
          data: validated,
          usedGemini: true,
          cached: false,
          modelUsed: model,
        };
      }
      lastError = new Error('AI response failed structured validation.');
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
        const fatal = new Error(
          'Gemini service credential is invalid or lacks permission. Please verify the key in Settings > Secrets.'
        ) as Error & { statusCode?: number };
        fatal.statusCode = 403;
        throw fatal;
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }

  // Graceful fallback on transient outage so admin workflow stays resilient
  const data = params.fallback();
  return {
    data,
    usedGemini: false,
    cached: false,
    modelUsed: 'deterministic-fallback',
    notice:
      lastError instanceof Error
        ? `Gemini temporarily unavailable (${lastError.message}); deterministic fallback returned.`
        : 'Gemini temporarily unavailable; deterministic fallback returned.',
  };
}

export async function runAiPageMetaAndContentAnalysis(params: {
  page: SeoPageInput;
  allPages: SeoPageInput[];
  categories?: CategorySeoInput[];
  approvedFaqs?: SeoFaqInput[];
  internalLinks?: SeoInternalLinkInput[];
  blogs?: SeoBlogInput[];
  config: AiRuntimeConfig;
}): Promise<{
  scoreReport: PageSeoScoreReport;
  auditDraft: AiMetaContentAuditDraft;
  usedGemini: boolean;
  cached: boolean;
  modelUsed: string;
  notice?: string;
}> {
  const cleanSlug = normalizeSlug(params.page.slug);
  const cleanTitle = sanitizePublicTextForAi(params.page.pageTitle, 140);
  const cleanSummary = sanitizePublicTextForAi(params.page.contentSummary, 1400);
  const cleanBody = sanitizePublicTextForAi(params.page.bodyContent || '', 2500);
  const existingTitles = params.allPages
    .filter((p) => p.id !== params.page.id && p.seoTitle)
    .map((p) => sanitizePublicTextForAi(p.seoTitle || '', 120))
    .slice(0, 20);
  const availableSlugs = params.allPages
    .filter((p) => p.published && normalizeSlug(p.slug) !== cleanSlug)
    .map((p) => normalizeSlug(p.slug))
    .slice(0, 20);

  const scoreReport = calculatePageSeoScore({
    page: params.page,
    allPages: params.allPages,
    categories: params.categories,
    approvedFaqs: params.approvedFaqs,
    internalLinks: params.internalLinks,
    blogs: params.blogs,
  });

  const cacheKey = `meta:${params.config.model}:${cleanSlug}:${cleanTitle}:${cleanSummary.slice(0, 120)}`;
  const res = await callGeminiStructured<AiMetaContentAuditDraft>({
    cacheKey,
    config: params.config,
    systemInstruction:
      'You are an expert technical and content SEO strategist for ETP – EPR Bazaar (https://etp.eprbazaar.com), an Indian B2B EPR Credit Trading Marketplace operated by Nyanvi Ecoclean Private Limited. Never invent legal notifications or fabricate rankings/traffic. Write concise, factual business copy. Keep seoTitle <= 64 chars and metaDescription between 120 and 158 chars.',
    prompt: [
      `Analyze and optimize the public webpage at "${cleanSlug}".`,
      `Page Name: ${cleanTitle}`,
      `Current SEO Title: ${sanitizePublicTextForAi(params.page.seoTitle || '', 120) || '(missing)'}`,
      `Current Meta Description: ${sanitizePublicTextForAi(params.page.metaDescription || '', 300) || '(missing)'}`,
      `Current Content Summary: ${cleanSummary}`,
      cleanBody ? `Additional Body Content: ${cleanBody}` : '',
      `Existing titles on other pages (must NOT duplicate): ${existingTitles.join(' | ')}`,
      `Eligible internal link targets: ${availableSlugs.join(', ')}`,
      'Return structured metadata, keyword targets, H1, alt text, missing topics, readability improvements, keyword overuse warnings, duplicate risk assessment, FAQs, internal link suggestions, and an improved factual page copy draft.',
    ]
      .filter(Boolean)
      .join('\n'),
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        seoTitle: { type: Type.STRING },
        metaDescription: { type: Type.STRING },
        primaryKeyword: { type: Type.STRING },
        secondaryKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        h1Suggestion: { type: Type.STRING },
        ogTitle: { type: Type.STRING },
        ogDescription: { type: Type.STRING },
        imageAltText: { type: Type.STRING },
        missingTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
        headingSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        readabilityNotes: { type: Type.STRING },
        keywordOveruseWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
        duplicateContentRisk: { type: Type.STRING },
        recommendedInternalLinks: { type: Type.ARRAY, items: { type: Type.STRING } },
        recommendedFaqs: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              answer: { type: Type.STRING },
            },
          },
        },
        contentStructure: { type: Type.ARRAY, items: { type: Type.STRING } },
        improvedContentDraft: { type: Type.STRING },
      },
    },
    fallback: () =>
      generateDeterministicMetaContentAudit({
        pageTitle: cleanTitle,
        slug: cleanSlug,
        contentSummary: cleanSummary,
        bodyContent: cleanBody,
        existingTitles,
        availableSlugs,
      }),
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const obj = raw as Record<string, unknown>;
      const seoTitle = typeof obj.seoTitle === 'string' ? truncateSeoText(obj.seoTitle.trim(), 70) : '';
      const metaDescription =
        typeof obj.metaDescription === 'string' ? truncateSeoText(obj.metaDescription.trim(), 165) : '';
      const primaryKeyword =
        typeof obj.primaryKeyword === 'string' ? obj.primaryKeyword.trim().slice(0, 80) : '';
      if (seoTitle.length < 15 || metaDescription.length < 40 || !primaryKeyword) return null;

      const toStrArr = (v: unknown, max: number) =>
        Array.isArray(v)
          ? v
              .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
              .map((x) => x.trim().slice(0, 200))
              .slice(0, max)
          : [];

      const faqs = Array.isArray(obj.recommendedFaqs)
        ? obj.recommendedFaqs
            .filter(
              (f): f is { question: string; answer: string } =>
                Boolean(f && typeof f === 'object' && typeof (f as { question?: unknown }).question === 'string' && typeof (f as { answer?: unknown }).answer === 'string')
            )
            .slice(0, 6)
        : [];

      return {
        seoTitle,
        metaDescription,
        primaryKeyword,
        secondaryKeywords: toStrArr(obj.secondaryKeywords, 8),
        h1Suggestion:
          typeof obj.h1Suggestion === 'string' && obj.h1Suggestion.trim()
            ? obj.h1Suggestion.trim().slice(0, 120)
            : cleanTitle,
        ogTitle:
          typeof obj.ogTitle === 'string' && obj.ogTitle.trim()
            ? truncateSeoText(obj.ogTitle.trim(), 70)
            : seoTitle,
        ogDescription:
          typeof obj.ogDescription === 'string' && obj.ogDescription.trim()
            ? truncateSeoText(obj.ogDescription.trim(), 165)
            : metaDescription,
        imageAltText:
          typeof obj.imageAltText === 'string' && obj.imageAltText.trim()
            ? obj.imageAltText.trim().slice(0, 140)
            : `${cleanTitle} – ETP EPR Bazaar`,
        missingTopics: toStrArr(obj.missingTopics, 8),
        headingSuggestions: toStrArr(obj.headingSuggestions, 8),
        readabilityNotes:
          typeof obj.readabilityNotes === 'string' ? obj.readabilityNotes.trim().slice(0, 500) : '',
        keywordOveruseWarnings: toStrArr(obj.keywordOveruseWarnings, 6),
        duplicateContentRisk:
          typeof obj.duplicateContentRisk === 'string'
            ? obj.duplicateContentRisk.trim().slice(0, 250)
            : 'Low risk',
        recommendedInternalLinks: toStrArr(obj.recommendedInternalLinks, 6).filter((s) =>
          s.startsWith('/') && !s.startsWith('/admin') && !s.startsWith('/login')
        ),
        recommendedFaqs: faqs,
        contentStructure: toStrArr(obj.contentStructure, 8),
        improvedContentDraft:
          typeof obj.improvedContentDraft === 'string' && obj.improvedContentDraft.trim()
            ? obj.improvedContentDraft.trim().slice(0, 1500)
            : cleanSummary,
      };
    },
  });

  return {
    scoreReport,
    auditDraft: res.data,
    usedGemini: res.usedGemini,
    cached: res.cached,
    modelUsed: res.modelUsed,
    notice: res.notice,
  };
}

export async function runAiKeywordResearch(params: {
  topic: string;
  availableSlugs: string[];
  config: AiRuntimeConfig;
}): Promise<{
  keywords: AiKeywordIdeaDraft[];
  usedGemini: boolean;
  cached: boolean;
  modelUsed: string;
  notice?: string;
}> {
  const cleanTopic = sanitizePublicTextForAi(params.topic, 120) || 'EPR Certificate Trading';
  const eligibleSlugs = params.availableSlugs.filter((s) => s.startsWith('/')).slice(0, 25);
  const cacheKey = `kw:${params.config.model}:${cleanTopic.toLowerCase()}`;

  const res = await callGeminiStructured<AiKeywordIdeaDraft[]>({
    cacheKey,
    config: params.config,
    systemInstruction:
      'You are an Indian B2B EPR compliance & recycling SEO keyword strategist. CRITICAL: Do NOT fabricate or output monthly search volumes, keyword difficulty numbers, CPC rates, or Google ranking guarantees. Only provide strategic keyword phrases, search intent, related keywords, best matching page slug from the provided list, content opportunity, and a qualitative competition note clearly labeled as an AI strategy estimate.',
    prompt: [
      `Research 6 high-relevance B2B SEO keyword opportunities for the Indian EPR & recycling topic: "${cleanTopic}".`,
      `Eligible website slugs on etp.eprbazaar.com: ${eligibleSlugs.join(', ')}`,
      'Intent must be one of: Transactional, Commercial, Informational, Navigational.',
    ].join('\n'),
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          keyword: { type: Type.STRING },
          searchIntent: { type: Type.STRING },
          relatedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedPage: { type: Type.STRING },
          contentOpportunity: { type: Type.STRING },
          competitionNote: { type: Type.STRING },
        },
      },
    },
    fallback: () => generateDeterministicKeywordIdeas(cleanTopic, eligibleSlugs),
    validate: (raw) => {
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const intents: SearchIntentType[] = ['Transactional', 'Commercial', 'Informational', 'Navigational'];
      const cleaned: AiKeywordIdeaDraft[] = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const kw = typeof rec.keyword === 'string' ? rec.keyword.trim().slice(0, 120) : '';
        if (!kw) continue;
        const intentRaw = typeof rec.searchIntent === 'string' ? rec.searchIntent.trim() : 'Commercial';
        const searchIntent = (intents.find((i) => i.toLowerCase() === intentRaw.toLowerCase()) ||
          'Commercial') as SearchIntentType;
        const rawSlug = typeof rec.suggestedPage === 'string' ? normalizeSlug(rec.suggestedPage) : '/marketplace';
        const suggestedPage = eligibleSlugs.includes(rawSlug) ? rawSlug : '/marketplace';
        cleaned.push({
          keyword: kw,
          searchIntent,
          relatedKeywords: Array.isArray(rec.relatedKeywords)
            ? rec.relatedKeywords.filter((x): x is string => typeof x === 'string').slice(0, 6)
            : [],
          suggestedPage,
          contentOpportunity:
            typeof rec.contentOpportunity === 'string'
              ? rec.contentOpportunity.trim().slice(0, 400)
              : 'Expand topic coverage with verified compliance guidance.',
          competitionNote:
            typeof rec.competitionNote === 'string'
              ? `AI strategy estimate: ${rec.competitionNote.replace(/^AI strategy estimate:\s*/i, '').trim().slice(0, 260)}`
              : 'AI strategy estimate: Moderate niche B2B specificity (verify in Search Console / Keyword Planner).',
          isAiEstimate: true,
        });
      }
      return cleaned.length > 0 ? cleaned.slice(0, 10) : null;
    },
  });

  return {
    keywords: res.data,
    usedGemini: res.usedGemini,
    cached: res.cached,
    modelUsed: res.modelUsed,
    notice: res.notice,
  };
}

export async function runAiBlogDraftGenerator(params: {
  topic: string;
  availableSlugs: string[];
  config: AiRuntimeConfig;
}): Promise<{
  draft: AiBlogDraftResult;
  usedGemini: boolean;
  cached: boolean;
  modelUsed: string;
  notice?: string;
}> {
  const cleanTopic = sanitizePublicTextForAi(params.topic, 140) || 'EPR compliance in India';
  const eligibleSlugs = params.availableSlugs.filter((s) => s.startsWith('/')).slice(0, 20);
  const cacheKey = `blog:${params.config.model}:${cleanTopic.toLowerCase()}`;

  const res = await callGeminiStructured<AiBlogDraftResult>({
    cacheKey,
    config: params.config,
    systemInstruction:
      'You are a senior B2B environmental compliance editor writing educational blog drafts for ETP – EPR Bazaar in India. CRITICAL SAFETY RULE: Do NOT invent government notification numbers, penalty amounts, statutory deadlines, or legal clauses. Explicitly advise verifying regulatory obligations against official CPCB/SPCB portals. Keep metaTitle <= 62 chars and metaDescription <= 156 chars.',
    prompt: [
      `Write a structured, high-value B2B SEO blog article draft on: "${cleanTopic}".`,
      `Eligible internal links from this domain: ${eligibleSlugs.join(', ')}`,
      'Include clear headings, thorough factual article body, conclusion, metaTitle, metaDescription, primaryKeyword, secondaryKeywords, suggestedInternalLinks, 2-3 relevantFaqs, and featuredImagePrompt.',
    ].join('\n'),
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        slug: { type: Type.STRING },
        introduction: { type: Type.STRING },
        headings: { type: Type.ARRAY, items: { type: Type.STRING } },
        articleBody: { type: Type.STRING },
        conclusion: { type: Type.STRING },
        metaTitle: { type: Type.STRING },
        metaDescription: { type: Type.STRING },
        primaryKeyword: { type: Type.STRING },
        secondaryKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        suggestedInternalLinks: { type: Type.ARRAY, items: { type: Type.STRING } },
        relevantFaqs: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              answer: { type: Type.STRING },
            },
          },
        },
        featuredImagePrompt: { type: Type.STRING },
      },
    },
    fallback: () => generateDeterministicBlogDraft(cleanTopic),
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const obj = raw as Record<string, unknown>;
      const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 120) : '';
      const articleBody = typeof obj.articleBody === 'string' ? obj.articleBody.trim().slice(0, 12000) : '';
      const metaDescription =
        typeof obj.metaDescription === 'string' ? truncateSeoText(obj.metaDescription.trim(), 160) : '';
      if (!title || articleBody.length < 150 || !metaDescription) return null;

      const rawSlug = typeof obj.slug === 'string' ? obj.slug : title;
      const slug = rawSlug
        .replace(/^\/blog\//i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);

      return {
        title,
        slug: slug || 'epr-compliance-insight',
        introduction:
          typeof obj.introduction === 'string' ? obj.introduction.trim().slice(0, 1500) : '',
        headings: Array.isArray(obj.headings)
          ? obj.headings.filter((h): h is string => typeof h === 'string').slice(0, 10)
          : [],
        articleBody,
        conclusion: typeof obj.conclusion === 'string' ? obj.conclusion.trim().slice(0, 1500) : '',
        metaTitle:
          typeof obj.metaTitle === 'string' && obj.metaTitle.trim()
            ? truncateSeoText(obj.metaTitle.trim(), 64)
            : truncateSeoText(`${title} | ETP – EPR Bazaar`, 64),
        metaDescription,
        primaryKeyword:
          typeof obj.primaryKeyword === 'string' && obj.primaryKeyword.trim()
            ? obj.primaryKeyword.trim().slice(0, 80)
            : cleanTopic.toLowerCase(),
        secondaryKeywords: Array.isArray(obj.secondaryKeywords)
          ? obj.secondaryKeywords.filter((k): k is string => typeof k === 'string').slice(0, 8)
          : [],
        suggestedInternalLinks: Array.isArray(obj.suggestedInternalLinks)
          ? obj.suggestedInternalLinks
              .filter((s): s is string => typeof s === 'string' && s.startsWith('/'))
              .slice(0, 6)
          : ['/marketplace', '/market-rates'],
        relevantFaqs: Array.isArray(obj.relevantFaqs)
          ? obj.relevantFaqs
              .filter(
                (f): f is { question: string; answer: string } =>
                  Boolean(f && typeof f === 'object' && typeof (f as { question?: unknown }).question === 'string' && typeof (f as { answer?: unknown }).answer === 'string')
              )
              .slice(0, 5)
          : [],
        featuredImagePrompt:
          typeof obj.featuredImagePrompt === 'string'
            ? obj.featuredImagePrompt.trim().slice(0, 500)
            : 'Clean corporate infographic illustration of circular EPR waste recycling in India.',
      };
    },
  });

  return {
    draft: res.data,
    usedGemini: res.usedGemini,
    cached: res.cached,
    modelUsed: res.modelUsed,
    notice: res.notice,
  };
}

export async function runAiFaqGenerator(params: {
  pageTitle: string;
  slug: string;
  contentSummary: string;
  existingQuestions: string[];
  config: AiRuntimeConfig;
}): Promise<{
  faqs: { question: string; answer: string }[];
  usedGemini: boolean;
  cached: boolean;
  modelUsed: string;
  notice?: string;
}> {
  const cleanSlug = normalizeSlug(params.slug);
  const cleanTitle = sanitizePublicTextForAi(params.pageTitle, 140);
  const cleanSummary = sanitizePublicTextForAi(params.contentSummary, 1400);
  const existingQs = params.existingQuestions.map((q) => sanitizePublicTextForAi(q, 180)).slice(0, 15);
  const cacheKey = `faq:${params.config.model}:${cleanSlug}:${existingQs.length}:${cleanSummary.slice(0, 80)}`;

  const res = await callGeminiStructured<{ question: string; answer: string }[]>({
    cacheKey,
    config: params.config,
    systemInstruction:
      'You write factual, concise FAQ entries for ETP – EPR Bazaar public webpages. Never invent government rules or regulatory numbers, avoid repeating existing questions, and align answers strictly with managed B2B EPR credit trading.',
    prompt: [
      `Generate 3 unique, helpful FAQs for page "${cleanTitle}" (${cleanSlug}).`,
      `Page summary: ${cleanSummary}`,
      existingQs.length > 0 ? `Do NOT repeat these existing questions: ${existingQs.join(' | ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
      },
    },
    fallback: () =>
      generateDeterministicFaqs({
        pageTitle: cleanTitle,
        slug: cleanSlug,
        contentSummary: cleanSummary,
      }).filter(
        (f) => !existingQs.some((eq) => eq.toLowerCase() === f.question.toLowerCase())
      ),
    validate: (raw) => {
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const existingSet = new Set(existingQs.map((q) => q.toLowerCase()));
      const out = raw
        .filter(
          (f): f is { question: string; answer: string } =>
            Boolean(f && typeof f === 'object' && typeof (f as { question?: unknown }).question === 'string' && typeof (f as { answer?: unknown }).answer === 'string')
        )
        .map((f) => ({
          question: f.question.trim().slice(0, 220),
          answer: f.answer.trim().slice(0, 800),
        }))
        .filter((f) => f.question.length >= 10 && f.answer.length >= 20 && !existingSet.has(f.question.toLowerCase()))
        .slice(0, 5);
      return out.length > 0 ? out : null;
    },
  });

  return {
    faqs: res.data,
    usedGemini: res.usedGemini,
    cached: res.cached,
    modelUsed: res.modelUsed,
    notice: res.notice,
  };
}

export async function runAiInternalLinkSuggestions(params: {
  pages: SeoPageInput[];
  categories: CategorySeoInput[];
  blogs: SeoBlogInput[];
  existingLinks: SeoInternalLinkInput[];
  config: AiRuntimeConfig;
  graphFallbackSuggestions: {
    sourceSlug: string;
    targetSlug: string;
    anchorText: string;
    relevanceReason: string;
  }[];
}): Promise<{
  suggestions: {
    sourceSlug: string;
    targetSlug: string;
    anchorText: string;
    relevanceReason: string;
  }[];
  usedGemini: boolean;
  cached: boolean;
  modelUsed: string;
  notice?: string;
}> {
  const validSlugs = params.pages
    .filter((p) => p.published)
    .map((p) => ({
      slug: normalizeSlug(p.slug),
      title: sanitizePublicTextForAi(p.pageTitle, 80),
    }))
    .slice(0, 25);

  const validSet = new Set(validSlugs.map((v) => v.slug));
  for (const c of params.categories) {
    if (c.active) validSet.add(normalizeSlug(`/category/${encodeURIComponent(c.id)}`));
  }
  for (const b of params.blogs) {
    if (b.published) validSet.add(normalizeSlug(`/blog/${b.slug.replace(/^\/blog\//, '')}`));
  }

  const cacheKey = `links:${params.config.model}:${validSlugs.map((s) => s.slug).join(',')}:${params.existingLinks.length}`;

  const res = await callGeminiStructured<
    { sourceSlug: string; targetSlug: string; anchorText: string; relevanceReason: string }[]
  >({
    cacheKey,
    config: params.config,
    systemInstruction:
      'You are an internal linking architect for ETP – EPR Bazaar. Recommend up to 6 high-relevance contextual internal links using ONLY the provided valid public slugs. Suggest natural descriptive anchor text and concise rationale.',
    prompt: [
      'Available public pages:',
      ...validSlugs.map((v) => `- ${v.slug}: ${v.title}`),
      'Suggest 4–6 contextual internal links where sourceSlug != targetSlug and both URLs exist in the list above.',
    ].join('\n'),
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sourceSlug: { type: Type.STRING },
          targetSlug: { type: Type.STRING },
          anchorText: { type: Type.STRING },
          relevanceReason: { type: Type.STRING },
        },
      },
    },
    fallback: () => params.graphFallbackSuggestions,
    validate: (raw) => {
      if (!Array.isArray(raw)) return null;
      const seen = new Set(
        params.existingLinks.map((l) => `${normalizeSlug(l.sourceSlug)}->${normalizeSlug(l.targetSlug)}`)
      );
      const out: { sourceSlug: string; targetSlug: string; anchorText: string; relevanceReason: string }[] = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const r = item as Record<string, unknown>;
        const src = typeof r.sourceSlug === 'string' ? normalizeSlug(r.sourceSlug) : '';
        const dst = typeof r.targetSlug === 'string' ? normalizeSlug(r.targetSlug) : '';
        const anchor = typeof r.anchorText === 'string' ? r.anchorText.trim().slice(0, 100) : '';
        const reason = typeof r.relevanceReason === 'string' ? r.relevanceReason.trim().slice(0, 260) : '';
        if (!src || !dst || src === dst || !validSet.has(src) || !validSet.has(dst) || !anchor) continue;
        const pair = `${src}->${dst}`;
        if (seen.has(pair)) continue;
        seen.add(pair);
        out.push({
          sourceSlug: src,
          targetSlug: dst,
          anchorText: anchor,
          relevanceReason: reason || `Contextual topical link between ${src} and ${dst}.`,
        });
      }
      return out.length > 0 ? out.slice(0, 8) : null;
    },
  });

  // Always include orphan-fixing graph suggestions if Gemini missed any orphan URL
  const combined = [...res.data];
  const seenPairs = new Set(combined.map((l) => `${normalizeSlug(l.sourceSlug)}->${normalizeSlug(l.targetSlug)}`));
  for (const g of params.graphFallbackSuggestions) {
    const key = `${normalizeSlug(g.sourceSlug)}->${normalizeSlug(g.targetSlug)}`;
    if (!seenPairs.has(key) && combined.length < 10) {
      combined.push(g);
      seenPairs.add(key);
    }
  }

  return {
    suggestions: combined,
    usedGemini: res.usedGemini,
    cached: res.cached,
    modelUsed: res.modelUsed,
    notice: res.notice,
  };
}

export function buildCanonicalHref(slug: string): string {
  return buildCanonicalUrl(slug);
}
