import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Monitor,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../../hooks/usePWAInstall';

interface InstallGuideModalProps {
  open: boolean;
  onClose: () => void;
  isInstallable: boolean;
  installing: boolean;
  defaultTab: 'ios' | 'android' | 'desktop';
  isInIframe: boolean;
  onNativeInstall: () => Promise<void>;
  dismissLabel?: string;
}

const InstallGuideModal: React.FC<InstallGuideModalProps> = ({
  open,
  onClose,
  isInstallable,
  installing,
  defaultTab,
  isInIframe,
  onNativeInstall,
  dismissLabel = 'Close',
}) => {
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'desktop'>(defaultTab);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab, open]);

  if (!open) return null;

  const liveAppUrl = 'https://etp.eprbazaar.com/';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      setCopiedUrl(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A172A]/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-app-modal-title"
    >
      <div className="w-full max-w-lg bg-white border border-[#E2E8F0] rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 bg-[#10233F] text-white">
          <div className="flex items-center gap-3">
            <img
              src="/pwa-192x192.png"
              alt="EPR Bazaar App Icon"
              className="w-11 h-11 rounded-lg bg-white p-1 object-contain shrink-0 shadow-sm"
            />
            <div>
              <h3 id="install-app-modal-title" className="font-display text-base font-semibold text-white">
                Install EPR Bazaar App
              </h3>
              <p className="text-xs text-[#CBD5E1] mt-0.5">
                Quick access to live EPR rates, credit trading, and order tracking.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install instructions"
            className="p-1.5 rounded-md text-[#CBD5E1] hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Direct One-Click Install CTA when available */}
          {isInstallable && (
            <div className="p-4 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#065F46]">Instant One-Click Install Ready</div>
                <p className="text-xs text-[#047857] mt-0.5">
                  Tap below to install EPR Bazaar directly on this device for full-screen app access.
                </p>
              </div>
              <button
                type="button"
                disabled={installing}
                onClick={() => void onNativeInstall()}
                className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-[#16A36A] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors cursor-pointer disabled:opacity-60 shrink-0 shadow-sm"
              >
                <Download className="w-4 h-4" />
                {installing ? 'Installing...' : 'Install App Now'}
              </button>
            </div>
          )}

          {/* Device Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F1F5F9] rounded-lg">
            {(
              [
                { id: 'android', label: 'Android', icon: Smartphone },
                { id: 'ios', label: 'iPhone / iPad', icon: Smartphone },
                { id: 'desktop', label: 'Desktop', icon: Monitor },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-white text-[#0A172A] shadow-sm'
                      : 'text-[#64748B] hover:text-[#0A172A]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Step-by-Step Platform Instructions */}
          {activeTab === 'android' && (
            <div className="space-y-3 text-sm text-[#334155]">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Install on Android (Chrome or Edge)
              </div>
              <ol className="space-y-2.5 text-xs sm:text-sm leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#10233F] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Open <strong className="text-[#0A172A]">EPR Bazaar</strong> in Google Chrome or Microsoft Edge.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#10233F] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    Tap the browser menu
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#0A172A]">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </span>
                    in the top-right corner.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#10233F] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Tap <strong className="text-[#0A172A]">Install app</strong> or{' '}
                    <strong className="text-[#0A172A]">Add to Home screen</strong>, then confirm{' '}
                    <strong className="text-[#0A172A]">Install</strong>.
                  </span>
                </li>
              </ol>
            </div>
          )}

          {activeTab === 'ios' && (
            <div className="space-y-3 text-sm text-[#334155]">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Install on iPhone or iPad (Safari)
              </div>
              <ol className="space-y-2.5 text-xs sm:text-sm leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#10233F] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Open <strong className="text-[#0A172A]">EPR Bazaar</strong> in{' '}
                    <strong className="text-[#0A172A]">Safari</strong> on your iPhone or iPad.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#10233F] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    Tap the{' '}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#0A172A] font-medium text-xs">
                      <Share className="w-3.5 h-3.5 text-[#0284C7]" />
                      Share
                    </span>{' '}
                    button in Safari’s bottom toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#10233F] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    Scroll down and tap{' '}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#0A172A] font-medium text-xs">
                      <PlusSquare className="w-3.5 h-3.5" />
                      Add to Home Screen
                    </span>
                    , then tap <strong className="text-[#0A172A]">Add</strong>.
                  </span>
                </li>
              </ol>
            </div>
          )}

          {activeTab === 'desktop' && (
            <div className="space-y-3 text-sm text-[#334155]">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Install on Windows or Mac Desktop
              </div>
              <ol className="space-y-2.5 text-xs sm:text-sm leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#10233F] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    In <strong className="text-[#0A172A]">Google Chrome</strong> or{' '}
                    <strong className="text-[#0A172A]">Microsoft Edge</strong>, look at the right side of the browser
                    address bar and click the <strong className="text-[#0A172A]">Install EPR Bazaar</strong> icon.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#10233F] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Or open the browser menu (<strong className="text-[#0A172A]">⋮</strong>) →{' '}
                    <strong className="text-[#0A172A]">Cast, save, and share</strong> →{' '}
                    <strong className="text-[#0A172A]">Install page as app</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#10233F] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    On <strong className="text-[#0A172A]">macOS Safari</strong>, click{' '}
                    <strong className="text-[#0A172A]">File</strong> →{' '}
                    <strong className="text-[#0A172A]">Add to Dock</strong>.
                  </span>
                </li>
              </ol>
            </div>
          )}

          {/* Embedded Preview Note */}
          {isInIframe && !isInstallable && (
            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#475569] space-y-2">
              <div className="font-semibold text-[#0A172A]">Opening in a standalone browser tab</div>
              <p>
                App installation prompts are triggered when visiting the portal directly in your browser tab rather than
                an embedded frame.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={typeof window !== 'undefined' ? window.location.href : liveAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#10233F] text-white font-medium hover:bg-[#0A172A] transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Direct Link
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopyLink()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#CBD5E1] bg-white text-[#0A172A] font-medium hover:bg-[#F1F5F9] cursor-pointer"
                >
                  {copiedUrl ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#16A36A]" />
                      Link Copied
                    </>
                  ) : (
                    'Copy Portal Link'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* App Benefits */}
          <div className="pt-3 border-t border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-[#475569]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#16A36A] shrink-0" />
              <span>One-tap home launch</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#16A36A] shrink-0" />
              <span>Full-screen workspace</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#16A36A] shrink-0" />
              <span>Fast cached loading</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-[#CBD5E1] bg-white text-xs font-semibold text-[#10233F] hover:bg-[#F1F5F9] cursor-pointer"
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const PWAInstallButton: React.FC<{
  variant?: 'header' | 'mobile-menu' | 'portal' | 'sidebar' | 'footer';
  className?: string;
}> = ({ variant = 'header', className = '' }) => {
  const { isInstallable, isInstalled, installing, install, platform, isInIframe } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Automatically suppress install UI when running as an installed standalone app
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const result = await install();
      if (result === 'unavailable') {
        setShowGuide(true);
      }
      return;
    }
    setShowGuide(true);
  };

  const handleNativeInstallFromModal = async () => {
    const result = await install();
    if (result === 'accepted') {
      setShowGuide(false);
    }
  };

  let buttonEl: React.ReactNode;

  if (variant === 'mobile-menu') {
    buttonEl = (
      <button
        type="button"
        disabled={installing}
        onClick={() => void handleClick()}
        className={`w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] text-sm font-semibold text-[#10233F] hover:bg-[#F1F5F9] transition-colors cursor-pointer ${className}`}
      >
        <Download className="w-4 h-4 text-[#16A36A]" />
        <span>{installing ? 'Installing...' : 'Install EPR Bazaar App'}</span>
      </button>
    );
  } else if (variant === 'portal') {
    buttonEl = (
      <button
        type="button"
        disabled={installing}
        onClick={() => void handleClick()}
        className={`inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-lg border border-[#CBD5E1] bg-white text-xs font-semibold text-[#10233F] hover:bg-[#F8FAFC] hover:border-[#94A3B8] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${className}`}
        title="Install EPR Bazaar App on this device"
      >
        <Download className="w-3.5 h-3.5 text-[#16A36A]" />
        <span className="hidden sm:inline">{installing ? 'Installing...' : 'Install App'}</span>
      </button>
    );
  } else if (variant === 'sidebar') {
    buttonEl = (
      <button
        type="button"
        disabled={installing}
        onClick={() => void handleClick()}
        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-white bg-[#16A36A] hover:bg-[#15803D] transition-colors cursor-pointer ${className}`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>{installing ? 'Installing...' : 'Install App'}</span>
      </button>
    );
  } else if (variant === 'footer') {
    buttonEl = (
      <button
        type="button"
        disabled={installing}
        onClick={() => void handleClick()}
        className={`inline-flex items-center gap-2 mt-2 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer ${className}`}
      >
        <Download className="w-3.5 h-3.5 text-[#4ADE80]" />
        <span>{installing ? 'Installing...' : 'Install Mobile & Desktop App'}</span>
      </button>
    );
  } else {
    buttonEl = (
      <button
        type="button"
        disabled={installing}
        onClick={() => void handleClick()}
        className={`inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-3 sm:px-3.5 rounded-lg border border-[#CBD5E1] bg-white text-xs sm:text-sm font-semibold text-[#10233F] hover:bg-[#F8FAFC] hover:border-[#94A3B8] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${className}`}
        title="Install EPR Bazaar App"
      >
        <Download className="w-4 h-4 text-[#16A36A]" />
        <span>{installing ? 'Installing...' : 'Install App'}</span>
      </button>
    );
  }

  return (
    <>
      {buttonEl}
      <InstallGuideModal
        open={showGuide}
        onClose={() => setShowGuide(false)}
        isInstallable={isInstallable}
        installing={installing}
        defaultTab={platform}
        isInIframe={isInIframe}
        onNativeInstall={handleNativeInstallFromModal}
      />
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-[#D97706] px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode — Showing saved pages until connection returns.</span>
    </div>
  );
};
