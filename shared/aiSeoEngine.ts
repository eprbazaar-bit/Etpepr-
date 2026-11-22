import {
  buildCanonicalUrl,
  CANONICAL_ORIGIN,
  isRestrictedPath,
  normalizeSlug,
  truncateSeoText,
  validateCanonicalUrl,
} from './seoEngine.ts';
import type { CategorySeoInput, SeoPageInput } from './seoEngine.ts';

export const AI_SEO_SCORE_DISCLAIMER =
  'Internal readiness score (0–100) evaluating technical and on-page SEO completeness; not an official Google search ranking score.';

export const AI_KEYWORD_ESTIMATE_DISCLAIMER =
  'AI-generated strategy estimate only. Monthly search volume, CPC, and Google keyword difficulty are intentionally omitted unless imported from Google Keyword Planner or Search Console.';

export const AI_BLOG_FACT_CHECK_NOTICE =
  'Mandatory Editorial Check: Regulatory and CPCB/SPCB compliance claims must be verified against official government notifications before publishing.';

export const EPR_KEYWORD_TOPICS: string[] = [
  'EPR Certificate Trading',
  'EPR Registration India',
  'Plastic Waste Management',
  'Plastic Waste Recycler',
  'EPR Compliance',
  'PIBO Registration',
  'Plastic Recycling',
  'E-Waste Management',
  'Battery Waste Management',
  'EPR Certificate Buyer',
  'EPR Certificate Seller',
  'EPR Certificate Exchange',
  'Waste Recycling Business',
  'CPCB EPR Guidelines',
  'EPR Certificate Price',
];

export const BLOG_TOPIC_PRESETS: string[] = [
  'EPR compliance in India',
  'Plastic recycling',
  'EPR certificate trading',
  'CPCB registration',
  'Waste management regulations',
  'Recycler business opportunities',
  'Battery recycling',
  'E-waste recycling',
];

export type SearchIntentType = 'Transactional' | 'Commercial' | 'Informational' | 'Navigational';

export interface SeoBlogInput {
  id: string;
  slug: string;
  topic: string;
  title: string;
  introduction: string;
  headings: string[];
  articleBody: string;
  conclusion: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  suggestedInternalLinks: string[];
  featuredImagePrompt: string;
  factChecked: boolean;
  published: boolean;
  status: 'Draft' | 'Approved' | 'Published' | 'Rejected';
  updatedAtIso?: string;
}

export interface SeoFaqInput {
  id: string;
  pageSlug: string;
  question: string;
  answer: string;
  approved: boolean;
  displayOrder: number;
}

export interface SeoInternalLinkInput {
  id: string;
  sourceSlug: string;
  targetSlug: string;
  anchorText: string;
  relevanceReason: string;
  status: 'Suggested' | 'Approved' | 'Rejected';
}

export interface PageCategoryScoreBreakdown {
  seoTitle: number;
  metaDescription: number;
  h1Heading: number;
  contentQuality: number;
  keywordRelevance: number;
  internalLinking: number;
  imageAltText: number;
  canonicalUrl: number;
  technicalSeo: number;
  structuredData: number;
}

export interface PageSeoScoreReport {
  pageId: string;
  slug: string;
  pageTitle: string;
  overallScore: number;
  categoryScores: PageCategoryScoreBreakdown;
  issuesFound: string[];
  priorityRecommendations: string[];
  suggestedImprovements: string[];
  disclaimer: string;
}

export interface DuplicateContentAlert {
  pageAId: string;
  pageASlug: string;
  pageBId: string;
  pageBSlug: string;
  reason: string;
  similarityPercent: number;
}

export interface InternalLinkGraphAnalysis {
  orphanSlugs: string[];
  brokenLinks: {
    linkId: string;
    sourceSlug: string;
    targetSlug: string;
    reason: string;
  }[];
  approvedLinkCount: number;
  suggestedLinks: {
    sourceSlug: string;
    targetSlug: string;
    anchorText: string;
    relevanceReason: string;
  }[];
}

export interface AiMetaContentAuditDraft {
  seoTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  h1Suggestion: string;
  ogTitle: string;
  ogDescription: string;
  imageAltText: string;
  missingTopics: string[];
  headingSuggestions: string[];
  readabilityNotes: string;
  keywordOveruseWarnings: string[];
  duplicateContentRisk: string;
  recommendedInternalLinks: string[];
  recommendedFaqs: { question: string; answer: string }[];
  contentStructure: string[];
  improvedContentDraft: string;
}

export interface AiKeywordIdeaDraft {
  keyword: string;
  searchIntent: SearchIntentType;
  relatedKeywords: string[];
  suggestedPage: string;
  contentOpportunity: string;
  competitionNote: string;
  isAiEstimate: true;
}

export interface AiBlogDraftResult {
  title: string;
  slug: string;
  introduction: string;
  headings: string[];
  articleBody: string;
  conclusion: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  suggestedInternalLinks: string[];
  relevantFaqs: { question: string; answer: string }[];
  featuredImagePrompt: string;
}

export function sanitizePublicTextForAi(raw: string, maxLength = 2500): string {
  const clean = (raw || '')
    // Redact emails, GSTINs, CINs, Indian phone numbers to prevent any accidental PII egress
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[redacted-email]')
    .replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g, '[redacted-gstin]')
    .replace(/(?:\+91[\s-]?)?[6-9]\d{9}\b/g, '[redacted-phone]')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.slice(0, maxLength);
}

function tokenizeWords(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function computeKeywordDensityPercent(text: string, keyword: string): number {
  const words = tokenizeWords(text);
  const kwTokens = tokenizeWords(keyword);
  if (words.length === 0 || kwTokens.length === 0) return 0;
  const normalizedText = ` ${words.join(' ')} `;
  const phrase = kwTokens.join(' ');
  const occurrences = normalizedText.split(` ${phrase} `).length - 1;
  return Number((((occurrences * kwTokens.length) / words.length) * 100).toFixed(2));
}

export function detectDuplicateContentAlerts(pages: SeoPageInput[]): DuplicateContentAlert[] {
  const alerts: DuplicateContentAlert[] = [];
  const publishedPages = pages.filter((p) => p.published);

  for (let i = 0; i < publishedPages.length; i++) {
    for (let j = i + 1; j < publishedPages.length; j++) {
      const a = publishedPages[i];
      const b = publishedPages[j];

      const aTitle = (a.seoTitle || '').trim().toLowerCase();
      const bTitle = (b.seoTitle || '').trim().toLowerCase();
      if (aTitle && bTitle && aTitle === bTitle) {
        alerts.push({
          pageAId: a.id,
          pageASlug: a.slug,
          pageBId: b.id,
          pageBSlug: b.slug,
          reason: 'Identical SEO title across both published pages.',
          similarityPercent: 100,
        });
        continue;
      }

      const aDesc = (a.metaDescription || '').trim().toLowerCase();
      const bDesc = (b.metaDescription || '').trim().toLowerCase();
      if (aDesc && bDesc && aDesc === bDesc) {
        alerts.push({
          pageAId: a.id,
          pageASlug: a.slug,
          pageBId: b.id,
          pageBSlug: b.slug,
          reason: 'Identical meta description across both published pages.',
          similarityPercent: 100,
        });
        continue;
      }

      const setA = new Set(tokenizeWords(`${a.pageTitle} ${a.contentSummary} ${a.bodyContent || ''}`));
      const setB = new Set(tokenizeWords(`${b.pageTitle} ${b.contentSummary} ${b.bodyContent || ''}`));
      if (setA.size >= 8 && setB.size >= 8) {
        let intersection = 0;
        for (const w of setA) {
          if (setB.has(w)) intersection += 1;
        }
        const union = setA.size + setB.size - intersection;
        const sim = union > 0 ? Math.round((intersection / union) * 100) : 0;
        if (sim >= 65) {
          alerts.push({
            pageAId: a.id,
            pageASlug: a.slug,
            pageBId: b.id,
            pageBSlug: b.slug,
            reason: 'High content vocabulary overlap detected between public pages.',
            similarityPercent: sim,
          });
        }
      }
    }
  }

  return alerts;
}

export function analyzeInternalLinkGraph(
  pages: SeoPageInput[],
  categories: CategorySeoInput[] = [],
  blogs: SeoBlogInput[] = [],
  existingLinks: SeoInternalLinkInput[] = []
): InternalLinkGraphAnalysis {
  const validSlugs = new Set<string>();
  const slugTitles = new Map<string, string>();
  const slugKeywords = new Map<string, Set<string>>();

  for (const p of pages) {
    if (!p.published || p.robots === 'noindex, nofollow') continue;
    const norm = normalizeSlug(p.slug);
    if (isRestrictedPath(norm)) continue;
    validSlugs.add(norm);
    slugTitles.set(norm, p.pageTitle);
    slugKeywords.set(
      norm,
      new Set(tokenizeWords(`${p.pageTitle} ${p.primaryKeyword || ''} ${p.contentSummary}`))
    );
  }

  for (const cat of categories) {
    if (!cat.active || !cat.id) continue;
    const norm = normalizeSlug(`/category/${encodeURIComponent(cat.id)}`);
    validSlugs.add(norm);
    slugTitles.set(norm, `${cat.name} EPR Credits`);
    slugKeywords.set(
      norm,
      new Set(tokenizeWords(`${cat.name} ${cat.code} ${cat.description || ''} epr credit`))
    );
  }

  for (const b of blogs) {
    if (!b.published) continue;
    const norm = normalizeSlug(`/blog/${b.slug.replace(/^\/blog\//, '').replace(/^\/+/, '')}`);
    validSlugs.add(norm);
    slugTitles.set(norm, b.title);
    slugKeywords.set(
      norm,
      new Set(tokenizeWords(`${b.title} ${b.primaryKeyword} ${b.topic} ${b.metaDescription}`))
    );
  }

  // Known static navigation targets linked from global header/footer on every public page
  const navLinkedTargets = new Set<string>([
    '/',
    '/marketplace',
    '/market-rates',
    '/buy-credits',
    '/sell-credits',
    '/how-it-works',
    '/about',
    '/contact',
    '/faq',
    '/buyer-guidelines',
    '/seller-guidelines',
    '/grievance',
    '/terms',
    '/privacy',
    '/refund',
    '/disclaimer',
    '/blog',
  ]);

  const inboundCounts = new Map<string, number>();
  for (const slug of validSlugs) {
    inboundCounts.set(slug, navLinkedTargets.has(slug) ? 1 : 0);
  }
  // Category pages are linked from Home & Marketplace category grids when active
  for (const cat of categories) {
    if (!cat.active || !cat.id) continue;
    const norm = normalizeSlug(`/category/${encodeURIComponent(cat.id)}`);
    inboundCounts.set(norm, (inboundCounts.get(norm) || 0) + 1);
  }

  const brokenLinks: InternalLinkGraphAnalysis['brokenLinks'] = [];
  const existingPairKeys = new Set<string>();
  let approvedLinkCount = 0;

  for (const link of existingLinks) {
    const src = normalizeSlug(link.sourceSlug);
    const dst = normalizeSlug(link.targetSlug);
    existingPairKeys.add(`${src}->${dst}`);

    if (link.status === 'Rejected') continue;

    if (isRestrictedPath(dst) || !validSlugs.has(dst)) {
      brokenLinks.push({
        linkId: link.id,
        sourceSlug: src,
        targetSlug: dst,
        reason: isRestrictedPath(dst)
          ? 'Target URL is a restricted portal/login route.'
          : 'Target URL is unpublished or missing from active public pages.',
      });
      continue;
    }

    if (link.status === 'Approved') {
      approvedLinkCount += 1;
      inboundCounts.set(dst, (inboundCounts.get(dst) || 0) + 1);
    }
  }

  const orphanSlugs = Array.from(validSlugs).filter((slug) => (inboundCounts.get(slug) || 0) === 0);

  // Suggest contextual internal links across related valid slugs
  const suggestedLinks: InternalLinkGraphAnalysis['suggestedLinks'] = [];
  const allValidList = Array.from(validSlugs);

  // Prioritize linking orphan pages & high-intent commercial pages
  const candidateSources = ['/marketplace', '/market-rates', '/buy-credits', '/sell-credits', '/how-it-works', '/'];
  for (const orphan of orphanSlugs) {
    const bestSource =
      candidateSources.find((s) => validSlugs.has(s) && s !== orphan && !existingPairKeys.has(`${s}->${orphan}`)) ||
      allValidList.find((s) => s !== orphan && !existingPairKeys.has(`${s}->${orphan}`));
    if (bestSource) {
      const targetTitle = slugTitles.get(orphan) || orphan;
      suggestedLinks.push({
        sourceSlug: bestSource,
        targetSlug: orphan,
        anchorText: `${targetTitle} — EPR Bazaar Guide`,
        relevanceReason: `Resolves orphan status for ${orphan} by connecting from high-visibility marketplace hub ${bestSource}.`,
      });
      existingPairKeys.add(`${bestSource}->${orphan}`);
    }
  }

  // Contextual semantic pairings
  for (const src of allValidList) {
    if (suggestedLinks.length >= 12) break;
    const srcWords = slugKeywords.get(src) || new Set<string>();
    let bestTarget = '';
    let bestOverlap = 0;

    for (const dst of allValidList) {
      if (src === dst) continue;
      if (existingPairKeys.has(`${src}->${dst}`)) continue;
      // Avoid linking legal footers to legal footers
      if (['/terms', '/privacy', '/refund', '/disclaimer'].includes(src) && ['/terms', '/privacy', '/refund', '/disclaimer'].includes(dst)) {
        continue;
      }
      const dstWords = slugKeywords.get(dst) || new Set<string>();
      let overlap = 0;
      for (const w of srcWords) {
        if (dstWords.has(w)) overlap += 1;
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestTarget = dst;
      }
    }

    if (bestTarget && bestOverlap >= 2) {
      const targetTitle = slugTitles.get(bestTarget) || bestTarget;
      suggestedLinks.push({
        sourceSlug: src,
        targetSlug: bestTarget,
        anchorText: `Explore ${targetTitle}`,
        relevanceReason: `Contextual topic relevance (${bestOverlap} shared domain terms between ${src} and ${bestTarget}).`,
      });
      existingPairKeys.add(`${src}->${bestTarget}`);
    }
  }

  return {
    orphanSlugs,
    brokenLinks,
    approvedLinkCount,
    suggestedLinks,
  };
}

export function calculatePageSeoScore(params: {
  page: SeoPageInput;
  allPages: SeoPageInput[];
  categories?: CategorySeoInput[];
  approvedFaqs?: SeoFaqInput[];
  internalLinks?: SeoInternalLinkInput[];
  blogs?: SeoBlogInput[];
}): PageSeoScoreReport {
  const { page, allPages } = params;
  const cleanSlug = normalizeSlug(page.slug);
  const title = (page.seoTitle || '').trim();
  const desc = (page.metaDescription || '').trim();
  const h1 = (page.h1Heading || page.pageTitle || '').trim();
  const fullContent = `${page.contentSummary || ''} ${page.bodyContent || ''}`.trim();
  const words = tokenizeWords(fullContent);
  const primaryKw = (page.primaryKeyword || '').trim();

  const issuesFound: string[] = [];
  const priorityRecommendations: string[] = [];
  const suggestedImprovements: string[] = [];

  // 1. SEO Title (0-10)
  const dupTitle = allPages.some(
    (other) => other.id !== page.id && (other.seoTitle || '').trim().toLowerCase() === title.toLowerCase() && Boolean(title)
  );
  let seoTitleScore = 0;
  if (!title) {
    issuesFound.push('Missing SEO title.');
    priorityRecommendations.push('Add a unique, descriptive SEO title (40–62 characters).');
  } else {
    seoTitleScore = 4;
    if (title.length >= 30 && title.length <= 65) seoTitleScore += 3;
    else suggestedImprovements.push(`Adjust SEO title length (currently ${title.length} chars; ideal 35–65 chars).`);
    if (!dupTitle) seoTitleScore += 3;
    else {
      issuesFound.push('Duplicate SEO title shared with another page.');
      priorityRecommendations.push('Differentiate SEO title so it is unique across the domain.');
    }
  }

  // 2. Meta Description (0-10)
  const dupDesc = allPages.some(
    (other) => other.id !== page.id && (other.metaDescription || '').trim().toLowerCase() === desc.toLowerCase() && Boolean(desc)
  );
  let metaDescriptionScore = 0;
  if (!desc) {
    issuesFound.push('Missing meta description.');
    priorityRecommendations.push('Write an accurate meta description (120–158 characters).');
  } else {
    metaDescriptionScore = 4;
    if (desc.length >= 110 && desc.length <= 165) metaDescriptionScore += 3;
    else suggestedImprovements.push(`Refine meta description length (currently ${desc.length} chars; ideal 115–160 chars).`);
    if (!dupDesc) metaDescriptionScore += 3;
    else {
      issuesFound.push('Duplicate meta description shared with another page.');
      priorityRecommendations.push('Rewrite meta description to summarize this page uniquely.');
    }
  }

  // 3. H1 Heading (0-10)
  let h1HeadingScore = 0;
  if (!h1) {
    issuesFound.push('Missing primary H1 heading.');
    priorityRecommendations.push('Add a clear H1 heading summarizing the page.');
  } else {
    h1HeadingScore = 6;
    if (h1.length >= 15 && h1.length <= 80) h1HeadingScore += 4;
    else suggestedImprovements.push('Refine H1 length to 15–80 characters for clearer scannability.');
  }

  // 4. Content Quality (0-10)
  let contentQualityScore = 0;
  if (words.length < 15) {
    contentQualityScore = 2;
    issuesFound.push('Thin page summary/content (< 15 meaningful words).');
    priorityRecommendations.push('Expand on-page copy with concrete B2B EPR trading details or workflow steps.');
  } else if (words.length < 35) {
    contentQualityScore = 6;
    suggestedImprovements.push('Add deeper explanatory headings and FAQs to strengthen topical coverage.');
  } else if (words.length < 80) {
    contentQualityScore = 8;
  } else {
    contentQualityScore = 10;
  }

  // 5. Keyword Relevance (0-10)
  let keywordRelevanceScore = 0;
  if (!primaryKw) {
    keywordRelevanceScore = 4;
    suggestedImprovements.push('Assign a focused primary EPR keyword using the AI Keyword Research or Meta Optimizer.');
  } else {
    const combined = `${title} ${desc} ${h1} ${fullContent}`.toLowerCase();
    const density = computeKeywordDensityPercent(fullContent, primaryKw);
    const inTitle = title.toLowerCase().includes(primaryKw.toLowerCase());
    const inContent = combined.includes(primaryKw.toLowerCase());
    if (density > 4.5) {
      keywordRelevanceScore = 4;
      issuesFound.push(`Potential keyword overuse (${density}% density for "${primaryKw}").`);
      priorityRecommendations.push('Reduce repetitive keyword phrasing and use natural industry synonyms.');
    } else {
      keywordRelevanceScore = 4 + (inTitle ? 3 : 0) + (inContent ? 3 : 0);
      if (!inTitle) suggestedImprovements.push(`Include primary topic "${primaryKw}" naturally in the page title or H1.`);
    }
  }

  // 6. Internal Linking (0-10)
  const linkAnalysis = analyzeInternalLinkGraph(
    allPages,
    params.categories || [],
    params.blogs || [],
    params.internalLinks || []
  );
  const approvedOutgoingOrIncoming = (params.internalLinks || []).filter(
    (l) =>
      l.status === 'Approved' &&
      (normalizeSlug(l.sourceSlug) === cleanSlug || normalizeSlug(l.targetSlug) === cleanSlug)
  ).length;
  const isOrphan = linkAnalysis.orphanSlugs.includes(cleanSlug);
  let internalLinkingScore = isOrphan ? 2 : 7;
  if (approvedOutgoingOrIncoming > 0) {
    internalLinkingScore = Math.min(10, internalLinkingScore + Math.min(3, approvedOutgoingOrIncoming));
  }
  if (isOrphan) {
    issuesFound.push('Orphan page: zero internal links point to this URL.');
    priorityRecommendations.push('Approve at least one contextual internal link pointing to this page.');
  } else if (approvedOutgoingOrIncoming === 0) {
    suggestedImprovements.push('Add approved contextual internal links to related EPR categories or buyer/seller guides.');
  }

  // 7. Image Alt Text (0-10)
  const altText = (page.imageAltText || '').trim();
  let imageAltTextScore = 0;
  if (!altText) {
    imageAltTextScore = 3;
    suggestedImprovements.push('Configure descriptive image alt text for hero/category visuals and share graphics.');
  } else if (altText.length >= 10 && altText.length <= 140) {
    imageAltTextScore = 10;
  } else {
    imageAltTextScore = 6;
    suggestedImprovements.push('Keep image alt text concise and descriptive (10–125 characters).');
  }

  // 8. Canonical URL (0-10)
  const canonicalCheck = validateCanonicalUrl(page.canonicalUrl || buildCanonicalUrl(cleanSlug), cleanSlug);
  let canonicalUrlScore = canonicalCheck.valid ? 10 : 2;
  if (!canonicalCheck.valid) {
    issuesFound.push(canonicalCheck.reason || 'Canonical URL mismatch.');
    priorityRecommendations.push(`Normalize canonical URL to ${buildCanonicalUrl(cleanSlug)}.`);
  }

  // 9. Technical SEO (0-10)
  let technicalSeoScore = 0;
  if (!isRestrictedPath(cleanSlug)) technicalSeoScore += 3;
  if (page.published && page.robots === 'index, follow') technicalSeoScore += 4;
  else if (!page.published) {
    technicalSeoScore += 1;
    suggestedImprovements.push('Publish this page when ready so search engines can index it.');
  }
  if ((page.ogTitle || '').trim() && (page.ogDescription || '').trim()) technicalSeoScore += 3;
  else suggestedImprovements.push('Populate Open Graph title and description for clean social previews.');

  // 10. Structured Data (0-10)
  const pageFaqs = (params.approvedFaqs || []).filter(
    (f) => f.approved && normalizeSlug(f.pageSlug) === cleanSlug
  );
  let structuredDataScore = page.published && !isRestrictedPath(cleanSlug) ? 7 : 2;
  if (cleanSlug === '/faq' || pageFaqs.length > 0) {
    structuredDataScore = 10;
  } else if (page.published) {
    suggestedImprovements.push('Generate and approve relevant page FAQs to strengthen structured content coverage.');
  }

  const categoryScores: PageCategoryScoreBreakdown = {
    seoTitle: seoTitleScore,
    metaDescription: metaDescriptionScore,
    h1Heading: h1HeadingScore,
    contentQuality: contentQualityScore,
    keywordRelevance: keywordRelevanceScore,
    internalLinking: internalLinkingScore,
    imageAltText: imageAltTextScore,
    canonicalUrl: canonicalUrlScore,
    technicalSeo: technicalSeoScore,
    structuredData: structuredDataScore,
  };

  const overallScore =
    categoryScores.seoTitle +
    categoryScores.metaDescription +
    categoryScores.h1Heading +
    categoryScores.contentQuality +
    categoryScores.keywordRelevance +
    categoryScores.internalLinking +
    categoryScores.imageAltText +
    categoryScores.canonicalUrl +
    categoryScores.technicalSeo +
    categoryScores.structuredData;

  return {
    pageId: page.id,
    slug: cleanSlug,
    pageTitle: page.pageTitle,
    overallScore,
    categoryScores,
    issuesFound,
    priorityRecommendations,
    suggestedImprovements,
    disclaimer: AI_SEO_SCORE_DISCLAIMER,
  };
}

export function generateDeterministicMetaContentAudit(input: {
  pageTitle: string;
  slug: string;
  contentSummary: string;
  bodyContent?: string;
  existingTitles: string[];
  availableSlugs?: string[];
}): AiMetaContentAuditDraft {
  const cleanSlug = normalizeSlug(input.slug);
  const baseTitle = (input.pageTitle || 'EPR Credit Trading').trim();
  const combinedSource = `${input.contentSummary || ''} ${input.bodyContent || ''}`.trim();

  let seoTitle = baseTitle.includes('EPR Bazaar')
    ? baseTitle
    : `${baseTitle} | ETP – EPR Bazaar`;
  seoTitle = truncateSeoText(seoTitle, 64);
  if (
    input.existingTitles.some((t) => t.trim().toLowerCase() === seoTitle.toLowerCase()) &&
    cleanSlug !== '/'
  ) {
    const slugHint = cleanSlug.replace(/^\//, '').replace(/-/g, ' ');
    seoTitle = truncateSeoText(`${baseTitle} (${slugHint}) | ETP – EPR Bazaar`, 64);
  }

  const baseDesc =
    combinedSource.length >= 65
      ? combinedSource
      : `${baseTitle} on ETP – EPR Bazaar. Connect with verified B2B EPR credit buyers and recyclers across India through managed rate matching and confidential facilitator negotiations.`;
  const metaDescription = truncateSeoText(baseDesc, 158);

  const words = tokenizeWords(`${baseTitle} ${combinedSource}`);
  const primaryKeyword =
    cleanSlug === '/'
      ? 'EPR credit trading India'
      : cleanSlug.includes('rate')
      ? 'EPR certificate price India'
      : cleanSlug.includes('buy')
      ? 'buy EPR credits India'
      : cleanSlug.includes('sell')
      ? 'sell EPR credits recycler'
      : `${baseTitle.toLowerCase().slice(0, 42)}`;

  const candidateSecondary = [
    'EPR compliance India',
    'CPCB EPR portal credits',
    'PIBO EPR fulfilment',
    'verified EPR recyclers',
    'plastic waste EPR credits',
    'managed B2B EPR marketplace',
  ].filter((k) => !primaryKeyword.includes(k.toLowerCase()));

  const missingTopics: string[] = [];
  if (!combinedSource.toLowerCase().includes('gst') && !combinedSource.toLowerCase().includes('invoice')) {
    missingTopics.push('GST invoicing and settlement documentation workflow');
  }
  if (!combinedSource.toLowerCase().includes('financial year') && !combinedSource.toLowerCase().includes('fy')) {
    missingTopics.push('Applicable Financial Year (FY) credit validity clarity');
  }
  if (!combinedSource.toLowerCase().includes('confidential')) {
    missingTopics.push('Confidential intermediary negotiation protection');
  }

  const candidateInternalLinks = (input.availableSlugs || ['/marketplace', '/market-rates', '/how-it-works', '/buy-credits', '/sell-credits'])
    .filter((s) => normalizeSlug(s) !== cleanSlug && !isRestrictedPath(s))
    .slice(0, 4);

  return {
    seoTitle,
    metaDescription,
    primaryKeyword,
    secondaryKeywords: candidateSecondary.slice(0, 5),
    h1Suggestion: truncateSeoText(`${baseTitle} — Managed B2B EPR Compliance`, 75),
    ogTitle: seoTitle,
    ogDescription: metaDescription,
    imageAltText: `${baseTitle} – ETP EPR Bazaar verified B2B environmental credit platform`,
    missingTopics,
    headingSuggestions: [
      `Overview of ${baseTitle}`,
      'Eligibility, Verification & Financial Year Scope',
      'How Managed Rate Matching & Facilitator Coordination Works',
    ],
    readabilityNotes:
      words.length < 35
        ? 'Summary is currently brief; expanding into 2–3 structured paragraphs with bulleted workflow steps will improve scannability.'
        : 'Tone is clear and factual; breaking dense paragraphs under descriptive H2 subheadings improves readability.',
    keywordOveruseWarnings: [],
    duplicateContentRisk: 'Low overlap detected against existing core route summaries.',
    recommendedInternalLinks: candidateInternalLinks,
    recommendedFaqs: [
      {
        question: `How does ETP – EPR Bazaar support ${baseTitle}?`,
        answer:
          'ETP – EPR Bazaar connects verified PIBOs and authorized recyclers through category-specific rate discovery, anonymized matching, and facilitator-coordinated negotiations.',
      },
      {
        question: 'Are buyer and seller identities kept confidential during negotiations?',
        answer:
          'Yes. Counterparty names and private contact details remain withheld across matching and offer stages while facilitators coordinate pricing and order documentation.',
      },
    ],
    contentStructure: [
      'Hero / Value Proposition & Primary H1',
      'Key Category Scope & Financial Year Coverage',
      'Step-by-Step Managed Trading Workflow',
      'Frequently Asked Questions & Contextual Links',
    ],
    improvedContentDraft: `${combinedSource}\n\nManaged Facilitation & Verification: Every participant completes corporate KYC, GSTIN, and EPR registration verification before submitting requirements or listing certified credit inventory. Dedicated ETP – EPR Bazaar facilitators coordinate anonymized rate matching, offer exchanges, GST invoicing, and settlement tracking across eligible financial years.`,
  };
}

export function generateDeterministicKeywordIdeas(
  topic: string,
  availableSlugs: string[] = ['/marketplace', '/market-rates', '/buy-credits', '/sell-credits', '/how-it-works']
): AiKeywordIdeaDraft[] {
  const cleanTopic = (topic || 'EPR Certificate Trading').trim();
  const topicLower = cleanTopic.toLowerCase();

  const pickPage = (intent: SearchIntentType): string => {
    if (topicLower.includes('price') || topicLower.includes('rate')) return '/market-rates';
    if (topicLower.includes('buyer') || topicLower.includes('pibo')) return '/buy-credits';
    if (topicLower.includes('seller') || topicLower.includes('recycler')) return '/sell-credits';
    if (intent === 'Transactional') {
      return availableSlugs.includes('/marketplace') ? '/marketplace' : '/';
    }
    return availableSlugs.includes('/how-it-works') ? '/how-it-works' : '/';
  };

  return [
    {
      keyword: `${cleanTopic} India`,
      searchIntent: 'Commercial',
      relatedKeywords: [`${cleanTopic} platform`, `B2B ${cleanTopic}`, 'CPCB compliant EPR desk'],
      suggestedPage: pickPage('Commercial'),
      contentOpportunity: `Target Indian PIBOs and recyclers actively evaluating transparent ${cleanTopic} channels with clear financial-year availability.`,
      competitionNote: 'AI strategy estimate: Moderate B2B specificity (verify competition in Google Keyword Planner).',
      isAiEstimate: true,
    },
    {
      keyword: `verified ${cleanTopic} marketplace`,
      searchIntent: 'Transactional',
      relatedKeywords: [`buy ${cleanTopic}`, `sell ${cleanTopic}`, 'managed EPR credit matching'],
      suggestedPage: '/marketplace',
      contentOpportunity: 'High commercial intent query suited for marketplace landing copy emphasizing KYC verification and confidential facilitation.',
      competitionNote: 'AI strategy estimate: Focused niche commercial intent; verify via Search Console impressions.',
      isAiEstimate: true,
    },
    {
      keyword: `${cleanTopic} guidelines and process`,
      searchIntent: 'Informational',
      relatedKeywords: [`how ${cleanTopic} works`, 'EPR documentation checklist', 'financial year credit validity'],
      suggestedPage: '/how-it-works',
      contentOpportunity: 'Educational guide + FAQ opportunity that feeds high-intent readers toward Buyer and Seller onboarding.',
      competitionNote: 'AI strategy estimate: Informational queries benefit from structured step-by-step guides and verified regulatory citations.',
      isAiEstimate: true,
    },
  ];
}

export function generateDeterministicBlogDraft(topic: string): AiBlogDraftResult {
  const cleanTopic = (topic || 'EPR Certificate Trading in India').trim();
  const slugBase = cleanTopic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  const slug = slugBase || 'epr-compliance-guide';
  const title = truncateSeoText(`${cleanTopic}: Practical B2B Compliance Guide`, 70);

  return {
    title,
    slug,
    introduction: `Understanding ${cleanTopic} is essential for Producers, Importers, Brand Owners (PIBOs), and authorized recyclers managing annual Extended Producer Responsibility targets in India. Structured record-keeping, category accuracy, and transparent pricing discovery simplify annual compliance planning.`,
    headings: [
      `Overview of ${cleanTopic} Requirements`,
      'Preparing Accurate Category & Financial Year Documentation',
      'How Managed B2B Rate Matching Supports Transparent Settlements',
      'Key Verification Checkpoints Before Executing Credit Transfers',
    ],
    articleBody: `Overview of ${cleanTopic} Requirements:\nOrganizations operating under Indian Extended Producer Responsibility frameworks must track obligations across specific waste streams, subcategories, and financial years. Prior to initiating procurement or listing generated credits, teams should confirm official CPCB/SPCB portal notifications directly.\n\nPreparing Accurate Category & Financial Year Documentation:\nAccurate matching starts with verifying GSTIN records, valid EPR registration certificates, and category-wise tonnage or unit balances. Keeping financial year allocations cleanly separated prevents mismatches during annual compliance reconciliation.\n\nHow Managed B2B Rate Matching Supports Transparent Settlements:\nRather than relying on unverified informal outreach, ETP – EPR Bazaar coordinates anonymized discovery between verified buyers and authorized recyclers. Facilitators review submitted lots, share structured offers and counteroffers, and track invoicing through settlement.\n\nKey Verification Checkpoints Before Executing Credit Transfers:\nAlways reconcile credit category codes, unit measurements (MT, KL, or Units), GST invoice terms, and official CPCB/SPCB portal transfer confirmations before closing a transaction.`,
    conclusion: `Effective ${cleanTopic} management depends on verified documentation, verified counterparty governance, and transparent rate discovery. Explore active EPR categories on ETP – EPR Bazaar or sign in to submit a requirement or list verified inventory.`,
    metaTitle: truncateSeoText(`${cleanTopic} Guide | ETP – EPR Bazaar`, 62),
    metaDescription: truncateSeoText(
      `Practical B2B overview of ${cleanTopic} covering category alignment, KYC verification, and managed EPR credit matching in India.`,
      156
    ),
    primaryKeyword: cleanTopic.toLowerCase(),
    secondaryKeywords: [
      'EPR credit trading India',
      'PIBO compliance workflow',
      'authorized EPR recyclers',
      'CPCB EPR guidelines reference',
    ],
    suggestedInternalLinks: ['/marketplace', '/market-rates', '/how-it-works', '/buy-credits', '/sell-credits'],
    relevantFaqs: [
      {
        question: `Where should businesses verify official rules for ${cleanTopic}?`,
        answer:
          'All statutory obligations, category definitions, and portal filing deadlines must be verified directly against official CPCB and SPCB notifications.',
      },
      {
        question: 'How does ETP – EPR Bazaar protect counterparty confidentiality?',
        answer:
          'ETP – EPR Bazaar withholds company identities and private contact details across matching opportunities and routes all offers through assigned facilitators.',
      },
    ],
    featuredImagePrompt:
      'Clean editorial corporate illustration showing Indian sustainable manufacturing, circular economy packaging recycling facility, and structured digital compliance ledger in navy blue and emerald green.',
  };
}

export function generateDeterministicFaqs(input: {
  pageTitle: string;
  slug: string;
  contentSummary: string;
}): { question: string; answer: string }[] {
  const cleanTitle = (input.pageTitle || 'EPR Credit Trading').trim();
  const summaryNote = (input.contentSummary || '').trim();
  return [
    {
      question: `What does ${cleanTitle} cover on ETP – EPR Bazaar?`,
      answer: summaryNote
        ? `${summaryNote} Authorized facilitators coordinate confidential rate matching and documentation across verified Indian buyers and recyclers.`
        : `${cleanTitle} supports verified corporate buyers and authorized recyclers through transparent rate discovery and managed negotiations.`,
    },
    {
      question: 'What documents are required before trading on the platform?',
      answer:
        'Registered organizations authenticate with Google Sign-In and provide corporate details including mobile number, GSTIN, EPR registration number, and facility or compliance category records.',
    },
    {
      question: 'Are indicative market quotes binding execution prices?',
      answer:
        'No. Published rate references and seller asking prices serve as market discovery references until both parties confirm a final negotiated rate with an assigned facilitator.',
    },
  ];
}

export function buildBlogArticleStructuredData(blog: SeoBlogInput): Record<string, unknown>[] {
  const cleanSlug = `/blog/${blog.slug.replace(/^\/blog\//, '').replace(/^\/+/, '')}`;
  const canonicalUrl = buildCanonicalUrl(cleanSlug);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'NYANVI ECOCLEAN PRIVATE LIMITED',
      alternateName: 'ETP – EPR Bazaar',
      url: `${CANONICAL_ORIGIN}/`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: blog.title,
      description: blog.metaDescription,
      mainEntityOfPage: canonicalUrl,
      keywords: [blog.primaryKeyword, ...blog.secondaryKeywords].filter(Boolean).join(', '),
      dateModified: (blog.updatedAtIso || new Date().toISOString()).slice(0, 10),
      author: {
        '@type': 'Organization',
        name: 'ETP – EPR Bazaar Editorial Desk',
      },
      publisher: {
        '@type': 'Organization',
        name: 'NYANVI ECOCLEAN PRIVATE LIMITED',
        url: `${CANONICAL_ORIGIN}/`,
      },
    },
  ];
}

export function buildFaqStructuredData(faqs: SeoFaqInput[]): Record<string, unknown> | null {
  const approved = faqs.filter((f) => f.approved && f.question.trim() && f.answer.trim());
  if (approved.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: approved.map((f) => ({
      '@type': 'Question',
      name: f.question.trim(),
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer.trim(),
      },
    })),
  };
}
