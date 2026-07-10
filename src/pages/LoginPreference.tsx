import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import AppLogo from '../components/AppLogo';
import { 
  Shield, 
  Lock, 
  Smartphone, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Sparkles, 
  CheckCircle2, 
  X,
  Keyboard
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function LoginPreference() {
  const { user, dbUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'choice' | 'setup_pin' | 'confirm_pin'>('choice');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  // Keyboard listener for physical numeric keyboard input
  useEffect(() => {
    if (step === 'choice') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        const num = e.key;
        if (step === 'setup_pin' && pin.length < 6) {
          setPin(prev => prev + num);
        } else if (step === 'confirm_pin' && confirmPin.length < 6) {
          setConfirmPin(prev => prev + num);
        }
      } else if (e.key === 'Backspace') {
        if (step === 'setup_pin') {
          setPin(prev => prev.slice(0, -1));
        } else if (step === 'confirm_pin') {
          setConfirmPin(prev => prev.slice(0, -1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, pin, confirmPin]);

  // Handle auto-submit/transition when PIN lengths hit 6 digits
  useEffect(() => {
    if (step === 'setup_pin' && pin.length === 6) {
      const timer = setTimeout(() => {
        setStep('confirm_pin');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pin, step]);

  useEffect(() => {
    if (step === 'confirm_pin' && confirmPin.length === 6) {
      const timer = setTimeout(() => {
        savePinPreference();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [confirmPin, step]);

  // Protect route just in case
  if (!user) {
    return null;
  }

  const handleNumpadClick = (num: string) => {
    if (step === 'setup_pin') {
      if (pin.length < 6) setPin(prev => prev + num);
    } else if (step === 'confirm_pin') {
      if (confirmPin.length < 6) setConfirmPin(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    if (step === 'setup_pin') {
      setPin(prev => prev.slice(0, -1));
    } else if (step === 'confirm_pin') {
      setConfirmPin(prev => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (step === 'setup_pin') {
      setPin('');
    } else if (step === 'confirm_pin') {
      setConfirmPin('');
    }
  };

  const savePasswordPreference = async () => {
    setLoading(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        loginMethod: 'password'
      });
      toast.success('Preferensi berhasil disimpan! Anda akan tetap menggunakan kata sandi.');
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan preferensi. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const savePinPreference = async () => {
    if (pin !== confirmPin) {
      toast.error('PIN tidak cocok! Silakan coba lagi.');
      setConfirmPin('');
      setStep('setup_pin');
      setPin('');
      return;
    }

    setLoading(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        pin: pin,
        loginMethod: 'pin'
      });
      toast.success('PIN 6-Digit berhasil dibuat! Selamat menggunakan metode login baru.');
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan PIN Anda.');
    } finally {
      setLoading(false);
    }
  };

  const activeDots = step === 'setup_pin' ? pin.length : confirmPin.length;

  return (
    <div className="min-h-screen bg-gradient-to-tr from-[#EBF4FF] via-[#F4F9FE] to-[#EFF6FF] font-sans flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      
      {/* WALASUJI DIAMOND LATTICE */}
      <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="preference-walasuji" width="100" height="100" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="100" y2="0" stroke="#2563EB" strokeWidth="1" />
            <line x1="0" y1="0" x2="0" y2="100" stroke="#0EA5E9" strokeWidth="1" />
            <circle cx="0" cy="0" r="3" fill="#2563EB" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#preference-walasuji)" />
      </svg>

      <div className="w-full max-w-md bg-white/90 backdrop-blur-2xl rounded-3xl border border-blue-100 shadow-[0_20px_50px_-12px_rgba(37,99,235,0.12)] p-8 relative overflow-hidden transition-all duration-500">
        
        {/* Shimmering Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-blue-600 via-sky-400 to-indigo-600 bg-[length:200%_auto] animate-[shimmer_8s_linear_infinite]" />

        {step === 'choice' && (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center">
              <div className="bg-blue-100 text-blue-600 p-4 rounded-full mb-4 animate-bounce">
                <Shield size={36} />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display mb-2">
                Metode Login PIN Telah Hadir! ✨
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
                Halo <span className="font-bold text-slate-800">{dbUser?.nama}</span>, kini aplikasi mendukung login super praktis menggunakan <strong>PIN 6-Digit</strong>. Pilih metode keamanan yang paling nyaman untuk Anda.
              </p>
            </div>

            {/* CHOICE BUTTONS */}
            <div className="space-y-4">
              {/* Option 1: PIN (Recommended) */}
              <button
                onClick={() => setStep('setup_pin')}
                className="w-full text-left p-5 bg-gradient-to-br from-blue-50 to-sky-50/50 hover:from-blue-100/70 hover:to-sky-100/70 border border-blue-200/60 rounded-2xl flex items-start gap-4 transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer relative group"
              >
                <div className="bg-blue-600 text-white p-2.5 rounded-xl mt-0.5 shadow-md shadow-blue-500/20">
                  <Smartphone size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-slate-800">Buat PIN 6-Digit</span>
                    <span className="bg-emerald-100 text-emerald-700 text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md">
                      Rekomendasi
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-normal">
                    Masuk lebih cepat dengan numpad visual di layar hp tanpa perlu mengetik kata sandi teks Anda.
                  </p>
                </div>
                <ArrowRight size={16} className="text-blue-500 mt-3 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Option 2: Password */}
              <button
                onClick={savePasswordPreference}
                disabled={loading}
                className="w-full text-left p-5 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/60 rounded-2xl flex items-start gap-4 transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer relative group"
              >
                <div className="bg-slate-500 text-white p-2.5 rounded-xl mt-0.5">
                  <Lock size={20} />
                </div>
                <div className="flex-1">
                  <span className="font-bold text-sm text-slate-800">Tetap Gunakan Kata Sandi</span>
                  <p className="text-xs text-slate-500 mt-1 leading-normal">
                    Gunakan sandi keamanan teks biasa seperti yang sudah ada sebelumnya. Anda bisa merubahnya kapan saja.
                  </p>
                </div>
                <ArrowRight size={16} className="text-slate-400 mt-3 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            <div className="text-center text-[10px] text-slate-400 font-mono">
              Anda selalu dapat mengubah preferensi login Anda di menu Profil Saya.
            </div>
          </div>
        )}

        {/* PIN CODE INPUT/CONFIRMATION SCREENS */}
        {(step === 'setup_pin' || step === 'confirm_pin') && (
          <div className="space-y-6">
            
            {/* Header section with back button */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  if (step === 'confirm_pin') {
                    setConfirmPin('');
                    setStep('setup_pin');
                  } else {
                    setPin('');
                    setStep('choice');
                  }
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <ArrowLeft size={18} />
              </button>
              <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                {step === 'setup_pin' ? 'Langkah 1 dari 2' : 'Konfirmasi PIN'}
              </span>
            </div>

            <div className="text-center">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight font-display mb-1">
                {step === 'setup_pin' ? 'Buat PIN 6-Digit' : 'Konfirmasi PIN Anda'}
              </h2>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                {step === 'setup_pin' 
                  ? 'Gunakan angka yang mudah Anda ingat.' 
                  : 'Ketik ulang 6 angka PIN Anda untuk konfirmasi.'}
              </p>
            </div>

            {/* PIN Dots display indicator */}
            <div className="flex justify-center items-center gap-4 py-4">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const filled = idx < activeDots;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                      filled
                        ? 'bg-blue-600 border-blue-600 scale-125 shadow-md shadow-blue-400/50'
                        : 'border-slate-300 bg-transparent'
                    }`}
                  />
                );
              })}
            </div>

            {/* SLEEK NUMPAD VISUAL */}
            <div className="max-w-xs mx-auto">
              <div className="grid grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleNumpadClick(num)}
                    className="h-14 bg-slate-50 hover:bg-blue-50 border border-slate-200/50 hover:border-blue-200 active:scale-95 text-slate-800 hover:text-blue-700 font-extrabold text-lg rounded-2xl flex items-center justify-center transition-all duration-150 cursor-pointer shadow-sm"
                  >
                    {num}
                  </button>
                ))}
                
                {/* Clear button */}
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-14 text-slate-400 hover:text-red-500 hover:bg-red-50 active:scale-95 rounded-2xl flex items-center justify-center transition-all duration-150 cursor-pointer"
                >
                  <X size={18} />
                </button>

                {/* 0 button */}
                <button
                  type="button"
                  onClick={() => handleNumpadClick('0')}
                  className="h-14 bg-slate-50 hover:bg-blue-50 border border-slate-200/50 hover:border-blue-200 active:scale-95 text-slate-800 hover:text-blue-700 font-extrabold text-lg rounded-2xl flex items-center justify-center transition-all duration-150 cursor-pointer shadow-sm"
                >
                  0
                </button>

                {/* Backspace button */}
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="h-14 text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 rounded-2xl flex items-center justify-center transition-all duration-150 cursor-pointer"
                >
                  <Keyboard size={18} />
                </button>
              </div>
            </div>

            <p className="text-center text-[10px] text-slate-400 font-mono mt-2">
              Dapat diketik juga melalui keyboard fisik Anda
            </p>
          </div>
        )}

      </div>

      <p className="text-[10px] tracking-[0.25em] text-slate-500 font-semibold font-mono mt-8 uppercase text-center max-w-xs leading-relaxed">
        Siri' Na Pacce • Integrity & Pride<br />
        US Bilibili 162 Security Consolidation
      </p>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}
