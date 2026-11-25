import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  MessageSquare,
  Power,
  RotateCcw,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { useMarketplace } from '../../context/MarketplaceContext';
import {
  Button,
  ConfirmModal,
  EmptyState,
  MetricCard,
  Modal,
  StatusBadge,
} from '../ui/DesignSystem';
import { ShareOfferModal } from '../public/ShareOfferModal';
import { toSellerOfferBase } from '../../services/sellerOfferService';
import {
  buildOfferCanonicalUrl,
  formatOfferQuantity,
  formatOfferRatePerKg,
  formatValidityDateDisplay,
  getEffectiveOfferStatus,
  getTodayIstDateString,
  INDIAN_STATES,
  isOfferExpired,
  isOfferPubliclyVisible,
  SellerOfferBase,
  SellerOfferFormInput,
  SellerOfferUnit,
  validateSellerOfferInput,
} from '../../../shared/sellerOffers';
import { formatTime, OfferEnquiryRecord, SellerOfferRecord } from '../../types';

type ManageSubTab = 'active' | 'pending' | 'drafts' | 'expired' | 'deactivated' | 'enquiries';

interface SellerOffersSectionProps {
  mode: 'submit' | 'manage';
  onSwitchToManage: () => void;
  onSwitchToSubmit: () => void;
}

function defaultValidityDatePlus30(): string {
  const dt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const istMs = dt.getTime() + 330 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

export const SellerOffersSection: React.FC<SellerOffersSectionProps> = ({
  mode,
  onSwitchToManage,
  onSwitchToSubmit,
}) => {
  const {
    currentSeller,
    categories,
    subcategories,
    sellerOffers,
    offerEnquiries,
    submitSellerRateOffer,
    editSellerRateOffer,
    updateSellerRateOfferStatus,
    updateOfferEnquiryStatus,
    navigateToOffer,
    addToast,
  } = useMarketplace();

  const activeCategories = useMemo(() => categories.filter((c) => c.active), [categories]);
  const todayIst = getTodayIstDateString();

  // --- Submit Form State (Phase 1) ---
  const [categoryId, setCategoryId] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [categoryType, setCategoryType] = useState('');
  const [availableQty, setAvailableQty] = useState('');
  const [quantityUnit, setQuantityUnit] = useState<SellerOfferUnit>('MT');
  const [sellingRatePerKg, setSellingRatePerKg] = useState('');
  const [minOrderQty, setMinOrderQty] = useState('');
  const [minOrderUnit, setMinOrderUnit] = useState<SellerOfferUnit>('MT');
  const [stateVal, setStateVal] = useState(currentSeller?.state || '');
  const [cityVal, setCityVal] = useState(currentSeller?.city || '');
  const [validityDate, setValidityDate] = useState(defaultValidityDatePlus30);
  const [remarks, setRemarks] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [createdOfferResult, setCreatedOfferResult] = useState<{
    id: string;
    status: SellerOfferRecord['status'];
  } | null>(null);

  // --- Manage State (Phase 6) ---
  const [manageTab, setManageTab] = useState<ManageSubTab>('active');
  const [shareOffer, setShareOffer] = useState<SellerOfferBase | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<SellerOfferRecord | null>(null);
  const [editingOffer, setEditingOffer] = useState<SellerOfferRecord | null>(null);
  const [editInput, setEditInput] = useState<SellerOfferFormInput | null>(null);
  const [editTargetStatus, setEditTargetStatus] = useState<SellerOfferRecord['status']>('Active');
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [respondingEnquiry, setRespondingEnquiry] = useState<OfferEnquiryRecord | null>(null);
  const [responseStatus, setResponseStatus] = useState<OfferEnquiryRecord['status']>('Responded');
  const [responseNote, setResponseNote] = useState('');
  const [savingResponse, setSavingResponse] = useState(false);

  const selectedCategory = activeCategories.find((c) => c.id === categoryId) || activeCategories[0];
  const selectedCategorySubs = useMemo(
    () => subcategories.filter((s) => s.categoryId === selectedCategory?.id && s.active),
    [subcategories, selectedCategory]
  );

  useEffect(() => {
    if (activeCategories.length > 0 && !categoryId) {
      const first = activeCategories[0];
      setCategoryId(first.id);
      const firstSubs = subcategories.filter((s) => s.categoryId === first.id && s.active);
      setCategoryType(firstSubs[0]?.name || 'Standard EPR Credit');
      setMaterialName(`${first.name} Credits`);
    }
  }, [activeCategories, subcategories, categoryId]);

  useEffect(() => {
    if (currentSeller) {
      setStateVal((prev) => prev || currentSeller.state || '');
      setCityVal((prev) => prev || currentSeller.city || '');
    }
  }, [currentSeller]);

  const handleCategoryChange = (nextId: string) => {
    setCategoryId(nextId);
    const cat = activeCategories.find((c) => c.id === nextId);
    if (cat) {
      const subs = subcategories.filter((s) => s.categoryId === cat.id && s.active);
      const nextSub = subs[0]?.name || 'Standard EPR Credit';
      setCategoryType(nextSub);
      if (!materialName.trim() || activeCategories.some((c) => `${c.name} Credits` === materialName.trim())) {
        setMaterialName(`${cat.name} Credits`);
      }
    }
  };

  const handleSubmitOffer = async (asDraft: boolean) => {
    const cat = selectedCategory;
    const input: SellerOfferFormInput = {
      categoryId: cat?.id || categoryId,
      categoryName: cat?.name || '',
      materialName: materialName.trim(),
      categoryType: categoryType.trim(),
      availableQty: Number(availableQty),
      quantityUnit,
      sellingRatePerKg: Number(sellingRatePerKg),
      minOrderQty: Number(minOrderQty),
      minOrderUnit,
      state: stateVal.trim(),
      city: cityVal.trim(),
      validityDate: validityDate.trim(),
      remarks: remarks.trim(),
    };

    const validation = validateSellerOfferInput(input, { allowPastDateForDraft: asDraft });
    setFieldErrors(validation.errors);
    if (!validation.valid) {
      addToast({
        type: 'error',
        title: 'Please complete all required fields',
        description: Object.values(validation.errors)[0],
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitSellerRateOffer(input, asDraft);
      setCreatedOfferResult(res);
      setAvailableQty('');
      setSellingRatePerKg('');
      setMinOrderQty('');
      setRemarks('');
      setValidityDate(defaultValidityDatePlus30());
      setFieldErrors({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to submit selling offer.';
      addToast({ type: 'error', title: 'Offer submission failed', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  // Partition seller's offers into management buckets
  const buckets = useMemo(() => {
    const active: SellerOfferRecord[] = [];
    const pending: SellerOfferRecord[] = [];
    const drafts: SellerOfferRecord[] = [];
    const expired: SellerOfferRecord[] = [];
    const deactivated: SellerOfferRecord[] = [];

    for (const offer of sellerOffers) {
      const eff = getEffectiveOfferStatus(offer);
      if (eff === 'Active') active.push(offer);
      else if (eff === 'Pending Approval') pending.push(offer);
      else if (eff === 'Draft') drafts.push(offer);
      else if (eff === 'Expired') expired.push(offer);
      else deactivated.push(offer); // Deactivated / Rejected
    }

    return { active, pending, drafts, expired, deactivated };
  }, [sellerOffers]);

  const newEnquiriesCount = offerEnquiries.filter((e) => e.status === 'New').length;

  const openEditModal = (offer: SellerOfferRecord) => {
    setEditingOffer(offer);
    setEditInput({
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
      validityDate: isOfferExpired(offer.validityDate) ? defaultValidityDatePlus30() : offer.validityDate,
      remarks: offer.remarks || '',
    });
    const isVerified = currentSeller?.verification === 'Verified';
    setEditTargetStatus(
      offer.status === 'Draft'
        ? 'Draft'
        : isVerified
          ? 'Active'
          : 'Pending Approval'
    );
    setEditErrors({});
  };

  const handleSaveEdit = async (publishNow: boolean) => {
    if (!editingOffer || !editInput) return;
    const isVerified = currentSeller?.verification === 'Verified';
    const nextStatus: SellerOfferRecord['status'] = publishNow
      ? isVerified
        ? 'Active'
        : 'Pending Approval'
      : editTargetStatus;

    const validation = validateSellerOfferInput(editInput, {
      allowPastDateForDraft: nextStatus === 'Draft',
    });
    setEditErrors(validation.errors);
    if (!validation.valid) return;

    setSavingEdit(true);
    try {
      await editSellerRateOffer(editingOffer.id, editInput, nextStatus);
      setEditingOffer(null);
      setEditInput(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save offer changes.';
      addToast({ type: 'error', title: 'Update failed', description: msg });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget) return;
    const target = deactivateTarget;
    setDeactivateTarget(null);
    await updateSellerRateOfferStatus(target, 'Deactivated');
  };

  const handleReactivateOffer = async (offer: SellerOfferRecord) => {
    if (isOfferExpired(offer.validityDate)) {
      addToast({
        type: 'info',
        title: 'Update validity date to republish',
        description: 'This offer has passed its validity date. Please set a new validity date below.',
      });
      openEditModal(offer);
      return;
    }
    const nextStatus: SellerOfferRecord['status'] =
      currentSeller?.verification === 'Verified' ? 'Active' : 'Pending Approval';
    await updateSellerRateOfferStatus(offer, nextStatus);
  };

  const handleSaveEnquiryResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respondingEnquiry) return;
    setSavingResponse(true);
    try {
      await updateOfferEnquiryStatus(respondingEnquiry, responseStatus, responseNote);
      setRespondingEnquiry(null);
      setResponseNote('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update enquiry.';
      addToast({ type: 'error', title: 'Update failed', description: msg });
    } finally {
      setSavingResponse(false);
    }
  };

  const copyOfferLinkQuick = async (offerId: string) => {
    const url = buildOfferCanonicalUrl(offerId);
    try {
      await navigator.clipboard.writeText(url);
      addToast({ type: 'success', title: 'Offer link copied', description: url });
    } catch {
      addToast({ type: 'info', title: 'Offer URL', description: url });
    }
  };

  const createdOfferRecord = createdOfferResult
    ? sellerOffers.find((o) => o.id === createdOfferResult.id) || null
    : null;

  if (mode === 'submit') {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#16A36A]">
              Public Rate Listing &amp; Social Sharing
            </div>
            <h1 className="font-display text-2xl font-bold text-[#0A172A] mt-0.5">
              SUBMIT SELLING OFFER
            </h1>
            <p className="text-xs text-[#64748B] mt-1">
              Publish your EPR credit selling rate once. Active offers appear live on the EPR Bazaar homepage with a
              unique shareable URL for WhatsApp, Facebook, LinkedIn, and Telegram.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onSwitchToManage}>
            Manage My Selling Offers ({sellerOffers.length})
          </Button>
        </div>

        {/* Auto-Retrieved Seller Profile Bar */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-[#10233F]" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#0A172A]">
                {currentSeller?.companyName || 'Registered Seller Account'}
              </div>
              <div className="text-[11px] text-[#64748B] font-mono">
                {currentSeller
                  ? `${currentSeller.companyId} · EPR: ${currentSeller.eprRegNo} · GSTIN: ${currentSeller.gstin}`
                  : 'Seller profile loaded automatically'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck
              className={`w-4 h-4 ${
                currentSeller?.verification === 'Verified' ? 'text-[#16A36A]' : 'text-[#D97706]'
              }`}
            />
            <span className="font-medium text-[#334155]">
              {currentSeller?.verification === 'Verified'
                ? 'Verified Seller · Offers go live immediately'
                : 'Pending Verification · Submitted offers enter Admin approval queue'}
            </span>
          </div>
        </div>

        {/* Post-Submit Confirmation Card */}
        {createdOfferResult && (
          <div className="bg-[#F0FDF4] border border-[#86EFAC] rounded-lg p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[#15803D] font-semibold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                {createdOfferResult.status === 'Draft'
                  ? `Offer ${createdOfferResult.id} saved as draft`
                  : createdOfferResult.status === 'Active'
                    ? `Offer ${createdOfferResult.id} is now live on the homepage`
                    : `Offer ${createdOfferResult.id} submitted for Admin approval`}
              </div>
              <StatusBadge status={createdOfferResult.status} />
            </div>
            <div className="text-xs text-[#166534] font-mono break-all">
              Unique Offer URL: {buildOfferCanonicalUrl(createdOfferResult.id)}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigateToOffer(createdOfferResult.id)}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View Offer Page
              </Button>
              {createdOfferRecord && createdOfferResult.status === 'Active' && (
                <Button
                  variant="emerald"
                  size="sm"
                  onClick={() => setShareOffer(toSellerOfferBase(createdOfferRecord))}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share on Social Media
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyOfferLinkQuick(createdOfferResult.id)}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Offer Link
              </Button>
              <Button variant="ghost" size="sm" onClick={onSwitchToManage}>
                Go to My Selling Offers
              </Button>
            </div>
          </div>
        )}

        {/* Main 9-Field Submission Form */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 space-y-5 shadow-[0_1px_2px_0_rgba(16,35,63,0.04)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. EPR Material / Credit Category */}
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                1. EPR Material / Credit Category *
              </label>
              <select
                value={categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg bg-white"
              >
                {activeCategories.length === 0 ? (
                  <option value="">No active categories</option>
                ) : (
                  activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
              {fieldErrors.categoryId && (
                <p className="text-xs text-[#BE123C] mt-1">{fieldErrors.categoryId}</p>
              )}
            </div>

            {/* Material / Credit Name */}
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Material / Credit Name *
              </label>
              <input
                type="text"
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder="e.g. Plastic Category II Flexible Packaging Credits"
                className="w-full h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg"
              />
              {fieldErrors.materialName && (
                <p className="text-xs text-[#BE123C] mt-1">{fieldErrors.materialName}</p>
              )}
            </div>

            {/* 2. Category Type */}
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                2. Category Type *
              </label>
              {selectedCategorySubs.length > 0 ? (
                <select
                  value={categoryType}
                  onChange={(e) => setCategoryType(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                >
                  {selectedCategorySubs.map((sub) => (
                    <option key={sub.id} value={sub.name}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={categoryType}
                  onChange={(e) => setCategoryType(e.target.value)}
                  placeholder="e.g. Cat I Rigid / Cat II Flexible / Lead-Acid / End-of-Life"
                  className="w-full h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg"
                />
              )}
              {fieldErrors.categoryType && (
                <p className="text-xs text-[#BE123C] mt-1">{fieldErrors.categoryType}</p>
              )}
            </div>

            {/* 4. Selling Rate (₹ per KG) */}
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                4. Selling Rate (₹ per KG) *
              </label>
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={sellingRatePerKg}
                onChange={(e) => setSellingRatePerKg(e.target.value)}
                placeholder="e.g. 6.50"
                className="w-full h-10 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
              />
              {fieldErrors.sellingRatePerKg && (
                <p className="text-xs text-[#BE123C] mt-1">{fieldErrors.sellingRatePerKg}</p>
              )}
            </div>

            {/* 3. Available Quantity (KG / MT) */}
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                3. Available Quantity (KG / MT) *
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={availableQty}
                  onChange={(e) => setAvailableQty(e.target.value)}
                  placeholder="e.g. 250"
                  className="flex-1 h-10 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
                />
                <select
                  value={quantityUnit}
                  onChange={(e) => setQuantityUnit(e.target.value as SellerOfferUnit)}
                  aria-label="Available quantity unit"
                  className="w-24 h-10 px-3 text-sm font-semibold border border-[#CBD5E1] rounded-lg bg-white"
                >
                  <option value="MT">MT</option>
                  <option value="KG">KG</option>
                </select>
              </div>
              {fieldErrors.availableQty && (
                <p className="text-xs text-[#BE123C] mt-1">{fieldErrors.availableQty}</p>
              )}
            </div>

            {/* 5. Minimum Order Quantity */}
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                5. Minimum Order Quantity *
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={minOrderQty}
                  onChange={(e) => setMinOrderQty(e.target.value)}
                  placeholder="e.g. 25"
                  className="flex-1 h-10 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
                />
                <select
                  value={minOrderUnit}
                  onChange={(e) => setMinOrderUnit(e.target.value as SellerOfferUnit)}
                  aria-label="Minimum order quantity unit"
                  className="w-24 h-10 px-3 text-sm font-semibold border border-[#CBD5E1] rounded-lg bg-white"
                >
                  <option value="MT">MT</option>
                  <option value="KG">KG</option>
                </select>
              </div>
              {fieldErrors.minOrderQty && (
                <p className="text-xs text-[#BE123C] mt-1">{fieldErrors.minOrderQty}</p>
              )}
            </div>

            {/* 6. State */}
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                6. State *
              </label>
              <select
                value={stateVal}
                onChange={(e) => setStateVal(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg bg-white"
              >
                <option value="">Select State</option>
                {INDIAN_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              {fieldErrors.state && (
                <p className="text-xs text-[#BE123C] mt-1">{fieldErrors.state}</p>
              )}
            </div>

            {/* 7. City */}
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                7. City *
              </label>
              <input
                type="text"
                value={cityVal}
                onChange={(e) => setCityVal(e.target.value)}
                placeholder="e.g. Ahmedabad, Mumbai, Kolkata"
                className="w-full h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg"
              />
              {fieldErrors.city && (
                <p className="text-xs text-[#BE123C] mt-1">{fieldErrors.city}</p>
              )}
            </div>

            {/* 8. Offer Validity Date */}
            <div className="md:col-span-2 sm:max-w-xs">
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                8. Offer Validity Date *
              </label>
              <input
                type="date"
                min={todayIst}
                value={validityDate}
                onChange={(e) => setValidityDate(e.target.value)}
                className="w-full h-10 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
              />
              {fieldErrors.validityDate && (
                <p className="text-xs text-[#BE123C] mt-1">{fieldErrors.validityDate}</p>
              )}
            </div>
          </div>

          {/* 9. Additional Remarks */}
          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              9. Additional Remarks
            </label>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Specify financial year availability (e.g. FY 2025-26), CPCB portal transfer readiness, GST billing terms, or batch notes..."
              className="w-full p-3 text-sm border border-[#CBD5E1] rounded-lg"
            />
            {fieldErrors.remarks && (
              <p className="text-xs text-[#BE123C] mt-1">{fieldErrors.remarks}</p>
            )}
          </div>

          <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center gap-3">
            <Button
              variant="emerald"
              disabled={submitting}
              onClick={() => handleSubmitOffer(false)}
            >
              {submitting ? 'Submitting...' : 'Submit Offer'}
            </Button>
            <Button
              variant="secondary"
              disabled={submitting}
              onClick={() => handleSubmitOffer(true)}
            >
              Save as Draft
            </Button>
          </div>
        </div>

        <ShareOfferModal
          offer={shareOffer}
          onClose={() => setShareOffer(null)}
          onCopied={() => addToast({ type: 'success', title: 'Offer link copied to clipboard' })}
        />
      </div>
    );
  }

  // --- MANAGE VIEW (Phase 6) ---
  const subTabs: { id: ManageSubTab; label: string; count: number }[] = [
    { id: 'active', label: 'My Active Offers', count: buckets.active.length },
    { id: 'pending', label: 'Pending Offers', count: buckets.pending.length },
    { id: 'drafts', label: 'Drafts', count: buckets.drafts.length },
    { id: 'expired', label: 'Expired Offers', count: buckets.expired.length },
    { id: 'deactivated', label: 'Deactivated Offers', count: buckets.deactivated.length },
    { id: 'enquiries', label: 'Buyer Enquiries', count: offerEnquiries.length },
  ];

  const currentList: SellerOfferRecord[] =
    manageTab === 'active'
      ? buckets.active
      : manageTab === 'pending'
        ? buckets.pending
        : manageTab === 'drafts'
          ? buckets.drafts
          : manageTab === 'expired'
            ? buckets.expired
            : manageTab === 'deactivated'
              ? buckets.deactivated
              : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0A172A]">
            My Selling Offers &amp; Buyer Enquiries
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Track live public offers, pending approvals, expired/deactivated offers, and buyer enquiries received from
            your shared offer links.
          </p>
        </div>
        <Button variant="emerald" size="sm" onClick={onSwitchToSubmit}>
          + Submit Selling Offer
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard
          label="Active Offers"
          value={buckets.active.length}
          accent="emerald"
          onClick={() => setManageTab('active')}
        />
        <MetricCard
          label="Pending Approval"
          value={buckets.pending.length}
          accent="amber"
          onClick={() => setManageTab('pending')}
        />
        <MetricCard
          label="Expired Offers"
          value={buckets.expired.length}
          accent="slate"
          onClick={() => setManageTab('expired')}
        />
        <MetricCard
          label="Deactivated"
          value={buckets.deactivated.length}
          accent="slate"
          onClick={() => setManageTab('deactivated')}
        />
        <MetricCard
          label="Buyer Enquiries"
          value={offerEnquiries.length}
          sublabel={newEnquiriesCount > 0 ? `${newEnquiriesCount} unread` : 'All reviewed'}
          onClick={() => setManageTab('enquiries')}
        />
      </div>

      {/* Sub-tab bar */}
      <div className="border-b border-[#E2E8F0] flex items-center gap-1 overflow-x-auto">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setManageTab(t.id)}
            className={`px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
              manageTab === t.id
                ? 'border-[#10233F] text-[#0A172A]'
                : 'border-transparent text-[#64748B] hover:text-[#0A172A]'
            }`}
          >
            {t.label}{' '}
            <span className="font-mono text-[11px] opacity-80">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Enquiries Table */}
      {manageTab === 'enquiries' ? (
        offerEnquiries.length === 0 ? (
          <EmptyState
            title="No buyer enquiries received yet"
            description="Share your active selling offer URLs on WhatsApp, Facebook, LinkedIn, or Telegram to receive direct buyer enquiries here."
            actionLabel="View Active Offers"
            onAction={() => setManageTab('active')}
          />
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                    <th className="py-3 px-4">Enquiry / Offer</th>
                    <th className="py-3 px-4">Buyer Company</th>
                    <th className="py-3 px-4">Material</th>
                    <th className="py-3 px-4 text-right">Requested Qty</th>
                    <th className="py-3 px-4 text-right">Proposed Rate</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-xs">
                  {offerEnquiries.map((enq) => (
                    <tr key={enq.id} className="hover:bg-[#F8FAFC] align-top">
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-[#0A172A]">{enq.id}</div>
                        <button
                          type="button"
                          onClick={() => navigateToOffer(enq.offerId)}
                          className="font-mono text-[11px] text-[#1E3A8A] hover:underline cursor-pointer mt-0.5"
                        >
                          {enq.offerId}
                        </button>
                        <div className="text-[11px] text-[#64748B] mt-0.5">{formatTime(enq.createdAt)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#0A172A]">{enq.buyerCompanyName}</div>
                        <div className="text-[#475569]">{enq.buyerContactPerson}</div>
                        <div className="text-[11px] text-[#64748B]">
                          {enq.buyerCity}, {enq.buyerState}
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-medium text-[#0A172A]">{enq.offerMaterialName}</div>
                        <p className="text-[#475569] mt-1 line-clamp-3">{enq.message}</p>
                        {enq.sellerResponseNote && (
                          <div className="mt-1.5 text-[#15803D]">
                            <strong>Your Note:</strong> {enq.sellerResponseNote}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                        {formatOfferQuantity(enq.requestedQty, enq.requestedUnit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#15803D] tabular-nums whitespace-nowrap">
                        {formatOfferRatePerKg(enq.proposedRatePerKg)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={enq.status} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setRespondingEnquiry(enq);
                            setResponseStatus(enq.status === 'New' ? 'Responded' : enq.status);
                            setResponseNote(enq.sellerResponseNote || '');
                          }}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Update
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : currentList.length === 0 ? (
        <EmptyState
          title={`No offers in ${subTabs.find((t) => t.id === manageTab)?.label || 'this category'}`}
          description="Submit a new selling offer or edit an existing draft to publish live EPR rates."
          actionLabel="Submit Selling Offer"
          onAction={onSwitchToSubmit}
        />
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  <th className="py-3 px-4">Offer ID</th>
                  <th className="py-3 px-4">Material &amp; Category</th>
                  <th className="py-3 px-4 text-right">Rate (₹/KG)</th>
                  <th className="py-3 px-4 text-right">Available / MOQ</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Valid Till</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-xs">
                {currentList.map((offer) => {
                  const effStatus = getEffectiveOfferStatus(offer);
                  const isLive = isOfferPubliclyVisible(offer);
                  return (
                    <tr key={offer.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-3 px-4 font-mono font-semibold text-[#10233F] whitespace-nowrap">
                        {offer.id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#0A172A]">{offer.materialName}</div>
                        <div className="text-[11px] text-[#64748B]">
                          {offer.categoryName} · {offer.categoryType}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#15803D] tabular-nums whitespace-nowrap">
                        {formatOfferRatePerKg(offer.sellingRatePerKg)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-[#0A172A]">
                          {formatOfferQuantity(offer.availableQty, offer.quantityUnit)}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          MOQ: {formatOfferQuantity(offer.minOrderQty, offer.minOrderUnit)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#334155] whitespace-nowrap">
                        {offer.city}, {offer.state}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#334155] tabular-nums whitespace-nowrap">
                        {formatValidityDateDisplay(offer.validityDate)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={effStatus} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigateToOffer(offer.id)}
                            title="Open Public Offer Page"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                          {isLive && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setShareOffer(toSellerOfferBase(offer))}
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              Share
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEditModal(offer)}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </Button>
                          {isLive || effStatus === 'Pending Approval' ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setDeactivateTarget(offer)}
                            >
                              <Power className="w-3.5 h-3.5" />
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              variant="emerald"
                              size="sm"
                              onClick={() => handleReactivateOffer(offer)}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              {effStatus === 'Draft' ? 'Publish' : 'Reactivate'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Offer Modal */}
      <Modal
        open={Boolean(editingOffer && editInput)}
        onClose={() => {
          setEditingOffer(null);
          setEditInput(null);
        }}
        title={editingOffer ? `Edit Selling Offer (${editingOffer.id})` : 'Edit Offer'}
        subtitle="Update quantity, selling rate, location, validity date, or remarks."
        maxWidth="max-w-2xl"
      >
        {editInput && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Material / Credit Name *
                </label>
                <input
                  type="text"
                  value={editInput.materialName}
                  onChange={(e) => setEditInput({ ...editInput, materialName: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg"
                />
                {editErrors.materialName && (
                  <p className="text-xs text-[#BE123C] mt-1">{editErrors.materialName}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Category Type *
                </label>
                <input
                  type="text"
                  value={editInput.categoryType}
                  onChange={(e) => setEditInput({ ...editInput, categoryType: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg"
                />
                {editErrors.categoryType && (
                  <p className="text-xs text-[#BE123C] mt-1">{editErrors.categoryType}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Selling Rate (₹ per KG) *
                </label>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={editInput.sellingRatePerKg}
                  onChange={(e) =>
                    setEditInput({ ...editInput, sellingRatePerKg: Number(e.target.value) })
                  }
                  className="w-full h-10 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
                />
                {editErrors.sellingRatePerKg && (
                  <p className="text-xs text-[#BE123C] mt-1">{editErrors.sellingRatePerKg}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Offer Validity Date *
                </label>
                <input
                  type="date"
                  min={todayIst}
                  value={editInput.validityDate}
                  onChange={(e) => setEditInput({ ...editInput, validityDate: e.target.value })}
                  className="w-full h-10 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
                />
                {editErrors.validityDate && (
                  <p className="text-xs text-[#BE123C] mt-1">{editErrors.validityDate}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Available Quantity *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={editInput.availableQty}
                    onChange={(e) =>
                      setEditInput({ ...editInput, availableQty: Number(e.target.value) })
                    }
                    className="flex-1 h-10 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
                  />
                  <select
                    value={editInput.quantityUnit}
                    onChange={(e) =>
                      setEditInput({ ...editInput, quantityUnit: e.target.value as SellerOfferUnit })
                    }
                    className="w-20 h-10 px-2 text-xs font-semibold border border-[#CBD5E1] rounded-lg bg-white"
                  >
                    <option value="MT">MT</option>
                    <option value="KG">KG</option>
                  </select>
                </div>
                {editErrors.availableQty && (
                  <p className="text-xs text-[#BE123C] mt-1">{editErrors.availableQty}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Minimum Order Quantity *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={editInput.minOrderQty}
                    onChange={(e) =>
                      setEditInput({ ...editInput, minOrderQty: Number(e.target.value) })
                    }
                    className="flex-1 h-10 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
                  />
                  <select
                    value={editInput.minOrderUnit}
                    onChange={(e) =>
                      setEditInput({ ...editInput, minOrderUnit: e.target.value as SellerOfferUnit })
                    }
                    className="w-20 h-10 px-2 text-xs font-semibold border border-[#CBD5E1] rounded-lg bg-white"
                  >
                    <option value="MT">MT</option>
                    <option value="KG">KG</option>
                  </select>
                </div>
                {editErrors.minOrderQty && (
                  <p className="text-xs text-[#BE123C] mt-1">{editErrors.minOrderQty}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">State *</label>
                <select
                  value={editInput.state}
                  onChange={(e) => setEditInput({ ...editInput, state: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">City *</label>
                <input
                  type="text"
                  value={editInput.city}
                  onChange={(e) => setEditInput({ ...editInput, city: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Additional Remarks
              </label>
              <textarea
                rows={3}
                value={editInput.remarks || ''}
                onChange={(e) => setEditInput({ ...editInput, remarks: e.target.value })}
                className="w-full p-3 text-sm border border-[#CBD5E1] rounded-lg"
              />
            </div>

            <div className="pt-2 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setEditingOffer(null);
                  setEditInput(null);
                }}
              >
                Cancel
              </Button>
              {editingOffer?.status === 'Draft' && (
                <Button
                  variant="secondary"
                  disabled={savingEdit}
                  onClick={() => handleSaveEdit(false)}
                >
                  Save Draft
                </Button>
              )}
              <Button
                variant="emerald"
                disabled={savingEdit}
                onClick={() => handleSaveEdit(true)}
              >
                {savingEdit ? 'Saving...' : 'Save & Publish Offer'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Deactivate Offer Confirmation */}
      <ConfirmModal
        open={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleConfirmDeactivate}
        title="Deactivate Selling Offer?"
        description={
          deactivateTarget
            ? `Deactivating ${deactivateTarget.id} (${deactivateTarget.materialName}) will immediately remove it from the public homepage and disable buyer enquiries. You can reactivate it later.`
            : ''
        }
        confirmLabel="Deactivate Offer"
        variant="danger"
      />

      {/* Respond to Buyer Enquiry Modal */}
      <Modal
        open={Boolean(respondingEnquiry)}
        onClose={() => setRespondingEnquiry(null)}
        title={respondingEnquiry ? `Update Buyer Enquiry (${respondingEnquiry.id})` : 'Update Enquiry'}
        subtitle={
          respondingEnquiry
            ? `${respondingEnquiry.buyerCompanyName} · ${respondingEnquiry.offerMaterialName}`
            : undefined
        }
      >
        {respondingEnquiry && (
          <form onSubmit={handleSaveEnquiryResponse} className="space-y-4">
            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-1">
              <div className="font-semibold text-[#0A172A]">
                {respondingEnquiry.buyerCompanyName} ({respondingEnquiry.buyerContactPerson})
              </div>
              <div className="font-mono text-[#334155]">
                Requested: {formatOfferQuantity(respondingEnquiry.requestedQty, respondingEnquiry.requestedUnit)} @{' '}
                {formatOfferRatePerKg(respondingEnquiry.proposedRatePerKg)}
              </div>
              <p className="text-[#475569] pt-1">{respondingEnquiry.message}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Enquiry Status
              </label>
              <select
                value={responseStatus}
                onChange={(e) => setResponseStatus(e.target.value as OfferEnquiryRecord['status'])}
                className="w-full h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg bg-white"
              >
                <option value="New">New</option>
                <option value="Reviewed">Reviewed</option>
                <option value="Responded">Responded (Notifies Buyer)</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Response Note to Buyer
              </label>
              <textarea
                rows={3}
                value={responseNote}
                onChange={(e) => setResponseNote(e.target.value)}
                placeholder="Share credit availability confirmation, GST terms, or next steps for transfer..."
                className="w-full p-3 text-sm border border-[#CBD5E1] rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRespondingEnquiry(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="emerald" disabled={savingResponse}>
                {savingResponse ? 'Saving...' : 'Save Update'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ShareOfferModal
        offer={shareOffer}
        onClose={() => setShareOffer(null)}
        onCopied={() => addToast({ type: 'success', title: 'Offer link copied to clipboard' })}
      />
    </div>
  );
};
