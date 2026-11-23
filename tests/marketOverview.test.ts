import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMarketOverviewStats,
  formatVolumeTotals,
} from '../shared/marketOverviewStats.ts';

describe('Public Market Overview Aggregate Statistics', () => {
  const categories = [
    { id: 'cat-plastic', code: 'EPR-PL', name: 'Plastic Waste', shortName: 'Plastic', unit: 'MT' as const, active: true },
    { id: 'cat-ewaste', code: 'EPR-EW', name: 'E-Waste', shortName: 'E-Waste', unit: 'MT' as const, active: true },
    { id: 'cat-oil', code: 'EPR-UO', name: 'Used Oil', shortName: 'Used Oil', unit: 'KL' as const, active: true },
    { id: 'cat-archived', code: 'EPR-OLD', name: 'Archived Category', shortName: 'Old', unit: 'MT' as const, active: false },
  ];

  const publicListings = [
    {
      id: 'LST-1',
      categoryId: 'cat-plastic',
      categoryName: 'Plastic Waste',
      financialYear: 'FY 2025-26',
      listedQty: 500,
      remainingQty: 350,
      unit: 'MT',
      askingRate: 3200,
      status: 'Partially Allocated',
    },
    {
      id: 'LST-2',
      categoryId: 'cat-ewaste',
      categoryName: 'E-Waste',
      financialYear: 'FY 2025-26',
      listedQty: 120,
      remainingQty: 120,
      unit: 'MT',
      askingRate: 6800,
      status: 'Active',
    },
    {
      id: 'LST-3',
      categoryId: 'cat-oil',
      categoryName: 'Used Oil',
      financialYear: 'FY 2024-25',
      listedQty: 80,
      remainingQty: 80,
      unit: 'KL',
      askingRate: 2100,
      status: 'Active',
    },
    {
      id: 'LST-PAUSED',
      categoryId: 'cat-plastic',
      categoryName: 'Plastic Waste',
      financialYear: 'FY 2025-26',
      listedQty: 900,
      remainingQty: 900,
      unit: 'MT',
      askingRate: 3000,
      status: 'Paused',
    },
  ];

  const transactions = [
    {
      id: 'TX-1',
      categoryId: 'cat-plastic',
      categoryName: 'Plastic Waste',
      financialYear: 'FY 2025-26',
      quantity: 150,
      unit: 'MT',
      tradedRate: 3100,
      totalValue: 465000,
    },
    {
      id: 'TX-2',
      categoryId: 'cat-oil',
      categoryName: 'Used Oil',
      financialYear: 'FY 2024-25',
      quantity: 45,
      unit: 'KL',
      tradedRate: 2050,
      totalValue: 92250,
    },
  ];

  const publishedRates = [
    { categoryId: 'cat-plastic', financialYear: 'FY 2025-26', unit: 'MT', rate: 3150, published: true },
    { categoryId: 'cat-ewaste', financialYear: 'FY 2025-26', unit: 'MT', rate: 6900, published: false },
  ];

  const marketRates = [
    { categoryId: 'cat-ewaste', financialYear: 'FY 2025-26', unit: 'MT', availableQty: 120, indicativeRate: 6800 },
    { categoryId: 'cat-oil', financialYear: 'FY 2024-25', unit: 'KL', availableQty: 80, lastTradedRate: 2050 },
  ];

  it('computes accurate Active Trades, Total Volume Traded, and Supported Material Categories across all years', () => {
    const summary = computeMarketOverviewStats({
      categories,
      publicListings,
      transactions,
      publishedRates,
      marketRates,
    });

    // Paused listing excluded -> 3 active trades
    assert.equal(summary.activeTradesCount, 3);
    assert.equal(summary.activeListingCategoriesCount, 3);

    // Inactive category excluded -> 3 supported material categories
    assert.equal(summary.supportedCategoriesCount, 3);
    assert.deepEqual(summary.supportedCategoryNames, ['E-Waste', 'Plastic', 'Used Oil']);

    // Multi-unit volume totals preserved accurately (MT and KL never blindly summed together)
    assert.deepEqual(summary.totalTradedVolumeByUnit, [
      { unit: 'MT', quantity: 150 },
      { unit: 'KL', quantity: 45 },
    ]);
    assert.equal(formatVolumeTotals(summary.totalTradedVolumeByUnit), '150 MT · 45 KL');
    assert.equal(summary.completedTradesCount, 2);
    assert.equal(summary.totalTradedValueINR, 557250);

    // Reference rate precedence: Published Desk > Last Traded > Indicative
    const plasticRow = summary.categoryBreakdown.find((r) => r.categoryId === 'cat-plastic');
    const ewasteRow = summary.categoryBreakdown.find((r) => r.categoryId === 'cat-ewaste');
    const oilRow = summary.categoryBreakdown.find((r) => r.categoryId === 'cat-oil');

    assert.equal(plasticRow?.referenceRate, 3150);
    assert.equal(plasticRow?.referenceRateSource, 'Published Desk');
    assert.equal(ewasteRow?.referenceRate, 6800);
    assert.equal(ewasteRow?.referenceRateSource, 'Indicative');
    assert.equal(oilRow?.referenceRate, 2050);
    assert.equal(oilRow?.referenceRateSource, 'Last Traded');
  });

  it('filters active trades and traded volume cleanly by financial year and handles empty datasets safely', () => {
    const fySummary = computeMarketOverviewStats({
      categories,
      publicListings,
      transactions,
      publishedRates,
      marketRates,
      financialYearFilter: 'FY 2025-26',
    });

    assert.equal(fySummary.activeTradesCount, 2);
    assert.equal(fySummary.completedTradesCount, 1);
    assert.equal(formatVolumeTotals(fySummary.totalTradedVolumeByUnit), '150 MT');
    assert.equal(fySummary.totalTradedValueINR, 465000);

    const emptySummary = computeMarketOverviewStats({
      categories: [],
      publicListings: [],
      transactions: [],
      publishedRates: [],
      marketRates: [],
    });

    assert.equal(emptySummary.activeTradesCount, 0);
    assert.equal(emptySummary.supportedCategoriesCount, 0);
    assert.equal(formatVolumeTotals(emptySummary.totalTradedVolumeByUnit), '0 MT');
    assert.equal(emptySummary.categoryBreakdown.length, 0);
  });
});
