import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __eprDeferredInstallPrompt?: Event | null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__eprDeferredInstallPrompt = event;
  });

  try {
    registerSW({
      immediate: true,
      onRegisterError() {
        // Ignore registration errors in restricted embedded contexts
      },
    });
  } catch {
    // Graceful fallback if service worker registration is unavailable
  }
}

createRoot(document.getElementById('root')!).render(<App />);
