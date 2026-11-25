import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  Share2,
  SlidersHorizontal,
} from 'lucide-react';
import { Button, EmptyState } from '../ui/DesignSystem';
import { ShareOfferModal } from './ShareOfferModal';
import { EPRCategory, SellerOfferRecord } from '../../types';
import { toSellerOfferBase } from '../../services/sellerOfferService';
import {
  filterPublicSellerOffers,
  formatOfferQuantity,
  formatOfferRatePerKg,
  formatValidityDateDisplay,
  INDIAN_STATES,
  isOfferPubliclyVisible,
  SellerOfferBase,
} from '../../../shared/sellerOffers';

interface LiveSellerOffersSectionProps {
  offers: SellerOfferRecord[];
  categories: EPRCategory[];
  onViewOffer: (offerId: string) => void;
  onSellerSignIn: () => void;
  onCopiedLink?: () => void;
}

const PAGE_SIZE = 6;

export const LiveSellerOffersSection: React.FC<LiveSellerOffersSectionProps> = ({
  offers,
  categories,
  onViewOffer,
  onSellerSignIn,
  onCopiedLink,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [materialFilter, setMaterialFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minQtyKg, setMinQtyKg] = useState('');
  const [page, setPage] = useState(1);
  const [shareOffer, setShareOffer] = useState<SellerOfferBase | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const activeValidOffers = useMemo(
    () => offers.map(toSellerOfferBase).filter((o) => isOfferPubliclyVisible(o)),
    [offers]
  );

  const distinctMaterials = useMemo(() => {
    const set = new Set<string>();
    activeValidOffers.forEach((o) => {
      if (o.materialName) set.add(o.materialName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activeValidOffers]);

  const availableStates = useMemo(() => {
    const set = new Set<string>(INDIAN_STATES);
    activeValidOffers.forEach((o) => {
      if (o.state) set.add(o.state);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activeValidOffers]);

  const filteredOffers = useMemo(() => {
    const parsedMinPrice = minPrice.trim() ? Number(minPrice) : null;
    const parsedMaxPrice = maxPrice.trim() ? Number(maxPrice) : null;
    const parsedMinQty = minQtyKg.trim() ? Number(minQtyKg) : null;
    return filterPublicSellerOffers(activeValidOffers, {
      search,
      categoryId: categoryFilter,
      material: materialFilter === 'ALL' ? '' : materialFilter,
      state: stateFilter === 'ALL' ? '' : stateFilter,
      minPrice: Number.isFinite(parsedMinPrice) ? parsedMinPrice : null,
      maxPrice: Number.isFinite(parsedMaxPrice) ? parsedMaxPrice : null,
      minQtyKg: Number.isFinite(parsedMinQty) ? parsedMinQty : null,
    });
  }, [activeValidOffers, search, categoryFilter, materialFilter, stateFilter, minPrice, maxPrice, minQtyKg]);

  const totalPages = Math.max(1, Math.ceil(filteredOffers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedOffers = filteredOffers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasActiveFilters = Boolean(
    search.trim() ||
      categoryFilter !== 'ALL' ||
      materialFilter !== 'ALL' ||
      stateFilter !== 'ALL' ||
      minPrice.trim() ||
      maxPrice.trim() ||
      minQtyKg.trim()
  );

  const resetFilters = () => {
    setSearch('');
    setCategoryFilter('ALL');
    setMaterialFilter('ALL');
    setStateFilter('ALL');
    setMinPrice('');
    setMaxPrice('');
    setMinQtyKg('');
    setPage(1);
  };

  return (
    <section
      id="live-seller-offers"
      className="bg-[#F4F7FB] border-b border-[#E2E8F0]"
      aria-labelledby="live-seller-offers-heading"
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-6">
        {/* Section Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[#16A36A]">
              Direct Verified Recycler Supply
            </div>
            <h2
              id="live-seller-offers-heading"
              className="font-display text-2xl sm:text-[28px] font-bold text-[#0A172A] mt-1"
            >
              LIVE EPR SELLER OFFERS
            </h2>
            <p className="text-sm text-[#475569] mt-1 max-w-2xl">
              Browse active EPR credit selling rates submitted by registered sellers across India. Click any offer for
              full details, direct buyer enquiry, or social sharing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-xs text-[#475569] tabular-nums">
              {filteredOffers.length} active {filteredOffers.length === 1 ? 'offer' : 'offers'}
            </span>
            <Button variant="emerald" size="sm" onClick={onSellerSignIn}>
              Submit Selling Offer
            </Button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-3 shadow-[0_1px_2px_0_rgba(16,35,63,0.04)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            <div className="relative lg:col-span-4">
              <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search material, offer ID, city, or seller..."
                className="w-full h-10 pl-9 pr-3 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#10233F]"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by EPR Category"
              className="h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg bg-white lg:col-span-2"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={materialFilter}
              onChange={(e) => {
                setMaterialFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by Material"
              className="h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg bg-white lg:col-span-2"
            >
              <option value="ALL">All Materials</option>
              {distinctMaterials.map((mat) => (
                <option key={mat} value={mat}>
                  {mat}
                </option>
              ))}
            </select>

            <select
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by State"
              className="h-10 px-3 text-sm border border-[#CBD5E1] rounded-lg bg-white lg:col-span-2"
            >
              <option value="ALL">All States</option>
              {availableStates.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <div className="lg:col-span-2 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowAdvancedFilters((v) => !v)}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showAdvancedFilters ? 'Hide Range' : 'Rate & Qty'}
              </Button>
            </div>
          </div>

          {showAdvancedFilters && (
            <div className="pt-3 border-t border-[#F1F5F9] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748B] mb-1">
                  Min Rate (₹/KG)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={minPrice}
                  onChange={(e) => {
                    setMinPrice(e.target.value);
                    setPage(1);
                  }}
                  placeholder="e.g. 2"
                  className="w-full h-9 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748B] mb-1">
                  Max Rate (₹/KG)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={maxPrice}
                  onChange={(e) => {
                    setMaxPrice(e.target.value);
                    setPage(1);
                  }}
                  placeholder="e.g. 25"
                  className="w-full h-9 px-3 text-sm font-mono border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748B] mb-1">
                  Min Available Quantity
                </label>
                <select
                  value={minQtyKg}
                  onChange={(e) => {
                    setMinQtyKg(e.target.value);
                    setPage(1);
                  }}
                  className="w-full h-9 px-3 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                >
                  <option value="">Any Quantity</option>
                  <option value="1000">1,000 KG (1 MT) +</option>
                  <option value="5000">5,000 KG (5 MT) +</option>
                  <option value="10000">10,000 KG (10 MT) +</option>
                  <option value="25000">25,000 KG (25 MT) +</option>
                  <option value="50000">50,000 KG (50 MT) +</option>
                  <option value="100000">1,00,000 KG (100 MT) +</option>
                </select>
              </div>
              <div className="flex justify-end">
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    Reset All Filters
                  </Button>
                )}
              </div>
            </div>
          )}

          {!showAdvancedFilters && hasActiveFilters && (
            <div className="flex items-center justify-between pt-2 border-t border-[#F1F5F9] text-xs text-[#475569]">
              <span>
                Showing {filteredOffers.length} of {activeValidOffers.length} live seller offers
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="font-semibold text-[#10233F] hover:text-[#16A36A] underline cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>

        {/* Offer Cards Grid */}
        {paginatedOffers.length === 0 ? (
          <EmptyState
            title={
              activeValidOffers.length === 0
                ? 'No live EPR seller offers published yet'
                : 'No seller offers match your selected filters'
            }
            description={
              activeValidOffers.length === 0
                ? 'Active EPR selling rates submitted by verified sellers will appear here automatically in real time.'
                : 'Try adjusting your category, state, price range, or quantity filters to view more active offers.'
            }
            actionLabel={activeValidOffers.length === 0 ? 'Seller Sign-In to Post Offer' : 'Reset Filters'}
            onAction={activeValidOffers.length === 0 ? onSellerSignIn : resetFilters}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {paginatedOffers.map((offer) => (
                <article
                  key={offer.id}
                  className="bg-white border border-[#E2E8F0] hover:border-[#10233F] rounded-lg p-5 flex flex-col justify-between transition-colors shadow-[0_1px_2px_0_rgba(16,35,63,0.04)]"
                >
                  <div>
                    {/* Top meta row */}
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#64748B]">
                      <span className="font-mono font-semibold text-[#10233F] truncate">{offer.id}</span>
                      <span className="font-semibold text-[#15803D] shrink-0">Active Offer</span>
                    </div>

                    {/* Material & Category */}
                    <h3 className="font-display text-lg font-bold text-[#0A172A] mt-2 leading-snug">
                      {offer.materialName}
                    </h3>
                    <div className="text-xs text-[#475569] mt-1">
                      {offer.categoryName} · {offer.categoryType}
                    </div>

                    {/* Prominent Rate Block */}
                    <div className="mt-4 pt-4 border-t border-[#F1F5F9] flex items-baseline justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                          Selling Rate
                        </div>
                        <div className="font-mono text-2xl font-bold text-[#15803D] tabular-nums mt-0.5">
                          {formatOfferRatePerKg(offer.sellingRatePerKg)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                          Available Qty
                        </div>
                        <div className="font-mono text-base font-bold text-[#0A172A] tabular-nums mt-0.5">
                          {formatOfferQuantity(offer.availableQty, offer.quantityUnit)}
                        </div>
                      </div>
                    </div>

                    {/* Key Commercial Specs */}
                    <dl className="mt-4 pt-3 border-t border-[#F1F5F9] space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[#64748B]">Minimum Order Qty</dt>
                        <dd className="font-mono font-semibold text-[#0A172A] tabular-nums">
                          {formatOfferQuantity(offer.minOrderQty, offer.minOrderUnit)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[#64748B] inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#94A3B8]" />
                          Seller Location
                        </dt>
                        <dd className="font-medium text-[#0A172A] text-right truncate">
                          {offer.city}, {offer.state}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[#64748B] inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
                          Offer Validity
                        </dt>
                        <dd className="font-mono font-medium text-[#334155] tabular-nums">
                          {formatValidityDateDisplay(offer.validityDate)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Card Action Bar */}
                  <div className="mt-5 pt-4 border-t border-[#E2E8F0] flex items-center gap-2.5">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      onClick={() => onViewOffer(offer.id)}
                    >
                      View Details
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShareOffer(offer)}
                      aria-label={`Share offer ${offer.materialName}`}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Share Offer
                    </Button>
                  </div>
                </article>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-xs text-[#64748B] font-mono tabular-nums">
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filteredOffers.length)} of {filteredOffers.length} offers
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Previous
                  </Button>
                  <span className="px-2.5 font-mono text-xs font-semibold text-[#0A172A] tabular-nums">
                    Page {safePage} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ShareOfferModal
        offer={shareOffer}
        onClose={() => setShareOffer(null)}
        onCopied={onCopiedLink}
      />
    </section>
  );
};
