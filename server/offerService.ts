import fs from 'node:fs';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb, getFirebaseAdminState } from './firebaseAdmin.ts';
import { isOfferPubliclyVisible, OFFER_ID_REGEX } from '../shared/sellerOffers.ts';
import type { SellerOfferBase } from '../shared/sellerOffers.ts';

export interface OfferReadStore {
  getOfferById: (offerId: string) => Promise<SellerOfferBase | null>;
  listPublicActiveOffers: () => Promise<SellerOfferBase[]>;
}

function loadAppletConfig(): { projectId: string; firestoreDatabaseId: string } {
  const raw = fs.readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8');
  return JSON.parse(raw) as { projectId: string; firestoreDatabaseId: string };
}

function tsToIso(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

function parseRestValue(field: Record<string, unknown> | undefined): unknown {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return Number(field.doubleValue);
  if ('timestampValue' in field) return field.timestampValue;
  return undefined;
}

function parseRestFields(fields: Record<string, Record<string, unknown>> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields) return out;
  for (const [k, v] of Object.entries(fields)) {
    out[k] = parseRestValue(v);
  }
  return out;
}

export function mapRawSellerOffer(docId: string, data: Record<string, unknown>): SellerOfferBase {
  const quantityUnit = data.quantityUnit === 'MT' ? 'MT' : 'KG';
  const minOrderUnit = data.minOrderUnit === 'MT' ? 'MT' : 'KG';
  const sellerVerification =
    data.sellerVerification === 'Verified' || data.sellerVerification === 'Action Required'
      ? data.sellerVerification
      : 'Pending Review';
  const status =
    data.status === 'Draft' ||
    data.status === 'Pending Approval' ||
    data.status === 'Active' ||
    data.status === 'Deactivated' ||
    data.status === 'Rejected'
      ? data.status
      : 'Draft';

  return {
    id: String(data.id || docId),
    sellerUid: String(data.sellerUid || ''),
    sellerCompanyId: String(data.sellerCompanyId || ''),
    sellerCompanyName: String(data.sellerCompanyName || 'Verified EPR Seller'),
    sellerVerification,
    categoryId: String(data.categoryId || ''),
    categoryName: String(data.categoryName || 'EPR Credit'),
    materialName: String(data.materialName || data.categoryName || 'EPR Credit Offer'),
    categoryType: String(data.categoryType || 'Standard'),
    availableQty: Number(data.availableQty || 0),
    quantityUnit,
    sellingRatePerKg: Number(data.sellingRatePerKg || 0),
    minOrderQty: Number(data.minOrderQty || 0),
    minOrderUnit,
    state: String(data.state || ''),
    city: String(data.city || ''),
    validityDate: String(data.validityDate || ''),
    remarks: typeof data.remarks === 'string' ? data.remarks : '',
    status,
    createdAtIso: tsToIso(data.createdAt),
    updatedAtIso: tsToIso(data.updatedAt) || tsToIso(data.createdAt),
  };
}

export function createFirestoreOfferReadStore(db: Firestore): OfferReadStore {
  return {
    getOfferById: async (offerId: string) => {
      if (!OFFER_ID_REGEX.test(offerId)) return null;
      const snap = await db.collection('seller_offers').doc(offerId).get();
      if (!snap.exists) return null;
      return mapRawSellerOffer(snap.id, snap.data() as Record<string, unknown>);
    },
    listPublicActiveOffers: async () => {
      const snap = await db.collection('seller_offers').where('status', '==', 'Active').limit(500).get();
      const now = new Date();
      return snap.docs
        .map((d) => mapRawSellerOffer(d.id, d.data() as Record<string, unknown>))
        .filter((o) => isOfferPubliclyVisible(o, now))
        .sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || ''));
    },
  };
}

async function fetchOfferByIdRest(offerId: string): Promise<SellerOfferBase | null> {
  if (!OFFER_ID_REGEX.test(offerId)) return null;
  const cfg = loadAppletConfig();
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(cfg.firestoreDatabaseId)}/documents/seller_offers/${encodeURIComponent(offerId)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      name?: string;
      fields?: Record<string, Record<string, unknown>>;
    };
    if (!payload.fields) return null;
    return mapRawSellerOffer(offerId, parseRestFields(payload.fields));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function listPublicActiveOffersRest(): Promise<SellerOfferBase[]> {
  const cfg = loadAppletConfig();
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(cfg.firestoreDatabaseId)}/documents:runQuery`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'seller_offers' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'EQUAL',
              value: { stringValue: 'Active' },
            },
          },
          limit: 500,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      document?: { name: string; fields?: Record<string, Record<string, unknown>> };
    }>;
    const now = new Date();
    return rows
      .filter((r) => Boolean(r.document?.fields))
      .map((r) => {
        const docId = (r.document!.name || '').split('/').pop() || '';
        return mapRawSellerOffer(docId, parseRestFields(r.document!.fields));
      })
      .filter((o) => isOfferPubliclyVisible(o, now))
      .sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || ''));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function loadOfferByIdForServer(
  offerId: string,
  customStore?: OfferReadStore
): Promise<SellerOfferBase | null> {
  if (!OFFER_ID_REGEX.test(offerId)) return null;
  if (customStore) {
    return customStore.getOfferById(offerId);
  }
  const adminState = getFirebaseAdminState();
  if (adminState.initialized) {
    try {
      const store = createFirestoreOfferReadStore(getAdminDb());
      return await store.getOfferById(offerId);
    } catch {
      // Fallback to public Firestore REST API
    }
  }
  return fetchOfferByIdRest(offerId);
}

export async function listPublicActiveOffersForServer(
  customStore?: OfferReadStore
): Promise<SellerOfferBase[]> {
  if (customStore) {
    return customStore.listPublicActiveOffers();
  }
  const adminState = getFirebaseAdminState();
  if (adminState.initialized) {
    try {
      const store = createFirestoreOfferReadStore(getAdminDb());
      return await store.listPublicActiveOffers();
    } catch {
      // Fallback to public Firestore REST API
    }
  }
  return listPublicActiveOffersRest();
}
