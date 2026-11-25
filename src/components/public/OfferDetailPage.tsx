import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Package,
  Send,
  Share2,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useMarketplace } from '../../context/MarketplaceContext';
import { Button, StatusBadge } from '../ui/DesignSystem';
import { ShareOfferModal } from './ShareOfferModal';
import { fetchSingleSellerOfferDoc, toSellerOfferBase } from '../../services/sellerOfferService';
import {
  buildOfferCanonicalUrl,
  formatOfferQuantity,
  formatOfferRatePerKg,
  formatValidityDateDisplay,
  getEffectiveOfferStatus,
  isOfferPubliclyVisible,
} from '../../../shared/sellerOffers';
import { formatTime, SellerOfferRecord } from '../../types';

export const OfferDetailPage: React.FC = () => {
  const {
    role,
    authUser,
    selectedPublicOfferId,
    publicSellerOffers,
    sellerOffers,
    offerEnquiries,
    currentBuyer,
    navigatePublic,
    returnToPortalDashboard,
    startBuyerAuthForOffer,
    submitOfferEnquiry,
    addToast,
  } = useMarketplace();

  const [fetchedOffer, setFetchedOffer] = useState<SellerOfferRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

  const [requestedQty, setRequestedQty] = useState('');
  const [requestedUnit, setRequestedUnit] = useState<'KG' | 'MT'>('KG');
  const [proposedRate, setProposedRate] = useState('');
  const [enquiryMsg, setEnquiryMsg] = useState('');
  const [submittingEnquiry, setSubmittingEnquiry] = useState(false);
  const [enquiryError, setEnquiryError] = useState<string | null>(null);
  const [submittedEnquiryId, setSubmittedEnquiryId] = useState<string | null>(null);

  const enquirySectionRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  const offerFromStore =
    (selectedPublicOfferId &&
      (publicSellerOffers.find((o) => o.id === selectedPublicOfferId) ||
        sellerOffers.find((o) => o.id === selectedPublicOfferId))) ||
    null;

  const offer = offerFromStore || fetchedOffer;

  useEffect(() => {
    let active = true;
    setSubmittedEnquiryId(null);
    setEnquiryError(null);
    if (!selectedPublicOfferId) {
      setFetchedOffer(null);
      setLoading(false);
      return;
    }
    if (offerFromStore) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchSingleSellerOfferDoc(selectedPublicOfferId)
      .then((res) => {
        if (!active) return;
        setFetchedOffer(res);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFetchedOffer(null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedPublicOfferId, offerFromStore]);

  useEffect(() => {
    if (!offer) return;
    setRequestedQty((prev) => prev || String(offer.minOrderQty));
    setRequestedUnit(offer.minOrderUnit);
    setProposedRate((prev) => prev || String(offer.sellingRatePerKg));
  }, [offer]);

  const scrollToEnquiryPanel = () => {
    enquirySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      messageInputRef.current?.focus();
    }, 350);
  };

  const handleEnquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offer) return;
    const qty = Number(requestedQty);
    const rate = Number(proposedRate);
    if (!Number.isFinite(qty) || qty <= 0) {
      setEnquiryError('Please enter a valid required quantity greater than 0.');
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      setEnquiryError('Please enter a valid proposed rate (₹/KG) greater than 0.');
      return;
    }
    if (enquiryMsg.trim().length < 5) {
      setEnquiryError('Please enter brief purchase details or questions for the seller.');
      return;
    }
    setSubmittingEnquiry(true);
    setEnquiryError(null);
    try {
      const id = await submitOfferEnquiry({
        offer,
        requestedQty: qty,
        requestedUnit,
        proposedRatePerKg: rate,
        message: enquiryMsg,
      });
      setSubmittedEnquiryId(id);
      setEnquiryMsg('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to submit enquiry right now.';
      setEnquiryError(msg);
      addToast({ type: 'error', title: 'Enquiry submission failed', description: msg });
    } finally {
      setSubmittingEnquiry(false);
    }
  };

  if (loading) {
    return (
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-8 text-center text-sm text-[#64748B]">
          Loading EPR seller offer details...
        </div>
      </section>
    );
  }

  if (!offer) {
    return (
      <section className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-8 text-center space-y-4">
          <div className="font-mono text-xs uppercase tracking-wider text-[#64748B]">
            Offer Reference: {selectedPublicOfferId || 'Unknown'}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A172A]">
            This EPR Selling Offer Is No Longer Available
          </h1>
          <p className="text-sm text-[#475569] max-w-lg mx-auto">
            The offer may have expired, been deactivated by the seller, or the link may be incorrect. Browse current
            live seller offers on the EPR Bazaar homepage.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <Button variant="primary" onClick={() => navigatePublic('home')}>
              Browse Live Seller Offers
            </Button>
            {role !== 'public' && (
              <Button variant="secondary" onClick={returnToPortalDashboard}>
                <LayoutDashboard className="w-4 h-4" />
                Return to Dashboard
              </Button>
            )}
          </div>
        </div>
      </section>
    );
  }

  const offerBase = toSellerOfferBase(offer);
  const effectiveStatus = getEffectiveOfferStatus(offerBase);
  const publiclyActive = isOfferPubliclyVisible(offerBase);
  const isOwner = Boolean(authUser && authUser.uid === offer.sellerUid);
  const canonicalUrl = buildOfferCanonicalUrl(offer.id);
  const myEnquiriesForOffer =
    role === 'buyer' ? offerEnquiries.filter((e) => e.offerId === offer.id) : [];

  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      {/* Top Breadcrumb & Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigatePublic('home')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#10233F] hover:text-[#16A36A] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Live EPR Seller Offers
        </button>

        {role !== 'public' && (
          <Button variant="secondary" size="sm" onClick={returnToPortalDashboard}>
            <LayoutDashboard className="w-3.5 h-3.5" />
            Return to {role.charAt(0).toUpperCase() + role.slice(1)} Dashboard
          </Button>
        )}
      </div>

      {/* Expired / Inactive Banner */}
      {!publiclyActive && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-xs text-[#92400E]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">
              Offer Status: {effectiveStatus}
            </div>
            <p className="mt-0.5">
              {effectiveStatus === 'Expired'
                ? `This offer expired on ${formatValidityDateDisplay(offer.validityDate)} and is no longer visible in public listings.`
                : 'This offer is currently not active for public buyer enquiries.'}
            </p>
          </div>
        </div>
      )}

      {/* Main Offer Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Complete Offer Details */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 sm:p-7 shadow-[0_1px_2px_0_rgba(16,35,63,0.04)] space-y-6">
            {/* Title & Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F0] pb-5">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                  <span className="font-mono font-semibold text-[#10233F]">{offer.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{offer.categoryName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{offer.categoryType}</span>
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A172A] leading-tight">
                  {offer.materialName}
                </h1>
              </div>
              <StatusBadge status={effectiveStatus} />
            </div>

            {/* Key Commercial Metrics Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#15803D]">
                  Offered Selling Rate
                </div>
                <div className="font-mono text-2xl font-bold text-[#15803D] tabular-nums mt-1">
                  {formatOfferRatePerKg(offer.sellingRatePerKg)}
                </div>
                <div className="text-[11px] text-[#166534] mt-1">Excl. applicable GST</div>
              </div>

              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                  Available Quantity
                </div>
                <div className="font-mono text-2xl font-bold text-[#0A172A] tabular-nums mt-1">
                  {formatOfferQuantity(offer.availableQty, offer.quantityUnit)}
                </div>
                <div className="text-[11px] text-[#64748B] mt-1">Ready for allocation</div>
              </div>

              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                  Minimum Order Qty
                </div>
                <div className="font-mono text-2xl font-bold text-[#0A172A] tabular-nums mt-1">
                  {formatOfferQuantity(offer.minOrderQty, offer.minOrderUnit)}
                </div>
                <div className="text-[11px] text-[#64748B] mt-1">Per buyer enquiry</div>
              </div>
            </div>

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {publiclyActive && (
                <>
                  <Button
                    variant="emerald"
                    onClick={() => {
                      if (role === 'public') {
                        startBuyerAuthForOffer(offer.id);
                      } else {
                        scrollToEnquiryPanel();
                      }
                    }}
                  >
                    <MessageSquare className="w-4 h-4" />
                    Contact Seller
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (role === 'public') {
                        startBuyerAuthForOffer(offer.id);
                      } else {
                        scrollToEnquiryPanel();
                      }
                    }}
                  >
                    <Send className="w-4 h-4" />
                    Send Enquiry
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => setShareOpen(true)}>
                <Share2 className="w-4 h-4" />
                Share Offer
              </Button>
            </div>

            {/* Detailed Material & Specification Table */}
            <div className="pt-4 border-t border-[#E2E8F0]">
              <h2 className="font-display text-sm font-semibold text-[#0A172A] mb-3">
                Material &amp; Commercial Specifications
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="py-2 border-b border-[#F1F5F9]">
                  <dt className="text-xs text-[#64748B]">EPR Credit Category</dt>
                  <dd className="font-semibold text-[#0A172A] mt-0.5">{offer.categoryName}</dd>
                </div>
                <div className="py-2 border-b border-[#F1F5F9]">
                  <dt className="text-xs text-[#64748B]">Category Type</dt>
                  <dd className="font-semibold text-[#0A172A] mt-0.5">{offer.categoryType}</dd>
                </div>
                <div className="py-2 border-b border-[#F1F5F9]">
                  <dt className="text-xs text-[#64748B] inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#94A3B8]" />
                    Supply Location
                  </dt>
                  <dd className="font-semibold text-[#0A172A] mt-0.5">
                    {offer.city}, {offer.state}
                  </dd>
                </div>
                <div className="py-2 border-b border-[#F1F5F9]">
                  <dt className="text-xs text-[#64748B] inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
                    Offer Valid Until
                  </dt>
                  <dd className="font-mono font-semibold text-[#0A172A] mt-0.5 tabular-nums">
                    {formatValidityDateDisplay(offer.validityDate)}
                  </dd>
                </div>
                <div className="py-2 border-b border-[#F1F5F9]">
                  <dt className="text-xs text-[#64748B] inline-flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-[#94A3B8]" />
                    Posted On
                  </dt>
                  <dd className="font-mono text-xs text-[#334155] mt-1">{formatTime(offer.createdAt)}</dd>
                </div>
                <div className="py-2 border-b border-[#F1F5F9]">
                  <dt className="text-xs text-[#64748B]">Direct Shareable Link</dt>
                  <dd className="font-mono text-xs text-[#1E3A8A] mt-1 truncate">{canonicalUrl}</dd>
                </div>
              </dl>

              {offer.remarks && (
                <div className="mt-4 pt-4 border-t border-[#F1F5F9]">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Additional Seller Remarks
                  </div>
                  <p className="mt-1.5 text-sm text-[#334155] leading-relaxed whitespace-pre-line">
                    {offer.remarks}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Seller Information Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 shadow-[0_1px_2px_0_rgba(16,35,63,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-[#10233F]" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                    Registered EPR Seller
                  </div>
                  <h2 className="font-display text-base font-bold text-[#0A172A] mt-0.5">
                    {offer.sellerCompanyName}
                  </h2>
                  <div className="text-xs text-[#475569] mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{offer.city}, {offer.state}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[#64748B]">ID: {offer.sellerCompanyId}</span>
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                <ShieldCheck className="w-4 h-4" />
                {offer.sellerVerification === 'Verified'
                  ? 'KYC & EPR Verified Seller'
                  : 'Registered Platform Seller'}
              </span>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Buyer Onboarding & Direct Enquiry Form */}
        <div ref={enquirySectionRef} className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 shadow-[0_1px_2px_0_rgba(16,35,63,0.04)] space-y-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#16A36A]">
                Buyer Enquiry Desk
              </div>
              <h2 className="font-display text-xl font-bold text-[#0A172A] mt-0.5">
                Contact Seller &amp; Send Enquiry
              </h2>
              <p className="text-xs text-[#475569] mt-1 leading-relaxed">
                Submit your required quantity and proposed rate directly against Offer{' '}
                <span className="font-mono font-semibold text-[#0A172A]">{offer.id}</span>. The seller receives an
                instant notification inside their ETP – EPR Bazaar dashboard.
              </p>
            </div>

            {!publiclyActive ? (
              <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#475569]">
                Enquiries are closed because this offer is currently <strong>{effectiveStatus}</strong>.
              </div>
            ) : role === 'public' ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-[#F4F7FB] border border-[#CBD5E1] space-y-2.5">
                  <div className="text-sm font-semibold text-[#0A172A]">
                    Sign In or Register as a Buyer to Contact Seller
                  </div>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    New buyers can register in under 2 minutes using the existing EPR Bazaar Buyer Google Sign-In and
                    company verification flow. After signing in, you will return directly to this offer to send your
                    enquiry.
                  </p>
                  <div className="pt-1 flex flex-col sm:flex-row gap-2.5">
                    <Button
                      variant="emerald"
                      className="flex-1"
                      onClick={() => startBuyerAuthForOffer(offer.id)}
                    >
                      <UserPlus className="w-4 h-4" />
                      Register / Login as Buyer
                    </Button>
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-[#475569]">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#16A36A] shrink-0 mt-0.5" />
                    <span>Uses your existing ETP – EPR Bazaar corporate buyer account.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#16A36A] shrink-0 mt-0.5" />
                    <span>Enquiry is automatically linked to this offer ID and the verified seller.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#16A36A] shrink-0 mt-0.5" />
                    <span>Seller is notified immediately to review and respond.</span>
                  </li>
                </ul>
              </div>
            ) : role === 'buyer' ? (
              submittedEnquiryId ? (
                <div className="p-5 rounded-lg bg-[#F0FDF4] border border-[#86EFAC] space-y-3">
                  <div className="flex items-center gap-2 text-[#15803D] font-semibold text-sm">
                    <CheckCircle2 className="w-5 h-5" />
                    Enquiry Submitted ({submittedEnquiryId})
                  </div>
                  <p className="text-xs text-[#166534] leading-relaxed">
                    Your enquiry for <strong>{offer.materialName}</strong> has been linked to Offer{' '}
                    <span className="font-mono">{offer.id}</span> and sent to <strong>{offer.sellerCompanyName}</strong>.
                    You will be notified in your Buyer Portal once the seller responds.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSubmittedEnquiryId(null)}
                    >
                      Send Another Enquiry
                    </Button>
                    <Button variant="primary" size="sm" onClick={returnToPortalDashboard}>
                      Open Buyer Dashboard
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleEnquirySubmit} className="space-y-4">
                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                    <div className="text-[#64748B]">Enquiring as</div>
                    <div className="font-semibold text-[#0A172A] mt-0.5">
                      {currentBuyer?.companyName || 'Registered Buyer'}
                    </div>
                    {currentBuyer && (
                      <div className="text-[#475569] mt-0.5">
                        {currentBuyer.contactPerson} · {currentBuyer.city || 'India'}, {currentBuyer.state || 'India'}
                      </div>
                    )}
                  </div>

                  {enquiryError && (
                    <div className="p-3 rounded-lg bg-[#FFE4E6] border border-[#FECDD3] text-xs text-[#9F1239]">
                      {enquiryError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#334155] mb-1">
                        Required Quantity *
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          required
                          min={0.01}
                          step="any"
                          value={requestedQty}
                          onChange={(e) => setRequestedQty(e.target.value)}
                          className="w-full h-10 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
                        />
                        <select
                          value={requestedUnit}
                          onChange={(e) => setRequestedUnit(e.target.value as 'KG' | 'MT')}
                          className="h-10 px-2.5 text-xs font-semibold border border-[#CBD5E1] rounded-lg bg-white"
                        >
                          <option value="KG">KG</option>
                          <option value="MT">MT</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#334155] mb-1">
                        Proposed Rate (₹/KG) *
                      </label>
                      <input
                        type="number"
                        required
                        min={0.01}
                        step="0.01"
                        value={proposedRate}
                        onChange={(e) => setProposedRate(e.target.value)}
                        className="w-full h-10 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#334155] mb-1">
                      Message / Compliance Requirements *
                    </label>
                    <textarea
                      ref={messageInputRef}
                      required
                      rows={4}
                      value={enquiryMsg}
                      onChange={(e) => setEnquiryMsg(e.target.value)}
                      placeholder="Specify required financial year, delivery timeline, CPCB credit transfer schedule, or any questions for the seller..."
                      className="w-full p-3 text-sm border border-[#CBD5E1] rounded-lg"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="emerald"
                    className="w-full"
                    disabled={submittingEnquiry}
                  >
                    <Send className="w-4 h-4" />
                    {submittingEnquiry ? 'Sending Enquiry...' : 'Send Enquiry to Seller'}
                  </Button>
                </form>
              )
            ) : (
              <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-3 text-xs text-[#334155]">
                <div className="font-semibold text-[#0A172A]">
                  {isOwner
                    ? 'You are viewing your own published Seller Offer'
                    : `Signed in as ${role.charAt(0).toUpperCase() + role.slice(1)}`}
                </div>
                <p className="text-[#475569] leading-relaxed">
                  {isOwner
                    ? 'Share this public link on WhatsApp, Facebook, LinkedIn, or Telegram to attract verified EPR buyers. Buyer enquiries will appear under My Selling Offers in your Seller Dashboard.'
                    : 'Buyer enquiries can be submitted from registered Buyer accounts. You can still share this offer link or return to your portal dashboard.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" onClick={returnToPortalDashboard}>
                    Return to Dashboard
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setShareOpen(true)}>
                    <Share2 className="w-3.5 h-3.5" />
                    Share Offer
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Buyer's Previous Enquiries on this Offer */}
          {myEnquiriesForOffer.length > 0 && (
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Your Submitted Enquiries ({myEnquiriesForOffer.length})
              </div>
              <div className="space-y-3">
                {myEnquiriesForOffer.map((enq) => (
                  <div
                    key={enq.id}
                    className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-[#0A172A]">{enq.id}</span>
                      <StatusBadge status={enq.status} />
                    </div>
                    <div className="font-mono text-[#334155] tabular-nums">
                      {formatOfferQuantity(enq.requestedQty, enq.requestedUnit)} @{' '}
                      {formatOfferRatePerKg(enq.proposedRatePerKg)}
                    </div>
                    <p className="text-[#475569]">{enq.message}</p>
                    {enq.sellerResponseNote && (
                      <div className="pt-1.5 border-t border-[#E2E8F0] text-[#15803D]">
                        <strong>Seller Note:</strong> {enq.sellerResponseNote}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ShareOfferModal
        offer={shareOpen ? offerBase : null}
        onClose={() => setShareOpen(false)}
        onCopied={() => addToast({ type: 'success', title: 'Offer link copied to clipboard' })}
      />
    </section>
  );
};
