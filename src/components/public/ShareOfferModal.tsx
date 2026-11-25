import React, { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  MapPin,
  Share2,
} from 'lucide-react';
import { Modal, Button } from '../ui/DesignSystem';
import {
  buildOfferOgImageUrl,
  buildSocialShareLinks,
  formatOfferQuantity,
  formatOfferRatePerKg,
  formatValidityDateDisplay,
  SellerOfferBase,
} from '../../../shared/sellerOffers';

interface ShareOfferModalProps {
  offer: SellerOfferBase | null;
  onClose: () => void;
  onCopied?: () => void;
}

export const ShareOfferModal: React.FC<ShareOfferModalProps> = ({
  offer,
  onClose,
  onCopied,
}) => {
  const [copied, setCopied] = useState(false);
  const [ogImageFailed, setOgImageFailed] = useState(false);

  if (!offer) return null;

  const links = buildSocialShareLinks(offer);
  const previewOrigin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : undefined;
  const localOgImageSrc = buildOfferOgImageUrl(offer.id, previewOrigin);

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(links.offerUrl);
      } else {
        const input = document.createElement('textarea');
        input.value = links.offerUrl;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // Fallback silently if clipboard permission denied
    }
  };

  return (
    <Modal
      open={Boolean(offer)}
      onClose={onClose}
      title="Share EPR Selling Offer"
      subtitle={`Offer ID: ${offer.id} · Share directly with verified buyers and networks`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Live Social Media Preview Card */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B] mb-2">
            Social Media Link Preview
          </div>
          <div className="rounded-lg border border-[#E2E8F0] overflow-hidden bg-[#0A172A]">
            {!ogImageFailed ? (
              <img
                src={localOgImageSrc}
                alt={`${offer.materialName} offered at ${formatOfferRatePerKg(offer.sellingRatePerKg)} on ETP – EPR Bazaar`}
                onError={() => setOgImageFailed(true)}
                className="w-full aspect-[1200/630] object-cover block bg-[#0A172A]"
              />
            ) : (
              <div className="p-5 sm:p-6 bg-gradient-to-br from-[#0A172A] via-[#10233F] to-[#0B1D36] text-white space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/assets/aistudio/epr_bazaar_logo_squire__84422abf.png"
                      alt="EPR Bazaar"
                      className="w-9 h-9 rounded bg-white p-1 object-contain"
                    />
                    <div>
                      <div className="text-xs font-bold tracking-wide text-white">ETP – EPR BAZAAR</div>
                      <div className="text-[11px] text-[#94A3B8]">Live EPR Seller Offer</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Selling Rate</div>
                    <div className="font-mono text-xl font-bold text-[#4ADE80] tabular-nums">
                      {formatOfferRatePerKg(offer.sellingRatePerKg)}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#4ADE80]">
                    {offer.categoryName} · {offer.categoryType}
                  </div>
                  <div className="font-display text-lg sm:text-xl font-bold text-white mt-0.5">
                    {offer.materialName}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/10 text-xs">
                  <div>
                    <div className="text-[10px] uppercase text-[#94A3B8]">Available</div>
                    <div className="font-mono font-semibold text-white mt-0.5">
                      {formatOfferQuantity(offer.availableQty, offer.quantityUnit)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-[#94A3B8]">Location</div>
                    <div className="font-medium text-white mt-0.5 inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#4ADE80] shrink-0" />
                      <span className="truncate">{offer.city}, {offer.state}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-[#94A3B8]">Valid Till</div>
                    <div className="font-mono font-semibold text-white mt-0.5">
                      {formatValidityDateDisplay(offer.validityDate)}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-[#94A3B8] truncate pt-1">
                  {links.offerUrl}
                </div>
              </div>
            )}
            <div className="bg-[#F8FAFC] border-t border-[#E2E8F0] px-4 py-3">
              <div className="text-[11px] font-mono text-[#64748B] truncate">etp.eprbazaar.com</div>
              <div className="text-sm font-semibold text-[#0A172A] mt-0.5">
                {offer.materialName} · {formatOfferRatePerKg(offer.sellingRatePerKg)} ({formatOfferQuantity(offer.availableQty, offer.quantityUnit)})
              </div>
              <div className="text-xs text-[#475569] mt-0.5">
                {offer.categoryName} ({offer.categoryType}) · {offer.city}, {offer.state} · Valid till {formatValidityDateDisplay(offer.validityDate)}
              </div>
            </div>
          </div>
        </div>

        {/* Share Platform Buttons */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B] mb-2.5">
            Share Directly On
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <a
              href={links.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 h-10 px-3 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              WhatsApp
              <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
            </a>
            <a
              href={links.facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 h-10 px-3 rounded-lg bg-[#1877F2] hover:bg-[#1565C0] text-white text-xs font-semibold transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              Facebook
              <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
            </a>
            <a
              href={links.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 h-10 px-3 rounded-lg bg-[#0A66C2] hover:bg-[#084D93] text-white text-xs font-semibold transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              LinkedIn
              <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
            </a>
            <a
              href={links.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 h-10 px-3 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              Telegram
              <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
            </a>
          </div>
        </div>

        {/* Copyable Direct Offer Link */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B] mb-1.5">
            Direct Offer URL
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={links.offerUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 h-10 px-3 text-xs font-mono text-[#0A172A] bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
            />
            <Button variant={copied ? 'emerald' : 'primary'} onClick={handleCopyLink}>
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Link Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Link
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
