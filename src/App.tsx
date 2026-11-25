import React, { useEffect, useState } from 'react';
import { MarketplaceProvider, useMarketplace } from './context/MarketplaceContext';
import { PublicWebsite } from './components/public/PublicWebsite';
import { AuthScreens } from './components/auth/AuthScreens';
import { BuyerPortal } from './components/portals/BuyerPortal';
import { SellerPortal } from './components/portals/SellerPortal';
import { FacilitatorPortal } from './components/portals/FacilitatorPortal';
import { AdminPortal } from './components/portals/AdminPortal';
import { ErrorAlertBanner, ToastContainer, WebLoader } from './components/ui/DesignSystem';
import { OfflineIndicator } from './components/ui/PWAInstall';

const AppRouter: React.FC = () => {
  const {
    role,
    publicPage,
    selectedPublicOfferId,
    viewingPublicOfferWhileSignedIn,
    authLoading,
    connectionError,
    toasts,
    dismissToast,
  } = useMarketplace();
  const [initialBootDone, setInitialBootDone] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setInitialBootDone(true), 450);
    return () => window.clearTimeout(timer);
  }, []);

  const authPages = new Set([
    'login',
    'login-error',
    'access-denied',
    'profile-completion',
    'password-reset',
  ]);

  if (authLoading || !initialBootDone) {
    return <WebLoader label="Loading EPR Bazaar..." />;
  }

  if (connectionError && role === 'public' && !authPages.has(publicPage)) {
    return (
      <div className="min-h-screen bg-[#F4F7FB]">
        <div className="max-w-3xl mx-auto px-4 pt-6">
          <ErrorAlertBanner title="Service Connection Required" message={connectionError} />
        </div>
        <PublicWebsite />
        <OfflineIndicator />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  const showSharedOfferView =
    publicPage === 'offer-details' &&
    Boolean(selectedPublicOfferId) &&
    (role === 'public' || viewingPublicOfferWhileSignedIn);

  return (
    <>
      {showSharedOfferView ? (
        <PublicWebsite />
      ) : role === 'buyer' ? (
        <BuyerPortal />
      ) : role === 'seller' ? (
        <SellerPortal />
      ) : role === 'facilitator' ? (
        <FacilitatorPortal />
      ) : role === 'admin' ? (
        <AdminPortal />
      ) : authPages.has(publicPage) ? (
        <PublicWebsite>
          <AuthScreens />
        </PublicWebsite>
      ) : (
        <PublicWebsite />
      )}
      <OfflineIndicator />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
};

export default function App() {
  return (
    <MarketplaceProvider>
      <AppRouter />
    </MarketplaceProvider>
  );
}
