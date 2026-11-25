import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetchJson } from './apiClient';
import { createNotificationIfUnique, writeAuditLog } from './firestoreService';
import {
  formatOfferQuantity,
  formatOfferRatePerKg,
  generateUniqueOfferId,
  SellerOfferBase,
  SellerOfferFormInput,
  SellerOfferStatus,
  validateSellerOfferInput,
} from '../../shared/sellerOffers';
import {
  BuyerAccount,
  FirestoreTime,
  OfferEnquiryRecord,
  SellerAccount,
  SellerOfferRecord,
} from '../types';

function makeEnquiryId(): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `ENQ-${Date.now().toString().slice(-6)}-${rand}`;
}

export function timestampToMillis(val: FirestoreTime): number {
  if (!val) return 0;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof (val as Timestamp).toMillis === 'function') {
    return (val as Timestamp).toMillis();
  }
  if (typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate().getTime();
  }
  return 0;
}

export function timestampToIso(val: FirestoreTime): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  return undefined;
}

export function sortOffersNewestFirst<T extends { createdAt?: FirestoreTime; updatedAt?: FirestoreTime }>(
  list: T[]
): T[] {
  return [...list].sort((a, b) => {
    const aMs = timestampToMillis(a.createdAt) || timestampToMillis(a.updatedAt);
    const bMs = timestampToMillis(b.createdAt) || timestampToMillis(b.updatedAt);
    return bMs - aMs;
  });
}

export function sortEnquiriesNewestFirst<T extends { createdAt?: FirestoreTime }>(list: T[]): T[] {
  return [...list].sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
}

export function toSellerOfferBase(offer: SellerOfferRecord): SellerOfferBase {
  return {
    id: offer.id,
    sellerUid: offer.sellerUid,
    sellerCompanyId: offer.sellerCompanyId,
    sellerCompanyName: offer.sellerCompanyName,
    sellerVerification: offer.sellerVerification,
    categoryId: offer.categoryId,
    categoryName: offer.categoryName,
    materialName: offer.materialName,
    categoryType: offer.categoryType,
    availableQty: offer.availableQty,
    quantityUnit: offer.quantityUnit,
    sellingRatePerKg: offer.sellingRatePerKg,
    minOrderQty: offer.minOrderQty,
    minOrderUnit: offer.minOrderUnit,
    state: offer.state,
    city: offer.city,
    validityDate: offer.validityDate,
    remarks: offer.remarks || '',
    status: offer.status,
    createdAtIso: timestampToIso(offer.createdAt),
    updatedAtIso: timestampToIso(offer.updatedAt),
  };
}

export async function createSellerOfferDoc(params: {
  sellerUid: string;
  sellerEmail: string;
  sellerAccount: SellerAccount | null;
  input: SellerOfferFormInput;
  asDraft?: boolean;
}): Promise<{ id: string; status: SellerOfferStatus }> {
  const validation = validateSellerOfferInput(params.input, {
    allowPastDateForDraft: Boolean(params.asDraft),
  });
  if (!validation.valid) {
    const firstMsg = Object.values(validation.errors)[0] || 'Please check all required offer fields.';
    throw new Error(firstMsg);
  }

  const isVerifiedSeller = params.sellerAccount?.verification === 'Verified';
  const status: SellerOfferStatus = params.asDraft
    ? 'Draft'
    : isVerifiedSeller
      ? 'Active'
      : 'Pending Approval';

  const id = generateUniqueOfferId(params.input.categoryName, params.input.state);
  const sellerCompanyId = (params.sellerAccount?.companyId || `CMP-${params.sellerUid.slice(0, 16)}`).slice(0, 80);
  const sellerCompanyName = (params.sellerAccount?.companyName || 'Registered EPR Seller').trim().slice(0, 180);
  const sellerVerification = params.sellerAccount?.verification || 'Pending Review';

  const payload = {
    id,
    sellerUid: params.sellerUid,
    sellerCompanyId,
    sellerCompanyName,
    sellerVerification,
    categoryId: params.input.categoryId.trim().slice(0, 80),
    categoryName: params.input.categoryName.trim().slice(0, 100),
    materialName: params.input.materialName.trim().slice(0, 120),
    categoryType: params.input.categoryType.trim().slice(0, 100),
    availableQty: Number(params.input.availableQty),
    quantityUnit: params.input.quantityUnit,
    sellingRatePerKg: Number(Number(params.input.sellingRatePerKg).toFixed(2)),
    minOrderQty: Number(params.input.minOrderQty),
    minOrderUnit: params.input.minOrderUnit,
    state: params.input.state.trim().slice(0, 80),
    city: params.input.city.trim().slice(0, 80),
    validityDate: params.input.validityDate.trim(),
    remarks: (params.input.remarks || '').trim().slice(0, 1000),
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'seller_offers', id), payload);
    await writeAuditLog(
      params.sellerUid,
      params.sellerEmail,
      'Seller',
      params.asDraft
        ? 'Saved Selling Offer Draft'
        : status === 'Active'
          ? 'Published Live Selling Offer'
          : 'Submitted Selling Offer for Approval',
      id,
      `${payload.materialName} (${payload.categoryName}) · ${formatOfferRatePerKg(payload.sellingRatePerKg)} · ${formatOfferQuantity(payload.availableQty, payload.quantityUnit)} · ${payload.city}, ${payload.state}`
    );
    return { id, status };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `seller_offers/${id}`);
  }
}

export async function updateSellerOfferDoc(params: {
  offerId: string;
  sellerUid: string;
  sellerEmail: string;
  sellerAccount: SellerAccount | null;
  input: SellerOfferFormInput;
  targetStatus: SellerOfferStatus;
}): Promise<void> {
  const isDraft = params.targetStatus === 'Draft';
  const validation = validateSellerOfferInput(params.input, {
    allowPastDateForDraft: isDraft,
  });
  if (!validation.valid) {
    const firstMsg = Object.values(validation.errors)[0] || 'Please verify all required offer fields.';
    throw new Error(firstMsg);
  }

  const isVerifiedSeller = params.sellerAccount?.verification === 'Verified';
  const safeStatus: SellerOfferStatus =
    params.targetStatus === 'Active' && !isVerifiedSeller ? 'Pending Approval' : params.targetStatus;

  const updates = {
    categoryId: params.input.categoryId.trim().slice(0, 80),
    categoryName: params.input.categoryName.trim().slice(0, 100),
    materialName: params.input.materialName.trim().slice(0, 120),
    categoryType: params.input.categoryType.trim().slice(0, 100),
    availableQty: Number(params.input.availableQty),
    quantityUnit: params.input.quantityUnit,
    sellingRatePerKg: Number(Number(params.input.sellingRatePerKg).toFixed(2)),
    minOrderQty: Number(params.input.minOrderQty),
    minOrderUnit: params.input.minOrderUnit,
    state: params.input.state.trim().slice(0, 80),
    city: params.input.city.trim().slice(0, 80),
    validityDate: params.input.validityDate.trim(),
    remarks: (params.input.remarks || '').trim().slice(0, 1000),
    status: safeStatus,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'seller_offers', params.offerId), updates);
    await writeAuditLog(
      params.sellerUid,
      params.sellerEmail,
      'Seller',
      'Updated Selling Offer',
      params.offerId,
      `${updates.materialName} · ${formatOfferRatePerKg(updates.sellingRatePerKg)} · Status: ${safeStatus}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `seller_offers/${params.offerId}`);
  }
}

export async function setSellerOfferStatusDoc(params: {
  offer: SellerOfferRecord;
  nextStatus: SellerOfferStatus;
  actorUid: string;
  actorEmail: string;
  actorRole: 'Seller' | 'Admin' | 'Facilitator';
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'seller_offers', params.offer.id), {
      status: params.nextStatus,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog(
      params.actorUid,
      params.actorEmail,
      params.actorRole,
      `Selling Offer ${params.nextStatus}`,
      params.offer.id,
      `${params.offer.materialName} (${params.offer.categoryName}) changed from ${params.offer.status} to ${params.nextStatus}`
    );

    if (params.actorRole === 'Admin' && (params.nextStatus === 'Active' || params.nextStatus === 'Rejected')) {
      await createNotificationIfUnique(
        params.offer.sellerUid,
        'seller',
        'Offers',
        params.nextStatus === 'Active'
          ? `Selling Offer Approved & Live (${params.offer.id})`
          : `Selling Offer Rejected (${params.offer.id})`,
        params.nextStatus === 'Active'
          ? `Your selling offer for ${params.offer.materialName} at ${formatOfferRatePerKg(params.offer.sellingRatePerKg)} is now live on the EPR Bazaar homepage and ready to share.`
          : `Your selling offer ${params.offer.id} (${params.offer.materialName}) was not approved. Please review details and resubmit.`,
        `offer_admin_${params.offer.id}_${params.nextStatus}_${Date.now()}`
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `seller_offers/${params.offer.id}`);
  }
}

export async function fetchSingleSellerOfferDoc(offerId: string): Promise<SellerOfferRecord | null> {
  const cleanId = offerId.trim();
  if (!cleanId) return null;
  try {
    const snap = await getDoc(doc(db, 'seller_offers', cleanId));
    if (snap.exists()) {
      return snap.data() as SellerOfferRecord;
    }
  } catch {
    // Fallback to public API route if direct Firestore read is blocked or unavailable
  }

  try {
    const apiRes = await apiFetchJson<{ ok: boolean; offer?: SellerOfferBase; error?: string }>(
      `/api/offers/${encodeURIComponent(cleanId)}`
    );
    if (apiRes.ok && apiRes.data?.offer) {
      const o = apiRes.data.offer;
      return {
        ...o,
        createdAt: o.createdAtIso,
        updatedAt: o.updatedAtIso,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function createOfferEnquiryDoc(params: {
  offer: SellerOfferRecord;
  buyerUid: string;
  buyerEmail: string;
  buyerAccount: BuyerAccount | null;
  requestedQty: number;
  requestedUnit: 'KG' | 'MT';
  proposedRatePerKg: number;
  message: string;
}): Promise<string> {
  if (!Number.isFinite(params.requestedQty) || params.requestedQty <= 0) {
    throw new Error('Please enter a valid required quantity greater than 0.');
  }
  if (!Number.isFinite(params.proposedRatePerKg) || params.proposedRatePerKg <= 0) {
    throw new Error('Please enter a valid proposed rate (₹/KG) greater than 0.');
  }
  const cleanMsg = params.message.trim();
  if (cleanMsg.length < 5 || cleanMsg.length > 1500) {
    throw new Error('Please enter an enquiry message between 5 and 1500 characters.');
  }

  const enquiryId = makeEnquiryId();
  const buyerCompanyName = (params.buyerAccount?.companyName || 'Registered EPR Buyer').trim().slice(0, 180);
  const buyerContactPerson = (params.buyerAccount?.contactPerson || 'Buyer Representative').trim().slice(0, 120);
  const buyerCity = (params.buyerAccount?.city || 'India').trim().slice(0, 80);
  const buyerState = (params.buyerAccount?.state || 'India').trim().slice(0, 80);

  const payload = {
    id: enquiryId,
    offerId: params.offer.id,
    sellerUid: params.offer.sellerUid,
    buyerUid: params.buyerUid,
    buyerCompanyName,
    buyerContactPerson,
    buyerCity,
    buyerState,
    offerMaterialName: params.offer.materialName.slice(0, 120),
    offerCategoryName: params.offer.categoryName.slice(0, 100),
    requestedQty: Number(params.requestedQty),
    requestedUnit: params.requestedUnit,
    proposedRatePerKg: Number(Number(params.proposedRatePerKg).toFixed(2)),
    message: cleanMsg,
    status: 'New' as const,
    sellerResponseNote: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'offer_enquiries', enquiryId), payload);

    await createNotificationIfUnique(
      params.offer.sellerUid,
      'seller',
      'Offers',
      `New Buyer Enquiry on Offer ${params.offer.id}`,
      `${buyerCompanyName} (${buyerCity}, ${buyerState}) enquired for ${formatOfferQuantity(payload.requestedQty, payload.requestedUnit)} of ${params.offer.materialName} at ${formatOfferRatePerKg(payload.proposedRatePerKg)}. Open My Selling Offers > Buyer Enquiries to respond.`,
      `offer_enq_${enquiryId}`
    );

    await writeAuditLog(
      params.buyerUid,
      params.buyerEmail,
      'Buyer',
      'Submitted Offer Enquiry',
      params.offer.id,
      `Enquiry ${enquiryId} for ${formatOfferQuantity(payload.requestedQty, payload.requestedUnit)} ${params.offer.materialName} @ ${formatOfferRatePerKg(payload.proposedRatePerKg)}`
    );

    return enquiryId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `offer_enquiries/${enquiryId}`);
  }
}

export async function updateOfferEnquiryStatusDoc(params: {
  enquiry: OfferEnquiryRecord;
  status: OfferEnquiryRecord['status'];
  sellerResponseNote?: string;
  actorUid: string;
  actorEmail: string;
  actorRole: 'Seller' | 'Admin' | 'Facilitator';
}): Promise<void> {
  const note = (params.sellerResponseNote ?? params.enquiry.sellerResponseNote ?? '').trim().slice(0, 1000);
  try {
    await updateDoc(doc(db, 'offer_enquiries', params.enquiry.id), {
      status: params.status,
      sellerResponseNote: note,
      updatedAt: serverTimestamp(),
    });

    if (params.status === 'Responded') {
      await createNotificationIfUnique(
        params.enquiry.buyerUid,
        'buyer',
        'Offers',
        `Seller Responded to Your Enquiry (${params.enquiry.offerId})`,
        note
          ? `Update on ${params.enquiry.offerMaterialName}: ${note}`
          : `The seller has reviewed and responded to your enquiry ${params.enquiry.id} for ${params.enquiry.offerMaterialName}.`,
        `offer_enq_resp_${params.enquiry.id}_${Date.now()}`
      );
    }

    await writeAuditLog(
      params.actorUid,
      params.actorEmail,
      params.actorRole,
      `Offer Enquiry ${params.status}`,
      params.enquiry.id,
      `Offer ${params.enquiry.offerId} enquiry marked ${params.status}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `offer_enquiries/${params.enquiry.id}`);
  }
}
