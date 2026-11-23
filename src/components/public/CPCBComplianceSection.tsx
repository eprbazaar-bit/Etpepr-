import React from 'react';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/DesignSystem';

interface CPCBComplianceSectionProps {
  onOpenBuyerGuidelines: () => void;
  onOpenSellerGuidelines: () => void;
  onOpenDisclaimer: () => void;
}

const CPCB_FRAMEWORKS = [
  {
    stream: 'Plastic Waste',
    regulation: 'Plastic Waste Management (PWM) Rules, 2016 & Amendments',
    scope: 'Categories I, II, III & IV (Rigid, Flexible, MLP, Compostable)',
    status: 'Aligned',
  },
  {
    stream: 'E-Waste',
    regulation: 'E-Waste (Management) Rules, 2022',
    scope: 'Registered recyclers & PIBOs across notified electrical/electronic codes',
    status: 'Aligned',
  },
  {
    stream: 'Battery Waste',
    regulation: 'Battery Waste Management Rules, 2022',
    scope: 'Portable, Automotive, Industrial & EV battery EPR obligations',
    status: 'Aligned',
  },
  {
    stream: 'Waste Tyre',
    regulation: 'Hazardous & Other Wastes (Management) Amendment Rules, 2022',
    scope: 'Authorized waste tyre recyclers, producers & importers',
    status: 'Aligned',
  },
  {
    stream: 'Used Oil',
    regulation: 'Hazardous & Other Wastes (Second Amendment) Rules, 2023',
    scope: 'Registered re-refiners, processors & bulk oil producers/importers',
    status: 'Aligned',
  },
] as const;

const COMPLIANCE_PILLARS = [
  {
    index: '01.',
    title: 'Mandatory KYC, GSTIN & EPR Registration Checks',
    description:
      'Every participating Producer, Importer, Brand Owner (PIBO), and Recycler submits corporate KYC, GSTIN, and applicable CPCB or SPCB EPR registration details for verification desk review.',
  },
  {
    index: '02.',
    title: 'CPCB Category, Subcategory & Financial Year Alignment',
    description:
      'Credit listings, buyer requirements, and reference rate schedules strictly follow CPCB-notified material categories, subcategories, and annual financial year compliance cycles.',
  },
  {
    index: '03.',
    title: 'Audit-Ready Commercial & GST Documentation',
    description:
      'Chronological negotiation logs, confirmed order terms, GST tax invoices, and compliance uploads are maintained systematically to support internal audits and statutory reporting.',
  },
  {
    index: '04.',
    title: 'Transparent Private Facilitation Scope',
    description:
      'ETP – EPR Bazaar operates as a private B2B managed marketplace by Nyanvi EcoClean Private Limited. Official statutory credit transfers and annual compliance returns are completed directly on the Government CPCB EPR Portal.',
  },
] as const;

export const CPCBComplianceSection: React.FC<CPCBComplianceSectionProps> = ({
  onOpenBuyerGuidelines,
  onOpenSellerGuidelines,
  onOpenDisclaimer,
}) => {
  return (
    <section
      id="cpcb-compliance-status"
      aria-labelledby="cpcb-compliance-heading"
      className="bg-white border-t border-[#E2E8F0] scroll-mt-24"
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-14">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-[#E2E8F0]">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#15803D]">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>CPCB Compliance Status</span>
              <span aria-hidden="true" className="text-[#94A3B8]">
                ·
              </span>
              <span className="font-mono text-[#0A172A] tabular-nums">FY 2025–26</span>
            </div>
            <h2
              id="cpcb-compliance-heading"
              className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#0A172A] mt-1.5 text-balance"
            >
              Aligned with Current CPCB EPR Guidelines
            </h2>
            <p className="text-sm text-[#475569] mt-1.5 leading-relaxed">
              EPR Bazaar structures participant onboarding, credit discovery, and transaction records around current Ministry of Environment, Forest and Climate Change (MoEFCC) and Central Pollution Control Board (CPCB) Extended Producer Responsibility norms.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button variant="secondary" size="sm" onClick={onOpenBuyerGuidelines}>
              Buyer Guidelines
            </Button>
            <Button variant="secondary" size="sm" onClick={onOpenSellerGuidelines}>
              Seller Guidelines
            </Button>
          </div>
        </div>

        {/* Single-Elevation Two-Column Institutional Compliance Grid */}
        <div className="mt-6 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-[0_1px_2px_0_rgba(16,35,63,0.04)]">
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0]">
            {/* Left Column: 4 Numbered Compliance Standards */}
            <div className="lg:col-span-7 p-6 sm:p-8">
              <div className="text-xs font-semibold text-[#64748B] pb-4 border-b border-[#F1F5F9]">
                Platform Verification &amp; Governance Standards
              </div>
              <ol className="divide-y divide-[#F1F5F9]">
                {COMPLIANCE_PILLARS.map((pillar) => (
                  <li key={pillar.index} className="py-4 first:pt-4 last:pb-0">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs font-semibold text-[#16A36A] tabular-nums shrink-0">
                        {pillar.index}
                      </span>
                      <div>
                        <h3 className="font-display text-sm sm:text-base font-semibold text-[#0A172A]">
                          {pillar.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-[#475569] mt-1 leading-relaxed">
                          {pillar.description}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Right Column: Supported CPCB EPR Regulatory Frameworks */}
            <div className="lg:col-span-5 bg-[#F8FAFC] p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 pb-4 border-b border-[#E2E8F0]">
                  <h3 className="font-display text-sm font-semibold text-[#0A172A]">
                    Notified CPCB EPR Frameworks Covered
                  </h3>
                  <span className="font-mono text-xs font-semibold text-[#15803D] tabular-nums shrink-0">
                    5 Streams
                  </span>
                </div>

                <ul className="divide-y divide-[#E2E8F0]">
                  {CPCB_FRAMEWORKS.map((item) => (
                    <li key={item.stream} className="py-3.5 first:pt-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold text-[#0A172A]">{item.stream}</span>
                        <span className="text-xs font-semibold text-[#15803D] shrink-0">
                          {item.status}
                        </span>
                      </div>
                      <div className="text-xs text-[#334155] mt-0.5">{item.regulation}</div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">{item.scope}</div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 text-xs text-[#475569]">
                <span>Operated by Nyanvi EcoClean Private Limited</span>
                <button
                  type="button"
                  onClick={onOpenDisclaimer}
                  className="font-semibold text-[#0A172A] hover:text-[#16A36A] transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Regulatory Disclaimer
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
