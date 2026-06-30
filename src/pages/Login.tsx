import React, { useState } from 'react';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Building2, 
  Smartphone, 
  Lock, 
  User, 
  KeyRound, 
  ArrowRight, 
  Sparkles, 
  Send, 
  ArrowLeft, 
  RefreshCw, 
  Briefcase, 
  Eye, 
  EyeOff,
  Cpu,
  BadgeCheck
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function Login() {
  const [waNumber, setWaNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const { user, login } = useAuth();

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    
    const cleanWaNumber = waNumber.replace(/\D/g, '');

    try {
      if (isForgotPassword) {
         const infoMsg = 'Silakan hubungi HR atau Administrator untuk mereset password Anda.';
         setMessage(infoMsg);
         toast.success(infoMsg, { duration: 5000 });
         setIsForgotPassword(false);
      } else if (isRegister) {
         const q = query(collection(db, "users"), where("waNumber", "==", cleanWaNumber));
         const querySnapshot = await getDocs(q);
         
         if (!querySnapshot.empty) {
            throw new Error('Nomor WA sudah terdaftar. Silakan klik "Masuk di sini" untuk login.');
         }

         const isAdmin = cleanWaNumber === '081234567890';
         const userId = `wa-${cleanWaNumber}`;
         
         const userData = {
            waNumber: cleanWaNumber,
            password: password,
            nama: isAdmin ? 'Administrator' : `User ${cleanWaNumber}`,
            role: isAdmin ? 'admin' : 'karyawan',
            jabatan: isAdmin ? 'HR Manager' : 'Staff',
            divisi: isAdmin ? 'Human Resources' : 'General',
         };
         
         await setDoc(doc(db, "users", userId), userData);
         toast.success('Pendaftaran berhasil! Selamat datang.');
         login({ uid: userId, ...userData });
      } else {
         const q = query(collection(db, "users"), where("waNumber", "==", cleanWaNumber));
         const querySnapshot = await getDocs(q);
         
         if (querySnapshot.empty) {
            throw new Error('Nomor WA atau password salah.');
         }
         
         const userDoc = querySnapshot.docs[0];
         const userData = userDoc.data();
         
         if (userData.password !== password) {
            throw new Error('Nomor WA atau password salah.');
         }
         
         toast.success(`Selamat datang kembali, ${userData.nama || 'Karyawan'}!`);
         login({ uid: userDoc.id, ...userData });
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan.');
      toast.error(err.message || 'Terjadi kesalahan saat otentikasi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-[#EBF4FF] via-[#F4F9FE] to-[#EFF6FF] font-sans flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      
      {/* 1. Cyber Bugis-Walasuji Diamond Lattice Pattern Background (Elegant Light Blue Theme) */}
      <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="cyber-walasuji-light" width="100" height="100" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="100" y2="0" stroke="#2563EB" strokeWidth="1" />
            <line x1="0" y1="0" x2="0" y2="100" stroke="#0EA5E9" strokeWidth="1" />
            <rect x="15" y="15" width="70" height="70" fill="none" stroke="#2563EB" strokeWidth="0.75" strokeDasharray="3 6" />
            <rect x="35" y="35" width="30" height="30" fill="none" stroke="#0EA5E9" strokeWidth="0.75" />
            <circle cx="0" cy="0" r="3" fill="#2563EB" />
            <circle cx="50" cy="50" r="2.5" fill="#0EA5E9" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cyber-walasuji-light)" />
      </svg>

      {/* 2. Soft Bright Blue & Indigo Background Accents */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-300/30 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-200/30 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '2.5s' }}></div>

      {/* 3. Luxury Sulawesi Batik Woodcarving Corners (Border Elements - Royal Blue Edition) */}
      <div className="absolute top-6 left-6 opacity-40 hidden md:block">
        <svg width="120" height="120" viewBox="0 0 100 100" fill="none" stroke="#2563EB" strokeWidth="1.75">
          {/* Interlocking continuous curves (Sekong motif) */}
          <path d="M 0,0 L 40,40 M 10,0 L 50,40 M 0,10 L 40,50" />
          <path d="M 100,0 L 60,40 M 90,0 L 50,40 M 100,10 L 60,50" />
          <rect x="42" y="42" width="16" height="16" stroke="#0EA5E9" strokeWidth="1" strokeDasharray="2" />
        </svg>
      </div>
      <div className="absolute bottom-6 right-6 opacity-40 hidden md:block">
        <svg width="120" height="120" viewBox="0 0 100 100" fill="none" stroke="#0EA5E9" strokeWidth="1.75">
          <path d="M 100,100 L 60,60 M 90,100 L 50,60 M 100,90 L 60,50" />
          <path d="M 0,100 L 40,60 M 10,100 L 50,60 M 0,90 L 40,50" />
          <rect x="42" y="42" width="16" height="16" stroke="#2563EB" strokeWidth="1" strokeDasharray="2" />
        </svg>
      </div>

      {/* Main Glassmorphic Card Container in Premium Off-White / Crisp White with Blue Shadow */}
      <div id="login-card" className="w-full max-w-md bg-white/90 backdrop-blur-2xl rounded-3xl border border-blue-100 shadow-[0_20px_50px_-12px_rgba(37,99,235,0.12)] p-8 relative overflow-hidden transition-all duration-500 hover:shadow-[0_24px_60px_-10px_rgba(37,99,235,0.18)] hover:border-blue-200/60">
        
        {/* Elegant top border accent line with blue luxury gradient */}
        <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-blue-600 via-sky-400 to-indigo-600 bg-[length:200%_auto] animate-[shimmer_8s_linear_infinite]" />

        {/* Brand / Logo Section */}
        <div className="flex flex-col items-center mb-8">
          
          {/* Animated Toraja "Paqbarre Allo" (Sun Carving) Emblem with deep royal blue highlights */}
          <div className="relative mb-4 group cursor-pointer">
            {/* Outer soft glow ring */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-400 to-sky-400 blur-md opacity-30 group-hover:opacity-50 transition-opacity duration-500" />
            <div className="relative w-24 h-24 rounded-full bg-blue-50 border border-blue-200/60 flex items-center justify-center overflow-hidden shadow-inner">
              <svg viewBox="0 0 100 100" className="w-20 h-20 text-blue-700 drop-shadow-[0_2px_4px_rgba(29,78,216,0.15)] transition-all duration-300 group-hover:scale-105" fill="none" stroke="currentColor" strokeWidth="1.5">
                {/* Outer spinning dashed ring */}
                <circle cx="50" cy="50" r="45" stroke="#0EA5E9" strokeWidth="1" strokeDasharray="6 3" className="animate-[spin_40s_linear_infinite]" />
                {/* Inner gears */}
                <circle cx="50" cy="50" r="34" stroke="#1D4ED8" strokeWidth="1.2" />
                <circle cx="50" cy="50" r="24" stroke="#0EA5E9" strokeWidth="1" />
                {/* Central shining node */}
                <circle cx="50" cy="50" r="5" fill="#1D4ED8" className="animate-pulse" />
                
                {/* Sunrays (Triangular traditional elements) */}
                <path d="M50,4 L50,16 M50,84 L50,96 M4,50 L16,50 M84,50 L96,50" stroke="#1D4ED8" strokeWidth="2.5" />
                <path d="M17,17 L26,26 M74,74 L83,83 M17,74 L26,65 M74,17 L83,26" stroke="#0EA5E9" strokeWidth="1.5" />
                
                {/* Elegant central star points */}
                <polygon points="50,22 46,32 54,32" fill="#1D4ED8" opacity="0.9" />
                <polygon points="50,78 46,68 54,68" fill="#1D4ED8" opacity="0.9" />
                <polygon points="22,50 32,46 32,54" fill="#0EA5E9" opacity="0.9" />
                <polygon points="78,50 68,46 68,54" fill="#0EA5E9" opacity="0.9" />
              </svg>
            </div>
          </div>

          <h1 className="text-3xl font-bold font-display text-center text-slate-900 tracking-wide flex flex-col items-center gap-1">
            <span className="text-sm font-mono font-bold tracking-widest text-blue-600 bg-blue-100 px-2.5 py-0.5 rounded-md">HADIR 162</span>
            <span className="text-2xl font-extrabold tracking-tight">US BILIBILI 162</span>
          </h1>
          <p className="text-center text-[10px] text-slate-500 mt-1.5 max-w-xs uppercase tracking-widest font-mono font-semibold">
            {isForgotPassword ? 'Pemulihan Kredensial' : isRegister ? 'Sistem Pendaftaran Anggota' : 'Presensi Karyawan US Bilibili 162'}
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleAuth} className="space-y-5">
          
          {/* WA Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 font-mono flex items-center gap-1">
              <Smartphone size={13} className="text-blue-600" />
              <span>Nomor WhatsApp</span>
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
                <Smartphone size={18} />
              </div>
              <input 
                type="tel" 
                required
                value={waNumber}
                onChange={(e) => setWaNumber(e.target.value)}
                className="w-full bg-slate-50 text-slate-900 placeholder-slate-400 text-sm pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all duration-300 font-mono shadow-sm"
                placeholder="0812XXXXXXXX"
              />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/5 to-sky-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none -z-10" />
            </div>
          </div>

          {/* Password Input */}
          {!isForgotPassword && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono flex items-center gap-1">
                  <Lock size={13} className="text-blue-600" />
                  <span>Sandi Keamanan</span>
                </label>
                {!isRegister && (
                  <button 
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setError('');
                      setMessage('');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold font-mono tracking-wide transition-colors"
                  >
                    Lupa Sandi?
                  </button>
                )}
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
                  <KeyRound size={18} />
                </div>
                <input 
                  type={showPassword ? "text" : "password"} 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 placeholder-slate-400 text-sm pl-11 pr-11 py-3.5 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all duration-300 shadow-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/5 to-sky-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none -z-10" />
              </div>
            </div>
          )}
          
          {/* Error and Info Alerts */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-2xl flex items-start gap-2 font-mono shadow-sm">
              <span className="mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}
          {message && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-2xl flex items-start gap-2 font-mono shadow-sm">
              <BadgeCheck size={16} className="text-emerald-600 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}
          
          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full relative group overflow-hidden bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white font-bold font-display tracking-wider py-4 rounded-2xl hover:shadow-[0_12px_24px_rgba(37,99,235,0.25)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer uppercase text-xs shadow-md"
          >
            {/* Glossy glare effect */}
            <div className="absolute inset-0 w-1/2 h-full bg-white/20 transform -skew-x-12 -translate-x-full group-hover:animate-[shine_1.5s_ease-in-out_infinite]" />
            
            {loading ? (
              <>
                <RefreshCw size={16} className="animate-spin text-white" />
                <span>Mensinkronisasi...</span>
              </>
            ) : (
              <>
                <span>{isForgotPassword ? 'Kirim Reset Kunci' : isRegister ? 'Daftar Sistem' : 'Otentikasi Masuk'}</span>
                <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
        
        {/* Toggle Footer */}
        <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-500 font-mono">
          {isForgotPassword ? (
            <button 
              onClick={() => {
                setIsForgotPassword(false);
                setError('');
                setMessage('');
              }}
              className="text-blue-600 font-bold hover:text-blue-700 transition-colors flex items-center gap-1.5 mx-auto"
            >
              <ArrowLeft size={14} />
              <span>Kembali ke Enkripsi Masuk</span>
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
              <span>{isRegister ? 'Sudah memiliki kode akses?' : 'Belum terdaftar di konsol?'}</span>
              <button 
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                  setMessage('');
                }}
                className="text-blue-600 font-bold hover:text-blue-700 hover:underline transition-all flex items-center gap-0.5"
              >
                <span>{isRegister ? 'Masuk Sekarang' : 'Registrasi Akun'}</span>
                <Sparkles size={11} className="animate-pulse" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Decorative Sulawesi/Bugis motto or quote */}
      <p className="text-[10px] tracking-[0.25em] text-slate-500 font-semibold font-mono mt-8 uppercase text-center max-w-xs leading-relaxed">
        Siri' Na Pacce • Integrity & Pride<br />
        Presensi Karyawan US Bilibili 162
      </p>

      {/* Embedded CSS for custom keyframes like shimmer & shine */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes shine {
          100% {
            transform: skewX(-12deg) translateX(300%);
          }
        }
      `}</style>
    </div>
  );
}
