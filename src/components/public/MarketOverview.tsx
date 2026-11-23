import React, { useMemo, useState } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import {
  EPRCategory,
  MarketRateRecord,
  PublishedEprRate,
  SellerListing,
  TransactionRecord,
} from '../../types';
import {
  computeMarketOverviewStats,
  formatVolumeTotals,
} from '../../../shared/marketOverviewStats';
import { Button, formatINR } from '../ui/DesignSystem';

interface MarketOverviewProps {
  categories: EPRCategory[];
  publicListings: SellerListing[];
  transactions: TransactionRecord[];
  publishedRates: PublishedEprRate[];
  marketRates: MarketRateRecord[];
  onOpenMarketplace: () => void;
  onOpenRateBoard: () => void;
  onSelectCategory: (categoryId: string) => void;
}

export const MarketOverview: React.FC<MarketOverviewProps> = ({
  categories,
  publicListings,
  transactions,
  publishedRates,
  marketRates,
  onOpenMarketplace,
  onOpenRateBoard,
  onSelectCategory,
}) => {
  const [selectedFy, setSelectedFy] = useState<string>('ALL');

  const summary = useMemo(
    () =>
      computeMarketOverviewStats({
        categories,
        publicListings,
        transactions,
        publishedRates,
        marketRates,
        financialYearFilter: selectedFy,
      }),
    [categories, publicListings, transactions, publishedRates, marketRates, selectedFy]
  );

  const formattedTradedVolume = formatVolumeTotals(summary.totalTradedVolumeByUnit, 'MT');
  const formattedAvailableSupply = formatVolumeTotals(summary.availableSupplyByUnit, 'MT');

  return (
    <section
      aria-labelledby="market-overview-heading"
      className="bg-[#F8FAFC] border-b border-[#E2E8F0]"
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Section Header + Interactive Financial Year Filter */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#E2E8F0]">
          <div className="max-w-2xl">
            <div className="text-xs font-medium text-[#64748B]">
              Verified Exchange Activity
            </div>
            <h2
              id="market-overview-heading"
              className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#0A172A] mt-1 text-balance"
            >
              Market Overview
            </h2>
            <p className="text-sm text-[#475569] mt-1.5 leading-relaxed">
              Live trading summary across verified EPR credit listings, settled orders, and supported compliance material streams on EPR Bazaar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {summary.availableFinancialYears.length > 0 && (
              <div
                role="group"
                aria-label="Filter market overview by financial year"
                className="inline-flex items-center gap-1 p-1 bg-white border border-[#E2E8F0] rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => setSelectedFy('ALL')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedFy === 'ALL'
                      ? 'bg-[#0A172A] text-white'
                      : 'text-[#475569] hover:text-[#0A172A]'
                  }`}
                >
                  All Years
                </button>
                {summary.availableFinancialYears.slice(0, 3).map((fy) => (
                  <button
                    key={fy}
                    type="button"
                    onClick={() => setSelectedFy(fy)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedFy === fy
                        ? 'bg-[#0A172A] text-white'
                        : 'text-[#475569] hover:text-[#0A172A]'
                    }`}
                  >
                    {fy}
                  </button>
                ))}
              </div>
            )}

            <Button variant="secondary" size="sm" onClick={onOpenMarketplace}>
              Explore Marketplace
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Primary 3-Column Aggregate KPI Strip (Single Elevation, Hairline Dividers) */}
        <div className="mt-6 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-[0_1px_2px_0_rgba(16,35,63,0.04)]">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#E2E8F0]">
            {/* KPI 1: Active Trades */}
            <div className="p-6 flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-[#475569]">Active Trades</div>
                <div className="font-mono text-3xl sm:text-4xl font-bold text-[#0A172A] tabular-nums mt-2 tracking-tight">
                  {summary.activeTradesCount.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#F1F5F9] text-xs text-[#64748B] flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  {summary.activeTradesCount > 0
                    ? `Across ${summary.activeListingCategoriesCount} active material ${
                        summary.activeListingCategoriesCount === 1 ? 'stream' : 'streams'
                      }`
                    : 'Open for verified recycler listings'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-medium text-[#0A172A] tabular-nums">
                  {formattedAvailableSupply} available
                </span>
              </div>
            </div>

            {/* KPI 2: Total Volume Traded */}
            <div className="p-6 flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-[#475569]">Total Volume Traded</div>
                <div className="font-mono text-3xl sm:text-4xl font-bold text-[#16A36A] tabular-nums mt-2 tracking-tight">
                  {formattedTradedVolume}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#F1F5F9] text-xs text-[#64748B] flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  {summary.completedTradesCount.toLocaleString('en-IN')} settled{' '}
                  {summary.completedTradesCount === 1 ? 'order' : 'orders'}
                </span>
                {summary.totalTradedValueINR > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-medium text-[#0A172A] tabular-nums">
                      {formatINR(summary.totalTradedValueINR)} value
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* KPI 3: Supported Material Categories */}
            <div className="p-6 flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-[#475569]">
                  Supported Material Categories
                </div>
                <div className="font-mono text-3xl sm:text-4xl font-bold text-[#0A172A] tabular-nums mt-2 tracking-tight">
                  {summary.supportedCategoriesCount.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#F1F5F9] text-xs text-[#64748B] leading-relaxed">
                {summary.supportedCategoryNames.length > 0
                  ? summary.supportedCategoryNames.join(' · ')
                  : 'Plastic · E-Waste · Battery · Tyre · Used Oil'}
              </div>
            </div>
          </div>

          {/* Material Stream Activity Breakdown Table */}
          {summary.categoryBreakdown.length > 0 && (
            <div className="border-t border-[#E2E8F0]">
              <div className="px-6 py-3.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[#0A172A]">
                  Category-Wise Activity &amp; Credit Depth
                  {selectedFy !== 'ALL' ? ` — ${selectedFy}` : ''}
                </div>
                <button
                  type="button"
                  onClick={onOpenRateBoard}
                  className="text-xs font-semibold text-[#0A172A] hover:text-[#16A36A] transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Full Rate Board
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[11px] font-semibold text-[#64748B]">
                      <th className="py-3 px-6">Material Category</th>
                      <th className="py-3 px-4 text-right">Active Trades</th>
                      <th className="py-3 px-4 text-right">Available Supply</th>
                      <th className="py-3 px-4 text-right">Volume Traded</th>
                      <th className="py-3 px-6 text-right">Reference Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-sm">
                    {summary.categoryBreakdown.map((row) => (
                      <tr
                        key={row.categoryId}
                        onClick={() => onSelectCategory(row.categoryId)}
                        className="hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-6">
                          <div className="font-medium text-[#0A172A]">{row.name}</div>
                          <div className="text-xs text-[#64748B] font-mono mt-0.5">
                            {row.code} · {row.unit}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#0A172A] tabular-nums">
                          {row.activeTradesCount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-[#334155] tabular-nums">
                          {row.availableVolume.toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                          })}{' '}
                          {row.unit}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#16A36A] tabular-nums">
                          {row.tradedVolume.toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                          })}{' '}
                          {row.unit}
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <div className="font-mono font-semibold text-[#0A172A] tabular-nums">
                            {row.referenceRate
                              ? `${formatINR(row.referenceRate)}/${row.unit}`
                              : 'Upon Enquiry'}
                          </div>
                          <div className="text-[11px] text-[#64748B]">
                            {row.referenceRateSource}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
