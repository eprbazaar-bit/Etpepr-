import { CANONICAL_ORIGIN, SITE_BRAND_NAME, OPERATOR_LEGAL_NAME, escapeXml } from './seoEngine.ts';

export type SellerOfferUnit = 'KG' | 'MT';

export type SellerOfferStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Active'
  | 'Deactivated'
  | 'Rejected';

export type EffectiveSellerOfferStatus = SellerOfferStatus | 'Expired';

export type OfferEnquiryStatus = 'New' | 'Reviewed' | 'Responded' | 'Closed';

export interface SellerOfferBase {
  id: string;
  sellerUid: string;
  sellerCompanyId: string;
  sellerCompanyName: string;
  sellerVerification: 'Verified' | 'Pending Review' | 'Action Required';
  categoryId: string;
  categoryName: string;
  materialName: string;
  categoryType: string;
  availableQty: number;
  quantityUnit: SellerOfferUnit;
  sellingRatePerKg: number;
  minOrderQty: number;
  minOrderUnit: SellerOfferUnit;
  state: string;
  city: string;
  validityDate: string; // YYYY-MM-DD
  remarks?: string;
  status: SellerOfferStatus;
  createdAtIso?: string;
  updatedAtIso?: string;
}

export interface SellerOfferFormInput {
  categoryId: string;
  categoryName: string;
  materialName: string;
  categoryType: string;
  availableQty: number;
  quantityUnit: SellerOfferUnit;
  sellingRatePerKg: number;
  minOrderQty: number;
  minOrderUnit: SellerOfferUnit;
  state: string;
  city: string;
  validityDate: string;
  remarks?: string;
}

export interface SellerOfferFilterCriteria {
  search?: string;
  categoryId?: string;
  material?: string;
  state?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  minQtyKg?: number | null;
}

export const INDIAN_STATES: readonly string[] = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Chandigarh',
  'Puducherry',
  'Dadra and Nagar Haveli and Daman and Diu',
] as const;

export const OFFER_ID_REGEX = /^[a-zA-Z0-9_-]{3,64}$/;
export const VALIDITY_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function getTodayIstDateString(now: Date = new Date()): string {
  // India Standard Time (UTC+05:30)
  const istMs = now.getTime() + 330 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

export function isOfferExpired(validityDate: string, now: Date = new Date()): boolean {
  const clean = (validityDate || '').trim();
  if (!VALIDITY_DATE_REGEX.test(clean)) return true;
  const today = getTodayIstDateString(now);
  return clean < today;
}

export function getEffectiveOfferStatus(
  offer: Pick<SellerOfferBase, 'status' | 'validityDate'>,
  now: Date = new Date()
): EffectiveSellerOfferStatus {
  if (offer.status === 'Active' && isOfferExpired(offer.validityDate, now)) {
    return 'Expired';
  }
  return offer.status;
}

export function isOfferPubliclyVisible(
  offer: Pick<SellerOfferBase, 'status' | 'validityDate'>,
  now: Date = new Date()
): boolean {
  return offer.status === 'Active' && !isOfferExpired(offer.validityDate, now);
}

export function normalizeQuantityToKg(qty: number, unit: SellerOfferUnit): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return unit === 'MT' ? qty * 1000 : qty;
}

export function formatOfferRatePerKg(ratePerKg: number): string {
  if (!Number.isFinite(ratePerKg)) return '₹0.00/KG';
  const formatted = ratePerKg.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(ratePerKg) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `₹${formatted}/KG`;
}

export function formatOfferQuantity(qty: number, unit: SellerOfferUnit): string {
  if (!Number.isFinite(qty)) return `0 ${unit}`;
  const formatted = qty.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return `${formatted} ${unit}`;
}

export function formatValidityDateDisplay(validityDate: string): string {
  if (!VALIDITY_DATE_REGEX.test(validityDate || '')) return validityDate || '—';
  const [y, m, d] = validityDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function generateUniqueOfferId(categoryName: string, state: string, now: Date = new Date()): string {
  const catSlug = (categoryName || 'EPR')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 8) || 'EPR';
  const stateSlug = (state || 'IN')
    .toUpperCase()
    .replace(/[^A-Z]+/g, '')
    .slice(0, 3) || 'IN';
  const datePart = getTodayIstDateString(now).replace(/-/g, '').slice(2); // YYMMDD
  const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5).padEnd(5, 'X');
  return `OFF-${catSlug}-${stateSlug}-${datePart}-${rand}`.slice(0, 48);
}

export function buildOfferCanonicalUrl(offerId: string, origin = CANONICAL_ORIGIN): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return `${cleanOrigin}/offer/${encodeURIComponent(offerId.trim())}`;
}

export function buildOfferOgImageUrl(offerId: string, origin = CANONICAL_ORIGIN): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return `${cleanOrigin}/api/offers/${encodeURIComponent(offerId.trim())}/og-image.png`;
}

export function validateSellerOfferInput(
  input: SellerOfferFormInput,
  options?: { allowPastDateForDraft?: boolean; now?: Date }
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!input.categoryId?.trim() || !input.categoryName?.trim()) {
    errors.categoryId = 'Select an EPR Material / Credit Category.';
  }
  const mat = (input.materialName || '').trim();
  if (mat.length < 2 || mat.length > 120) {
    errors.materialName = 'Enter a material / credit name (2–120 characters).';
  }
  const cType = (input.categoryType || '').trim();
  if (cType.length < 1 || cType.length > 100) {
    errors.categoryType = 'Specify the Category Type.';
  }
  if (!Number.isFinite(input.availableQty) || input.availableQty <= 0) {
    errors.availableQty = 'Available Quantity must be greater than 0.';
  }
  if (input.quantityUnit !== 'KG' && input.quantityUnit !== 'MT') {
    errors.quantityUnit = 'Unit must be KG or MT.';
  }
  if (!Number.isFinite(input.sellingRatePerKg) || input.sellingRatePerKg <= 0) {
    errors.sellingRatePerKg = 'Selling Rate (₹ per KG) must be greater than 0.';
  }
  if (!Number.isFinite(input.minOrderQty) || input.minOrderQty <= 0) {
    errors.minOrderQty = 'Minimum Order Quantity must be greater than 0.';
  }
  const availKg = normalizeQuantityToKg(input.availableQty, input.quantityUnit);
  const moqKg = normalizeQuantityToKg(input.minOrderQty, input.minOrderUnit);
  if (availKg > 0 && moqKg > availKg) {
    errors.minOrderQty = 'Minimum Order Quantity cannot exceed Available Quantity.';
  }
  const st = (input.state || '').trim();
  if (st.length < 2 || st.length > 80) {
    errors.state = 'Select or enter Seller State.';
  }
  const city = (input.city || '').trim();
  if (city.length < 2 || city.length > 80) {
    errors.city = 'Enter Seller City.';
  }
  const vDate = (input.validityDate || '').trim();
  if (!VALIDITY_DATE_REGEX.test(vDate)) {
    errors.validityDate = 'Select a valid Offer Validity Date.';
  } else if (!options?.allowPastDateForDraft && isOfferExpired(vDate, options?.now)) {
    errors.validityDate = 'Offer Validity Date must be today or a future date.';
  }
  if (input.remarks && input.remarks.trim().length > 1000) {
    errors.remarks = 'Additional Remarks must be 1000 characters or fewer.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function filterPublicSellerOffers<T extends SellerOfferBase>(
  offers: T[],
  criteria: SellerOfferFilterCriteria,
  now: Date = new Date()
): T[] {
  const searchTerm = (criteria.search || '').trim().toLowerCase();
  const materialFilter = (criteria.material || '').trim().toLowerCase();
  const stateFilter = (criteria.state || '').trim().toLowerCase();

  return offers.filter((offer) => {
    if (!isOfferPubliclyVisible(offer, now)) return false;
    if (criteria.categoryId && criteria.categoryId !== 'ALL' && offer.categoryId !== criteria.categoryId) {
      return false;
    }
    if (materialFilter && materialFilter !== 'all') {
      const matMatch =
        offer.materialName.toLowerCase().includes(materialFilter) ||
        offer.categoryType.toLowerCase().includes(materialFilter);
      if (!matMatch) return false;
    }
    if (stateFilter && stateFilter !== 'all' && offer.state.toLowerCase() !== stateFilter) {
      return false;
    }
    if (typeof criteria.minPrice === 'number' && Number.isFinite(criteria.minPrice) && offer.sellingRatePerKg < criteria.minPrice) {
      return false;
    }
    if (typeof criteria.maxPrice === 'number' && Number.isFinite(criteria.maxPrice) && offer.sellingRatePerKg > criteria.maxPrice) {
      return false;
    }
    if (typeof criteria.minQtyKg === 'number' && Number.isFinite(criteria.minQtyKg) && criteria.minQtyKg > 0) {
      if (normalizeQuantityToKg(offer.availableQty, offer.quantityUnit) < criteria.minQtyKg) {
        return false;
      }
    }
    if (searchTerm) {
      const haystack = [
        offer.id,
        offer.materialName,
        offer.categoryName,
        offer.categoryType,
        offer.city,
        offer.state,
        offer.sellerCompanyName,
        offer.remarks || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });
}

export interface SocialShareLinks {
  offerUrl: string;
  shareMessage: string;
  whatsappUrl: string;
  facebookUrl: string;
  linkedinUrl: string;
  telegramUrl: string;
}

export function buildSocialShareLinks(
  offer: SellerOfferBase,
  origin = CANONICAL_ORIGIN
): SocialShareLinks {
  const offerUrl = buildOfferCanonicalUrl(offer.id, origin);
  const priceText = formatOfferRatePerKg(offer.sellingRatePerKg);
  const qtyText = formatOfferQuantity(offer.availableQty, offer.quantityUnit);
  const moqText = formatOfferQuantity(offer.minOrderQty, offer.minOrderUnit);
  const validUntil = formatValidityDateDisplay(offer.validityDate);

  const shareMessage = [
    `Live EPR Seller Offer on ${SITE_BRAND_NAME}`,
    `Material: ${offer.materialName} (${offer.categoryName} - ${offer.categoryType})`,
    `Rate: ${priceText} | Available: ${qtyText} | MOQ: ${moqText}`,
    `Location: ${offer.city}, ${offer.state} | Valid till: ${validUntil}`,
    `View & Send Enquiry: ${offerUrl}`,
  ].join('\n');

  const encodedUrl = encodeURIComponent(offerUrl);
  const encodedMsg = encodeURIComponent(shareMessage);
  const telegramText = encodeURIComponent(
    `${offer.materialName} (${offer.categoryName}) at ${priceText} — ${qtyText} available in ${offer.city}, ${offer.state} on ${SITE_BRAND_NAME}`
  );

  return {
    offerUrl,
    shareMessage,
    whatsappUrl: `https://wa.me/?text=${encodedMsg}`,
    facebookUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedinUrl: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    telegramUrl: `https://t.me/share/url?url=${encodedUrl}&text=${telegramText}`,
  };
}

export interface OfferResolvedSeo {
  pageTitle: string;
  seoTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  robots: 'index, follow' | 'noindex, nofollow';
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogImageWidth: number;
  ogImageHeight: number;
  ogType: 'website';
  ogSiteName: string;
  twitterCard: 'summary_large_image';
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  structuredData: Record<string, unknown>[];
}

export function buildOfferSeoMetadata(
  offer: SellerOfferBase | null,
  offerId: string,
  origin = CANONICAL_ORIGIN,
  now: Date = new Date()
): OfferResolvedSeo {
  const canonicalUrl = buildOfferCanonicalUrl(offerId, origin);
  const ogImage = buildOfferOgImageUrl(offerId, origin);

  if (!offer || !isOfferPubliclyVisible(offer, now)) {
    const fallbackTitle = `EPR Seller Offer ${offerId} | ${SITE_BRAND_NAME}`;
    const fallbackDesc =
      'View live verified EPR credit selling offers across Plastic, E-Waste, Battery, Tyre, and Used Oil categories on ETP – EPR Bazaar.';
    return {
      pageTitle: `EPR Offer ${offerId}`,
      seoTitle: fallbackTitle,
      metaDescription: fallbackDesc,
      canonicalUrl,
      robots: 'noindex, nofollow',
      ogTitle: fallbackTitle,
      ogDescription: fallbackDesc,
      ogImage: `${origin.replace(/\/+$/, '')}/assets/aistudio/epr_bazaar_logo__9ac2c6f9.jpeg`,
      ogImageWidth: 1200,
      ogImageHeight: 630,
      ogType: 'website',
      ogSiteName: SITE_BRAND_NAME,
      twitterCard: 'summary_large_image',
      twitterTitle: fallbackTitle,
      twitterDescription: fallbackDesc,
      twitterImage: `${origin.replace(/\/+$/, '')}/assets/aistudio/epr_bazaar_logo__9ac2c6f9.jpeg`,
      structuredData: [],
    };
  }

  const priceText = formatOfferRatePerKg(offer.sellingRatePerKg);
  const qtyText = formatOfferQuantity(offer.availableQty, offer.quantityUnit);
  const moqText = formatOfferQuantity(offer.minOrderQty, offer.minOrderUnit);
  const validDisplay = formatValidityDateDisplay(offer.validityDate);

  const seoTitle = `${offer.materialName} at ${priceText} (${offer.city}, ${offer.state}) | ${SITE_BRAND_NAME}`.slice(
    0,
    115
  );
  const metaDescription =
    `Buy ${offer.materialName} (${offer.categoryName} · ${offer.categoryType}) at ${priceText}. Available: ${qtyText}, MOQ: ${moqText}, Location: ${offer.city}, ${offer.state}. Valid till ${validDisplay} on ${SITE_BRAND_NAME}.`.slice(
      0,
      260
    );

  const structuredData: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${offer.materialName} – ${offer.categoryName}`,
      category: `${offer.categoryName} / ${offer.categoryType}`,
      description: metaDescription,
      sku: offer.id,
      image: ogImage,
      brand: {
        '@type': 'Organization',
        name: SITE_BRAND_NAME,
      },
      offers: {
        '@type': 'Offer',
        url: canonicalUrl,
        priceCurrency: 'INR',
        price: Number(offer.sellingRatePerKg.toFixed(2)),
        priceValidUntil: offer.validityDate,
        availability: 'https://schema.org/InStock',
        eligibleQuantity: {
          '@type': 'QuantitativeValue',
          value: offer.availableQty,
          unitText: offer.quantityUnit,
        },
        seller: {
          '@type': 'Organization',
          name: offer.sellerCompanyName,
          address: {
            '@type': 'PostalAddress',
            addressLocality: offer.city,
            addressRegion: offer.state,
            addressCountry: 'IN',
          },
        },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin.replace(/\/+$/, '')}/` },
        { '@type': 'ListItem', position: 2, name: 'Live EPR Seller Offers', item: `${origin.replace(/\/+$/, '')}/#live-seller-offers` },
        { '@type': 'ListItem', position: 3, name: offer.materialName, item: canonicalUrl },
      ],
    },
  ];

  return {
    pageTitle: offer.materialName,
    seoTitle,
    metaDescription,
    canonicalUrl,
    robots: 'index, follow',
    ogTitle: `${offer.materialName} · ${priceText} (${qtyText}) | ${SITE_BRAND_NAME}`,
    ogDescription: `${offer.categoryName} (${offer.categoryType}) · ${offer.city}, ${offer.state} · MOQ ${moqText} · Valid till ${validDisplay}. View & send buyer enquiry on ${SITE_BRAND_NAME}.`,
    ogImage,
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogType: 'website',
    ogSiteName: SITE_BRAND_NAME,
    twitterCard: 'summary_large_image',
    twitterTitle: `${offer.materialName} at ${priceText} | ${SITE_BRAND_NAME}`,
    twitterDescription: `${qtyText} available in ${offer.city}, ${offer.state} (${offer.categoryName}). Valid till ${validDisplay}.`,
    twitterImage: ogImage,
    structuredData,
  };
}

export function buildOfferSitemapXmlEntries(
  offers: SellerOfferBase[],
  origin = CANONICAL_ORIGIN,
  now: Date = new Date()
): { loc: string; lastmod: string; changefreq: 'daily'; priority: string }[] {
  const today = getTodayIstDateString(now);
  return offers
    .filter((o) => isOfferPubliclyVisible(o, now))
    .map((o) => ({
      loc: buildOfferCanonicalUrl(o.id, origin),
      lastmod: (o.updatedAtIso || o.createdAtIso || today).slice(0, 10),
      changefreq: 'daily' as const,
      priority: '0.8',
    }));
}

export function sanitizeSvgText(val: string, maxLen = 64): string {
  const clean = (val || '').replace(/[\r\n\t]+/g, ' ').trim();
  const truncated = clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
  return escapeXml(truncated);
}
