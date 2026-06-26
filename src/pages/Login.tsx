import React, { useState } from 'react';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Building2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function Login() {
  const [waNumber, setWaNumber] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-3 rounded-full text-blue-600">
             <Building2 size={32} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">
          {isForgotPassword ? 'Reset Password' : isRegister ? 'Daftar Karyawan Baru' : 'Login Karyawan'}
        </h1>
        <p className="text-center text-slate-500 mb-8">
          {isForgotPassword ? 'Masukkan Nomor WA Anda untuk mereset password' : isRegister ? 'Buat akun untuk mengakses sistem' : 'Masuk ke sistem absensi'}
        </p>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nomor WhatsApp</label>
            <input 
              type="text" 
              required
              value={waNumber}
              onChange={(e) => setWaNumber(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="Contoh: 081234567890"
            />
          </div>
          {!isForgotPassword && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                {!isRegister && (
                  <button 
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setError('');
                      setMessage('');
                    }}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    Lupa Password?
                  </button>
                )}
              </div>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          )}
          
          {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
          {message && <p className="text-emerald-600 text-sm bg-emerald-50 p-3 rounded-lg">{message}</p>}
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? 'Memproses...' : (isForgotPassword ? 'Kirim Tautan Reset' : isRegister ? 'Daftar' : 'Masuk')}
          </button>
        </form>
        
        <div className="mt-6 text-center text-sm text-slate-600">
          {isForgotPassword ? (
            <button 
              onClick={() => {
                setIsForgotPassword(false);
                setError('');
                setMessage('');
              }}
              className="text-blue-600 font-medium hover:underline"
            >
              Kembali ke Login
            </button>
          ) : (
            <>
              {isRegister ? 'Sudah punya akun? ' : 'Belum punya akun? '}
              <button 
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                  setMessage('');
                }}
                className="text-blue-600 font-medium hover:underline"
              >
                {isRegister ? 'Masuk di sini' : 'Daftar di sini'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
