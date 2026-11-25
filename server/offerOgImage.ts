import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { CANONICAL_ORIGIN, SITE_BRAND_NAME } from '../shared/seoEngine.ts';
import {
  buildOfferCanonicalUrl,
  formatOfferQuantity,
  formatOfferRatePerKg,
  formatValidityDateDisplay,
  sanitizeSvgText,
} from '../shared/sellerOffers.ts';
import type { SellerOfferBase } from '../shared/sellerOffers.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedLogoDataUri: string | null | undefined;

function loadBrandLogoDataUri(): string | null {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri;
  const candidates = [
    path.resolve(__dirname, '../public/assets/aistudio/epr_bazaar_logo_squire__84422abf.png'),
    path.resolve(__dirname, '../public/assets/aistudio/epr_bazaar_logo__9ac2c6f9.jpeg'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const buf = fs.readFileSync(candidate);
        const mime = candidate.endsWith('.png') ? 'image/png' : 'image/jpeg';
        cachedLogoDataUri = `data:${mime};base64,${buf.toString('base64')}`;
        return cachedLogoDataUri;
      }
    } catch {
      // try next candidate
    }
  }
  cachedLogoDataUri = null;
  return null;
}

export function buildOfferOgSvg(
  offer: SellerOfferBase | null,
  offerId: string,
  origin = CANONICAL_ORIGIN
): string {
  const logoDataUri = loadBrandLogoDataUri();
  const displayUrl = buildOfferCanonicalUrl(offer?.id || offerId, origin).replace(/^https?:\/\//i, '');

  const materialTitle = sanitizeSvgText(
    offer?.materialName || 'Verified EPR Credit Selling Offer',
    44
  );
  const categoryLine = sanitizeSvgText(
    offer ? `${offer.categoryName}  ·  ${offer.categoryType}` : 'India B2B EPR Credit Trading Marketplace',
    66
  );
  const priceText = sanitizeSvgText(
    offer ? formatOfferRatePerKg(offer.sellingRatePerKg) : 'Live Rates',
    24
  );
  const qtyText = sanitizeSvgText(
    offer ? formatOfferQuantity(offer.availableQty, offer.quantityUnit) : 'Verified Supply',
    24
  );
  const moqText = sanitizeSvgText(
    offer ? formatOfferQuantity(offer.minOrderQty, offer.minOrderUnit) : 'Flexible MOQ',
    24
  );
  const locationText = sanitizeSvgText(
    offer ? `${offer.city}, ${offer.state}` : 'Pan-India EPR Network',
    32
  );
  const validText = sanitizeSvgText(
    offer ? `Valid till ${formatValidityDateDisplay(offer.validityDate)}` : 'etp.eprbazaar.com',
    32
  );
  const sellerText = sanitizeSvgText(
    offer ? `${offer.sellerCompanyName}` : SITE_BRAND_NAME,
    46
  );
  const safeDisplayUrl = sanitizeSvgText(displayUrl, 64);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="headerBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0A172A" />
      <stop offset="100%" stop-color="#10233F" />
    </linearGradient>
    <clipPath id="logoClip">
      <rect x="56" y="34" width="60" height="60" rx="12" />
    </clipPath>
  </defs>

  <!-- Canvas -->
  <rect width="1200" height="630" fill="#F4F7FB" />

  <!-- Top Brand Bar -->
  <rect x="0" y="0" width="1200" height="128" fill="url(#headerBg)" />
  <rect x="0" y="124" width="1200" height="4" fill="#16A36A" />

  ${
    logoDataUri
      ? `<rect x="56" y="34" width="60" height="60" rx="12" fill="#FFFFFF" />
  <image href="${logoDataUri}" x="56" y="34" width="60" height="60" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" />`
      : `<rect x="56" y="34" width="60" height="60" rx="12" fill="#16A36A" />
  <text x="86" y="73" text-anchor="middle" font-family="DejaVu Sans" font-size="24" font-weight="700" fill="#FFFFFF">EPR</text>`
  }

  <text x="134" y="61" font-family="DejaVu Sans" font-size="26" font-weight="700" fill="#FFFFFF">ETP – EPR BAZAAR</text>
  <text x="134" y="88" font-family="DejaVu Sans" font-size="15" font-weight="400" fill="#CBD5E1">India's Verified B2B EPR Credit Trading Marketplace</text>

  <!-- Right Label -->
  <rect x="900" y="42" width="244" height="44" rx="8" fill="#16A36A" />
  <text x="1022" y="70" text-anchor="middle" font-family="DejaVu Sans" font-size="16" font-weight="700" fill="#FFFFFF">LIVE SELLER OFFER</text>

  <!-- Main Card -->
  <rect x="56" y="162" width="1088" height="366" rx="16" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />

  <!-- Category Kicker -->
  <text x="96" y="212" font-family="DejaVu Sans" font-size="18" font-weight="700" fill="#16A36A">${categoryLine}</text>

  <!-- Material Headline -->
  <text x="96" y="264" font-family="DejaVu Sans" font-size="38" font-weight="700" fill="#0A172A">${materialTitle}</text>

  <!-- Seller Company Subline -->
  <text x="96" y="302" font-family="DejaVu Sans" font-size="19" font-weight="400" fill="#475569">Offered by: ${sellerText}</text>

  <!-- Price Highlight Box -->
  <rect x="826" y="196" width="278" height="118" rx="12" fill="#F0FDF4" stroke="#86EFAC" stroke-width="2" />
  <text x="852" y="232" font-family="DejaVu Sans" font-size="15" font-weight="700" fill="#15803D">OFFERED SELLING RATE</text>
  <text x="852" y="286" font-family="DejaVu Sans Mono" font-size="36" font-weight="700" fill="#0A172A">${priceText}</text>

  <!-- Hairline Divider -->
  <line x1="96" y1="348" x2="1104" y2="348" stroke="#E2E8F0" stroke-width="2" />

  <!-- 3-Column Metrics Strip -->
  <text x="96" y="392" font-family="DejaVu Sans" font-size="15" font-weight="700" fill="#64748B">AVAILABLE QUANTITY</text>
  <text x="96" y="434" font-family="DejaVu Sans Mono" font-size="30" font-weight="700" fill="#0A172A">${qtyText}</text>

  <line x1="420" y1="372" x2="420" y2="492" stroke="#E2E8F0" stroke-width="2" />
  <text x="452" y="392" font-family="DejaVu Sans" font-size="15" font-weight="700" fill="#64748B">MIN. ORDER QUANTITY</text>
  <text x="452" y="434" font-family="DejaVu Sans Mono" font-size="30" font-weight="700" fill="#0A172A">${moqText}</text>

  <line x1="760" y1="372" x2="760" y2="492" stroke="#E2E8F0" stroke-width="2" />
  <text x="792" y="392" font-family="DejaVu Sans" font-size="15" font-weight="700" fill="#64748B">SELLER LOCATION</text>
  <text x="792" y="432" font-family="DejaVu Sans" font-size="24" font-weight="700" fill="#0A172A">${locationText}</text>
  <text x="792" y="468" font-family="DejaVu Sans" font-size="16" font-weight="400" fill="#475569">${validText}</text>

  <!-- Bottom URL Bar -->
  <rect x="0" y="556" width="1200" height="74" fill="#FFFFFF" />
  <line x1="0" y1="556" x2="1200" y2="556" stroke="#E2E8F0" stroke-width="2" />
  <text x="56" y="601" font-family="DejaVu Sans Mono" font-size="20" font-weight="700" fill="#10233F">${safeDisplayUrl}</text>
  <text x="1144" y="601" text-anchor="end" font-family="DejaVu Sans" font-size="16" font-weight="700" fill="#16A36A">Click to View Offer &amp; Send Buyer Enquiry →</text>
</svg>`;
}

export function renderOfferOgPng(
  offer: SellerOfferBase | null,
  offerId: string,
  origin = CANONICAL_ORIGIN
): Buffer {
  const svg = buildOfferOgSvg(offer, offerId, origin);
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: 1200,
    },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'DejaVu Sans',
    },
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}
