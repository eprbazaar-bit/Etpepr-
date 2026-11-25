import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiApp } from '../server.ts';
import type { OfferReadStore } from '../server/offerService.ts';
import { injectOfferSeoIntoHtml, invalidateSeoCache } from '../server/seoRoutes.ts';
import type { SeoDataStore } from '../server/seoRoutes.ts';
import {
  buildOfferCanonicalUrl,
  buildOfferOgImageUrl,
  buildOfferSeoMetadata,
  buildSocialShareLinks,
  filterPublicSellerOffers,
  generateUniqueOfferId,
  getEffectiveOfferStatus,
  isOfferExpired,
  isOfferPubliclyVisible,
  validateSellerOfferInput,
} from '../shared/sellerOffers.ts';
import type { SellerOfferBase } from '../shared/sellerOffers.ts';
import { CANONICAL_ORIGIN, DEFAULT_PUBLIC_SEO_PAGES } from '../shared/seoEngine.ts';

const SAMPLE_ACTIVE_OFFER: SellerOfferBase = {
  id: 'OFF-PLASTIC-GUJ-261125-ABCDE',
  sellerUid: 'seller-uid-1',
  sellerCompanyId: 'CMP-SELLER1',
  sellerCompanyName: 'GreenLoop Recyclers Pvt Ltd',
  sellerVerification: 'Verified',
  categoryId: 'cat-plastic',
  categoryName: 'Plastic EPR',
  materialName: 'Plastic Category II Flexible Credits',
  categoryType: 'Category II (Flexible Packaging)',
  availableQty: 120,
  quantityUnit: 'MT',
  sellingRatePerKg: 7.5,
  minOrderQty: 10,
  minOrderUnit: 'MT',
  state: 'Gujarat',
  city: 'Ahmedabad',
  validityDate: '2099-12-31',
  remarks: 'FY 2025-26 CPCB verified credits ready for transfer.',
  status: 'Active',
  createdAtIso: '2026-11-24T10:00:00.000Z',
  updatedAtIso: '2026-11-24T10:00:00.000Z',
};

const SAMPLE_EXPIRED_OFFER: SellerOfferBase = {
  ...SAMPLE_ACTIVE_OFFER,
  id: 'OFF-EWASTE-MH-200101-EXP01',
  categoryId: 'cat-ewaste',
  categoryName: 'E-Waste EPR',
  materialName: 'E-Waste IT Equipment Credits',
  categoryType: 'IT & Telecom Equipment',
  state: 'Maharashtra',
  city: 'Mumbai',
  sellingRatePerKg: 14.0,
  validityDate: '2020-01-01',
  status: 'Active',
};

const SAMPLE_DEACTIVATED_OFFER: SellerOfferBase = {
  ...SAMPLE_ACTIVE_OFFER,
  id: 'OFF-TYRE-WB-261125-DEACT',
  categoryId: 'cat-tyre',
  categoryName: 'Tyre EPR',
  materialName: 'End-of-Life Tyre Credits',
  categoryType: 'Crumb Rubber',
  state: 'West Bengal',
  city: 'Kolkata',
  sellingRatePerKg: 5.25,
  validityDate: '2099-12-31',
  status: 'Deactivated',
};

function startOfferTestServer(offers: SellerOfferBase[]) {
  const offerStore: OfferReadStore = {
    getOfferById: async (offerId) => offers.find((o) => o.id === offerId) || null,
    listPublicActiveOffers: async () => offers.filter((o) => isOfferPubliclyVisible(o)),
  };

  const seoStore: SeoDataStore = {
    listSeoPages: async () =>
      DEFAULT_PUBLIC_SEO_PAGES.slice(0, 3).map((p) => ({
        ...p,
        updatedAtIso: '2026-11-24',
      })),
    listActiveCategories: async () => [
      {
        id: 'cat-plastic',
        code: 'PLASTIC',
        name: 'Plastic EPR',
        unit: 'MT',
        active: true,
      },
    ],
    getLastUpdatedIso: async () => '2026-11-24T10:00:00.000Z',
    isAdminUser: async () => false,
  };

  const app = createApiApp({
    getOfferStore: () => offerStore,
    getSeoStore: () => seoStore,
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

describe('ETP EPR Bazaar Seller Rate Offers, Social Sharing & SEO System', () => {
  it('validates all required seller offer fields and rejects MOQ > Available Qty or past validity dates', () => {
    const validRes = validateSellerOfferInput({
      categoryId: 'cat-plastic',
      categoryName: 'Plastic EPR',
      materialName: 'Plastic Cat II Credits',
      categoryType: 'Category II Flexible',
      availableQty: 50,
      quantityUnit: 'MT',
      sellingRatePerKg: 6.75,
      minOrderQty: 5,
      minOrderUnit: 'MT',
      state: 'Gujarat',
      city: 'Ahmedabad',
      validityDate: '2099-12-31',
      remarks: 'Immediate transfer available',
    });
    assert.equal(validRes.valid, true);
    assert.deepEqual(validRes.errors, {});

    const invalidRes = validateSellerOfferInput({
      categoryId: '',
      categoryName: '',
      materialName: 'A',
      categoryType: '',
      availableQty: 1000,
      quantityUnit: 'KG',
      sellingRatePerKg: 0,
      minOrderQty: 2,
      minOrderUnit: 'MT', // 2000 KG > 1000 KG
      state: '',
      city: '',
      validityDate: '2020-01-01',
    });
    assert.equal(invalidRes.valid, false);
    assert.ok(invalidRes.errors.categoryId);
    assert.ok(invalidRes.errors.materialName);
    assert.ok(invalidRes.errors.categoryType);
    assert.ok(invalidRes.errors.sellingRatePerKg);
    assert.ok(invalidRes.errors.minOrderQty);
    assert.ok(invalidRes.errors.state);
    assert.ok(invalidRes.errors.city);
    assert.ok(invalidRes.errors.validityDate);
  });

  it('automatically treats expired active offers as Expired and hides them from public listings', () => {
    assert.equal(isOfferExpired('2020-01-01'), true);
    assert.equal(isOfferExpired('2099-12-31'), false);

    assert.equal(getEffectiveOfferStatus(SAMPLE_ACTIVE_OFFER), 'Active');
    assert.equal(getEffectiveOfferStatus(SAMPLE_EXPIRED_OFFER), 'Expired');
    assert.equal(getEffectiveOfferStatus(SAMPLE_DEACTIVATED_OFFER), 'Deactivated');

    assert.equal(isOfferPubliclyVisible(SAMPLE_ACTIVE_OFFER), true);
    assert.equal(isOfferPubliclyVisible(SAMPLE_EXPIRED_OFFER), false);
    assert.equal(isOfferPubliclyVisible(SAMPLE_DEACTIVATED_OFFER), false);
  });

  it('filters public offers by category, material, state, price range, available qty, and search', () => {
    const secondActive: SellerOfferBase = {
      ...SAMPLE_ACTIVE_OFFER,
      id: 'OFF-BATTERY-KA-261125-BATT1',
      categoryId: 'cat-battery',
      categoryName: 'Battery EPR',
      materialName: 'Lithium-Ion Battery EPR Credits',
      categoryType: 'EV Battery',
      availableQty: 5000,
      quantityUnit: 'KG',
      sellingRatePerKg: 18.5,
      minOrderQty: 500,
      minOrderUnit: 'KG',
      state: 'Karnataka',
      city: 'Bengaluru',
    };

    const all = [SAMPLE_ACTIVE_OFFER, secondActive, SAMPLE_EXPIRED_OFFER, SAMPLE_DEACTIVATED_OFFER];

    const defaultVisible = filterPublicSellerOffers(all, {});
    assert.equal(defaultVisible.length, 2);

    const byState = filterPublicSellerOffers(all, { state: 'Gujarat' });
    assert.equal(byState.length, 1);
    assert.equal(byState[0].id, SAMPLE_ACTIVE_OFFER.id);

    const byPriceRange = filterPublicSellerOffers(all, { minPrice: 10, maxPrice: 20 });
    assert.equal(byPriceRange.length, 1);
    assert.equal(byPriceRange[0].id, secondActive.id);

    const byMinQtyKg = filterPublicSellerOffers(all, { minQtyKg: 50000 }); // 120 MT = 120,000 KG
    assert.equal(byMinQtyKg.length, 1);
    assert.equal(byMinQtyKg[0].id, SAMPLE_ACTIVE_OFFER.id);

    const bySearch = filterPublicSellerOffers(all, { search: 'bengaluru' });
    assert.equal(bySearch.length, 1);
    assert.equal(bySearch[0].id, secondActive.id);
  });

  it('generates unique offer URLs, social sharing links (WhatsApp, Facebook, LinkedIn, Telegram), and server-rendered OG/Twitter/JSON-LD metadata', () => {
    const generatedId = generateUniqueOfferId('Plastic EPR', 'Maharashtra');
    assert.match(generatedId, /^OFF-[A-Z0-9]+-[A-Z]+-\d{6}-[A-Z0-9]{5}$/);

    const canonicalUrl = buildOfferCanonicalUrl(SAMPLE_ACTIVE_OFFER.id);
    assert.equal(canonicalUrl, `${CANONICAL_ORIGIN}/offer/${SAMPLE_ACTIVE_OFFER.id}`);

    const ogImgUrl = buildOfferOgImageUrl(SAMPLE_ACTIVE_OFFER.id);
    assert.equal(ogImgUrl, `${CANONICAL_ORIGIN}/api/offers/${SAMPLE_ACTIVE_OFFER.id}/og-image.png`);

    const links = buildSocialShareLinks(SAMPLE_ACTIVE_OFFER);
    assert.ok(links.whatsappUrl.startsWith('https://wa.me/?text='));
    assert.ok(links.facebookUrl.startsWith('https://www.facebook.com/sharer/sharer.php?u='));
    assert.ok(links.linkedinUrl.startsWith('https://www.linkedin.com/sharing/share-offsite/?url='));
    assert.ok(links.telegramUrl.startsWith('https://t.me/share/url?url='));
    assert.ok(links.shareMessage.includes(canonicalUrl));
    assert.ok(links.shareMessage.includes('₹7.50/KG'));

    const seo = buildOfferSeoMetadata(SAMPLE_ACTIVE_OFFER, SAMPLE_ACTIVE_OFFER.id);
    assert.equal(seo.robots, 'index, follow');
    assert.equal(seo.canonicalUrl, canonicalUrl);
    assert.equal(seo.ogImage, ogImgUrl);
    assert.equal(seo.twitterCard, 'summary_large_image');
    assert.equal(seo.structuredData.length, 2);

    const baseHtml = '<!doctype html><html><head><title>Default</title></head><body><div id="root"></div></body></html>';
    const renderedHtml = injectOfferSeoIntoHtml(baseHtml, SAMPLE_ACTIVE_OFFER, SAMPLE_ACTIVE_OFFER.id);
    assert.ok(renderedHtml.includes(`property="og:image" content="${ogImgUrl}"`));
    assert.ok(renderedHtml.includes('property="og:image:width" content="1200"'));
    assert.ok(renderedHtml.includes('property="og:image:height" content="630"'));
    assert.ok(renderedHtml.includes('name="twitter:card" content="summary_large_image"'));
    assert.ok(renderedHtml.includes(`rel="canonical" href="${canonicalUrl}"`));
    assert.ok(renderedHtml.includes('application/ld+json'));
    assert.ok(renderedHtml.includes('Plastic Category II Flexible Credits'));
  });

  it('serves /api/offers, /api/offers/:id, dynamic PNG /api/offers/:id/og-image.png, and /sitemap-offers.xml while excluding expired offers', async () => {
    invalidateSeoCache();
    const srv = startOfferTestServer([
      SAMPLE_ACTIVE_OFFER,
      SAMPLE_EXPIRED_OFFER,
      SAMPLE_DEACTIVATED_OFFER,
    ]);
    const baseUrl = await srv.listen();

    try {
      // 1. Public list returns ONLY active & non-expired offers
      const listRes = await fetch(`${baseUrl}/api/offers`);
      assert.equal(listRes.status, 200);
      const listJson = (await listRes.json()) as { ok: boolean; offers: SellerOfferBase[] };
      assert.equal(listJson.ok, true);
      assert.equal(listJson.offers.length, 1);
      assert.equal(listJson.offers[0].id, SAMPLE_ACTIVE_OFFER.id);

      // 2. Single active offer returns 200
      const activeRes = await fetch(`${baseUrl}/api/offers/${SAMPLE_ACTIVE_OFFER.id}`);
      assert.equal(activeRes.status, 200);
      const activeJson = (await activeRes.json()) as { ok: boolean; offer: SellerOfferBase };
      assert.equal(activeJson.ok, true);
      assert.equal(activeJson.offer.materialName, SAMPLE_ACTIVE_OFFER.materialName);

      // 3. Expired offer returns 404 on public endpoint
      const expiredRes = await fetch(`${baseUrl}/api/offers/${SAMPLE_EXPIRED_OFFER.id}`);
      assert.equal(expiredRes.status, 404);

      // 4. Dynamic OG image endpoint returns real PNG bytes
      const pngRes = await fetch(`${baseUrl}/api/offers/${SAMPLE_ACTIVE_OFFER.id}/og-image.png`);
      assert.equal(pngRes.status, 200);
      assert.ok((pngRes.headers.get('content-type') || '').includes('image/png'));
      const pngBuf = Buffer.from(await pngRes.arrayBuffer());
      assert.ok(pngBuf.length > 5000, `Expected PNG > 5KB, got ${pngBuf.length} bytes`);
      assert.equal(pngBuf[0], 0x89);
      assert.equal(pngBuf[1], 0x50); // P
      assert.equal(pngBuf[2], 0x4e); // N
      assert.equal(pngBuf[3], 0x47); // G

      // 5. Offers XML sitemap includes active offer URL and excludes expired/deactivated offers
      const offersSitemapRes = await fetch(`${baseUrl}/sitemap-offers.xml`);
      assert.equal(offersSitemapRes.status, 200);
      const offersSitemapXml = await offersSitemapRes.text();
      assert.ok(offersSitemapXml.includes(`${CANONICAL_ORIGIN}/offer/${SAMPLE_ACTIVE_OFFER.id}`));
      assert.ok(!offersSitemapXml.includes(SAMPLE_EXPIRED_OFFER.id));
      assert.ok(!offersSitemapXml.includes(SAMPLE_DEACTIVATED_OFFER.id));

      // 6. Main sitemap index links /sitemap-offers.xml
      const indexRes = await fetch(`${baseUrl}/sitemap.xml`);
      assert.equal(indexRes.status, 200);
      const indexXml = await indexRes.text();
      assert.ok(indexXml.includes(`${CANONICAL_ORIGIN}/sitemap-offers.xml`));
    } finally {
      await srv.close();
    }
  });
});
