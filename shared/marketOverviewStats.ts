export interface MarketOverviewCategoryInput {
  id: string;
  code: string;
  name: string;
  shortName?: string;
  unit: 'MT' | 'KL' | 'Units';
  active: boolean;
}

export interface MarketOverviewListingInput {
  id: string;
  categoryId: string;
  categoryName: string;
  financialYear: string;
  listedQty: number;
  remainingQty: number;
  unit: string;
  askingRate: number;
  status: string;
}

export interface MarketOverviewTransactionInput {
  id: string;
  categoryId: string;
  categoryName: string;
  financialYear: string;
  quantity: number;
  unit: string;
  tradedRate: number;
  totalValue: number;
}

export interface MarketOverviewPublishedRateInput {
  categoryId: string;
  financialYear: string;
  unit: string;
  rate: number;
  published: boolean;
}

export interface MarketOverviewMarketRateInput {
  categoryId: string;
  financialYear: string;
  unit: string;
  availableQty: number;
  lastTradedRate?: number;
  indicativeRate?: number;
}

export interface UnitVolumeTotal {
  unit: string;
  quantity: number;
}

export interface CategoryMarketBreakdownRow {
  categoryId: string;
  code: string;
  name: string;
  shortName: string;
  unit: string;
  activeTradesCount: number;
  availableVolume: number;
  tradedVolume: number;
  completedTradesCount: number;
  referenceRate: number | null;
  referenceRateSource: 'Published Desk' | 'Last Traded' | 'Indicative' | 'Upon Enquiry';
}

export interface MarketOverviewSummary {
  activeTradesCount: number;
  activeListingCategoriesCount: number;
  availableSupplyByUnit: UnitVolumeTotal[];
  completedTradesCount: number;
  totalTradedVolumeByUnit: UnitVolumeTotal[];
  totalTradedValueINR: number;
  supportedCategoriesCount: number;
  supportedCategoryNames: string[];
  availableFinancialYears: string[];
  categoryBreakdown: CategoryMarketBreakdownRow[];
}

const ACTIVE_LISTING_STATUSES = new Set(['Active', 'Partially Allocated']);

function sumByUnit(entries: { unit: string; quantity: number }[]): UnitVolumeTotal[] {
  const totals = new Map<string, number>();
  for (const item of entries) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const unit = (item.unit || 'MT').trim() || 'MT';
    totals.set(unit, (totals.get(unit) || 0) + qty);
  }
  const unitOrder = ['MT', 'KL', 'Units'];
  return Array.from(totals.entries())
    .map(([unit, quantity]) => ({ unit, quantity: Math.round(quantity * 100) / 100 }))
    .sort((a, b) => {
      const ia = unitOrder.indexOf(a.unit);
      const ib = unitOrder.indexOf(b.unit);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.unit.localeCompare(b.unit);
    });
}

export function formatVolumeTotals(totals: UnitVolumeTotal[], fallbackUnit = 'MT'): string {
  if (totals.length === 0) {
    return `0 ${fallbackUnit}`;
  }
  return totals
    .map((t) => `${t.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${t.unit}`)
    .join(' · ');
}

export function computeMarketOverviewStats(params: {
  categories: MarketOverviewCategoryInput[];
  publicListings: MarketOverviewListingInput[];
  transactions: MarketOverviewTransactionInput[];
  publishedRates: MarketOverviewPublishedRateInput[];
  marketRates: MarketOverviewMarketRateInput[];
  financialYearFilter?: string;
}): MarketOverviewSummary {
  const fyFilter =
    params.financialYearFilter && params.financialYearFilter !== 'ALL'
      ? params.financialYearFilter
      : null;

  const activeCategories = params.categories
    .filter((c) => c.active)
    .sort((a, b) => a.name.localeCompare(b.name));

  const fySet = new Set<string>();
  for (const l of params.publicListings) {
    if (l.financialYear) fySet.add(l.financialYear);
  }
  for (const t of params.transactions) {
    if (t.financialYear) fySet.add(t.financialYear);
  }
  for (const r of params.publishedRates) {
    if (r.published && r.financialYear) fySet.add(r.financialYear);
  }
  const availableFinancialYears = Array.from(fySet).sort().reverse();

  const activeListings = params.publicListings.filter((l) => {
    if (!ACTIVE_LISTING_STATUSES.has(l.status)) return false;
    if (fyFilter && l.financialYear !== fyFilter) return false;
    return true;
  });

  const filteredTransactions = params.transactions.filter((t) => {
    if (fyFilter && t.financialYear !== fyFilter) return false;
    return true;
  });

  const approvedRates = params.publishedRates.filter((r) => {
    if (!r.published) return false;
    if (fyFilter && r.financialYear !== fyFilter) return false;
    return true;
  });

  const filteredMarketRates = params.marketRates.filter((m) => {
    if (fyFilter && m.financialYear !== fyFilter) return false;
    return true;
  });

  const activeListingCategoriesCount = new Set(activeListings.map((l) => l.categoryId)).size;

  const availableSupplyByUnit = sumByUnit(
    activeListings.map((l) => ({ unit: l.unit, quantity: l.remainingQty }))
  );

  const totalTradedVolumeByUnit = sumByUnit(
    filteredTransactions.map((t) => ({ unit: t.unit, quantity: t.quantity }))
  );

  const totalTradedValueINR = filteredTransactions.reduce((sum, t) => {
    const val = Number(t.totalValue);
    return sum + (Number.isFinite(val) && val > 0 ? val : 0);
  }, 0);

  const categoryBreakdown: CategoryMarketBreakdownRow[] = activeCategories.map((cat) => {
    const catListings = activeListings.filter((l) => l.categoryId === cat.id);
    const catTransactions = filteredTransactions.filter((t) => t.categoryId === cat.id);
    const catPublishedRate = approvedRates.find((r) => r.categoryId === cat.id);
    const catMarketRate = filteredMarketRates.find((m) => m.categoryId === cat.id);

    const availableVolumeFromListings = catListings.reduce(
      (sum, l) => sum + (Number.isFinite(l.remainingQty) ? Math.max(0, l.remainingQty) : 0),
      0
    );
    const availableVolume =
      availableVolumeFromListings > 0
        ? Math.round(availableVolumeFromListings * 100) / 100
        : Math.round((catMarketRate?.availableQty || 0) * 100) / 100;

    const tradedVolume = Math.round(
      catTransactions.reduce(
        (sum, t) => sum + (Number.isFinite(t.quantity) ? Math.max(0, t.quantity) : 0),
        0
      ) * 100
    ) / 100;

    let referenceRate: number | null = null;
    let referenceRateSource: CategoryMarketBreakdownRow['referenceRateSource'] = 'Upon Enquiry';

    if (catPublishedRate && Number.isFinite(catPublishedRate.rate) && catPublishedRate.rate > 0) {
      referenceRate = catPublishedRate.rate;
      referenceRateSource = 'Published Desk';
    } else if (
      catMarketRate?.lastTradedRate &&
      Number.isFinite(catMarketRate.lastTradedRate) &&
      catMarketRate.lastTradedRate > 0
    ) {
      referenceRate = catMarketRate.lastTradedRate;
      referenceRateSource = 'Last Traded';
    } else if (
      catMarketRate?.indicativeRate &&
      Number.isFinite(catMarketRate.indicativeRate) &&
      catMarketRate.indicativeRate > 0
    ) {
      referenceRate = catMarketRate.indicativeRate;
      referenceRateSource = 'Indicative';
    }

    return {
      categoryId: cat.id,
      code: cat.code,
      name: cat.name,
      shortName: cat.shortName || cat.name,
      unit: cat.unit,
      activeTradesCount: catListings.length,
      availableVolume,
      tradedVolume,
      completedTradesCount: catTransactions.length,
      referenceRate,
      referenceRateSource,
    };
  });

  return {
    activeTradesCount: activeListings.length,
    activeListingCategoriesCount,
    availableSupplyByUnit,
    completedTradesCount: filteredTransactions.length,
    totalTradedVolumeByUnit,
    totalTradedValueINR: Math.round(totalTradedValueINR),
    supportedCategoriesCount: activeCategories.length,
    supportedCategoryNames: activeCategories.map((c) => c.shortName || c.name),
    availableFinancialYears,
    categoryBreakdown,
  };
}
