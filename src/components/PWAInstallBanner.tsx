import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, Share2, PlusSquare, CheckCircle2, WifiOff } from 'lucide-react';
import AppLogo from './AppLogo';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    // Connection status listener
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Detect if app is already running in PWA standalone mode
    const checkStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    setIsStandalone(checkStandalone);

    // Detect iOS browser
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // Check if user previously dismissed the banner recently
    const lastDismissed = localStorage.getItem('pwa_banner_dismissed');
    const isRecentlyDismissed = lastDismissed && (Date.now() - parseInt(lastDismissed, 10)) < (1000 * 60 * 60 * 24 * 3); // 3 days hide

    if (!checkStandalone && !isRecentlyDismissed) {
      if (isIosDevice) {
        setShowBanner(true);
      }
    }

    // Android/Chrome beforeinstallprompt listener
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!checkStandalone && !isRecentlyDismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the PWA install prompt');
      }
      setDeferredPrompt(null);
      setShowBanner(false);
    } else if (isIOS) {
      setShowIOSModal(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa_banner_dismissed', Date.now().toString());
  };

  if (isStandalone) {
    return isOffline ? (
      <div className="bg-amber-600 text-white text-xs font-semibold px-4 py-2 text-center flex items-center justify-center gap-2 shadow-md z-50">
        <WifiOff size={15} />
        <span>Anda sedang offline. Data akan disinkronkan kembali saat terhubung internet.</span>
      </div>
    ) : null;
  }

  return (
    <>
      {/* Offline Alert Bar */}
      {isOffline && (
        <div className="bg-amber-600 text-white text-xs font-semibold px-4 py-2 text-center flex items-center justify-center gap-2 shadow-md z-50">
          <WifiOff size={15} />
          <span>Anda sedang offline. Aplikasi tetap bisa diakses dalam mode PWA.</span>
        </div>
      )}

      {/* Floating Bottom PWA Install Banner */}
      {showBanner && (
        <div className="fixed bottom-16 md:bottom-6 left-3 right-3 md:left-auto md:right-6 md:max-w-md bg-slate-900/95 backdrop-blur-xl border border-blue-500/30 text-white p-4 rounded-2xl shadow-2xl z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 p-1 shadow-inner">
                <AppLogo size={36} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="font-extrabold text-sm text-slate-100">Pasang Aplikasi di HP</h4>
                  <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold rounded text-[9px] uppercase">PWA</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                  Pasang di Layar Utama HP untuk akses presensi lebih cepat & responsif.
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Tutup"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3.5 flex items-center gap-2">
            <button
              onClick={handleInstallClick}
              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all active:scale-95 cursor-pointer"
            >
              <Download size={15} />
              <span>{isIOS ? 'Petunjuk Pasang di iPhone' : 'Pasang Aplikasi Sekarang'}</span>
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Nanti
            </button>
          </div>
        </div>
      )}

      {/* iOS Safari Guide Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-sm w-full p-6 shadow-2xl relative space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Smartphone size={24} />
              </div>
              <div>
                <h3 className="font-extrabold text-base">Cara Pasang di iPhone</h3>
                <p className="text-xs text-slate-400">Ikuti 3 langkah mudah berikut:</p>
              </div>
            </div>

            <div className="space-y-3 bg-slate-950 p-4 rounded-2xl border border-slate-800/80 text-xs text-slate-300">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <p className="font-semibold text-white">Ketuk tombol Berbagi (Share)</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Ketuk ikon <Share2 size={13} className="inline text-blue-400 mx-0.5" /> di bagian bawah layar Safari iPhone Anda.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <p className="font-semibold text-white">Pilih "Tambah ke Layar Utama"</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Gulir menu pilihan ke bawah lalu pilih opsi <PlusSquare size={13} className="inline text-emerald-400 mx-0.5" /> <strong>Add to Home Screen</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <p className="font-semibold text-white">Ketuk "Tambah" di Kanan Atas</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Selesai! Ikon aplikasi <strong>Presensi 162</strong> akan muncul di layar utama iPhone Anda.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-3 rounded-2xl text-xs transition-all shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}
