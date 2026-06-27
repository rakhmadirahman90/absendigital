import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import React, { useEffect, useState } from 'react';
import { UserCircle2, Briefcase, Building, MapPin, Edit3, Save, Phone, Lock, X, Sun, Moon, Sparkles, CloudSun, CloudMoon } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import RealTimeClock from '../components/RealTimeClock';
import { toast } from 'react-hot-toast';

function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Radius of the earth in m
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d;
}

export default function Dashboard() {
  const { user, dbUser } = useAuth();
  const [time, setTime] = useState(new Date());
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [geofencingStatus, setGeofencingStatus] = useState<'checking' | 'inside' | 'outside' | 'error'>('checking');
  const [geofencingMessage, setGeofencingMessage] = useState('Mengecek lokasi...');

  // Profile update states
  const [isEditing, setIsEditing] = useState(false);
  const [editNama, setEditNama] = useState('');
  const [editWaNumber, setEditWaNumber] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [updating, setUpdating] = useState(false);

  // Dynamic Daytime/Nighttime State (auto-detect based on local system time)
  const [isDaytime, setIsDaytime] = useState(() => {
    const h = new Date().getHours();
    return h >= 6 && h < 18;
  });

  // Keep theme synchronized with the active real-time clock
  useEffect(() => {
    const h = time.getHours();
    setIsDaytime(h >= 6 && h < 18);
  }, [time]);

  // Dynamic Theme Utility Styles
  const themeCardBg = isDaytime 
    ? "bg-white border-slate-200" 
    : "bg-slate-900 border-slate-800 text-slate-100 shadow-lg shadow-indigo-950/20";

  const themeTextLabel = isDaytime 
    ? "text-slate-500" 
    : "text-slate-400";

  const themeTextVal = isDaytime 
    ? "text-slate-800" 
    : "text-white";

  const themeBorder = isDaytime 
    ? "border-slate-100" 
    : "border-slate-800";

  const themeInputBg = isDaytime 
    ? "bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-500/20 focus:border-blue-500" 
    : "bg-slate-950 border-slate-800 text-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500";

  const themeFieldBg = isDaytime 
    ? "bg-slate-50 border-slate-100" 
    : "bg-slate-950/40 border-slate-800/60";

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, 'attendance'),
      where('user_id', '==', user.uid)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const todayStr = new Date().toISOString().split('T')[0];
        const todayRecord = records.find((r: any) => r.tanggal === todayStr);
        setTodayAttendance(todayRecord || null);
    }, (error) => {
        console.error("Failed fetching history realtime", error);
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    const checkLocation = async () => {
      try {
        const officeDocRef = doc(db, 'settings', 'office_location');
        const officeSnap = await getDoc(officeDocRef);
        
        if (!officeSnap.exists()) {
           setGeofencingStatus('error');
           setGeofencingMessage('Lokasi kantor belum diatur');
           return;
        }

        const officeData = officeSnap.data();
        let officesList: any[] = [];

        if (officeData.offices && Array.isArray(officeData.offices)) {
          officesList = officeData.offices;
        } else if (officeData.latitude && officeData.longitude) {
          officesList = [{
            id: 'default',
            name: officeData.name || 'Kantor Pusat',
            latitude: Number(officeData.latitude),
            longitude: Number(officeData.longitude),
            radius: Number(officeData.radius || 100)
          }];
        }

        if (officesList.length === 0) {
          setGeofencingStatus('error');
          setGeofencingMessage('Lokasi kantor belum dikonfigurasi');
          return;
        }

        // Filter based on user assignment
        if (dbUser && dbUser.assignedOfficeId && dbUser.assignedOfficeId !== 'all') {
          officesList = officesList.filter((o: any) => o.id === dbUser.assignedOfficeId);
        }

        if (officesList.length === 0) {
          setGeofencingStatus('error');
          setGeofencingMessage('Kantor tugas Anda tidak ditemukan');
          return;
        }

        if (!navigator.geolocation) {
           setGeofencingStatus('error');
           setGeofencingMessage('Geolokasi tidak didukung');
           return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            let withinAny = false;
            let matchedOfficeName = '';

            officesList.forEach((office: any) => {
              const distance = getDistanceFromLatLonInM(lat, lng, office.latitude, office.longitude);
              if (distance <= (office.radius || 100)) {
                withinAny = true;
                matchedOfficeName = office.name;
              }
            });
            
            if (withinAny) {
               setGeofencingStatus('inside');
               setGeofencingMessage(`Di Area Kantor (${matchedOfficeName})`);
            } else {
               setGeofencingStatus('outside');
               if (officesList.length === 1) {
                 setGeofencingMessage(`Di Luar Area ${officesList[0].name}`);
               } else {
                 setGeofencingMessage('Di Luar Area Kantor');
               }
            }
          },
          (error) => {
             setGeofencingStatus('error');
             setGeofencingMessage('Gagal mengambil lokasi');
          },
          { enableHighAccuracy: true }
        );
      } catch (error) {
         setGeofencingStatus('error');
         setGeofencingMessage('Gagal memuat pengaturan lokasi');
      }
    };
    
    checkLocation();
    const locationInterval = setInterval(checkLocation, 60000); // Check every minute
    return () => clearInterval(locationInterval);
  }, [dbUser]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!editNama.trim()) {
      toast.error('Nama lengkap tidak boleh kosong');
      return;
    }

    if (!editWaNumber.trim()) {
      toast.error('Nomor WhatsApp tidak boleh kosong');
      return;
    }

    if (editWaNumber.length < 9) {
      toast.error('Nomor WhatsApp tidak valid');
      return;
    }

    if (!editPassword.trim() || editPassword.length < 6) {
      toast.error('Kata sandi minimal 6 karakter');
      return;
    }

    setUpdating(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        nama: editNama.trim(),
        waNumber: editWaNumber.trim(),
        password: editPassword.trim()
      });
      toast.success('Profil Anda berhasil diperbarui!');
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Gagal memperbarui profil. Silakan coba lagi.');
    } finally {
      setUpdating(false);
    }
  };

  const toggleTheme = () => {
    setIsDaytime(!isDaytime);
    toast.success(!isDaytime ? 'Beralih ke Tema Siang' : 'Beralih ke Tema Malam');
  };

  if (!dbUser) return <div className="p-8 text-center text-slate-500 font-medium">Memuat profil...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`lg:col-span-2 rounded-2xl p-6 md:p-8 text-white shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[220px] transition-all duration-500 bg-gradient-to-br ${isDaytime ? 'from-sky-500 via-blue-600 to-indigo-700' : 'from-slate-950 via-slate-900 to-indigo-950 border border-indigo-500/20 shadow-[0_0_25px_rgba(99,102,241,0.15)]'}`}>
          {/* Theme Interactive Toggle Badge */}
          <button
            onClick={toggleTheme}
            className="absolute top-4 right-4 z-20 flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/10 text-white transition-all text-[11px] font-semibold cursor-pointer select-none focus:outline-none"
            title="Klik untuk beralih mode simulasi"
          >
            {isDaytime ? (
              <>
                <Sun size={12} className="text-amber-300 animate-pulse" />
                <span>Mode Siang</span>
              </>
            ) : (
              <>
                <Moon size={12} className="text-indigo-200" />
                <span>Mode Malam</span>
              </>
            )}
          </button>

          {/* Floating Day/Night Art Elements */}
          {isDaytime ? (
            <div className="absolute right-4 bottom-4 md:right-12 md:bottom-6 opacity-15 pointer-events-none transform translate-y-2 translate-x-2 select-none">
              <CloudSun size={160} className="text-yellow-200" />
            </div>
          ) : (
            <div className="absolute right-4 bottom-4 md:right-12 md:bottom-6 opacity-25 pointer-events-none transform translate-y-2 translate-x-2 select-none">
              <div className="relative">
                <CloudMoon size={150} className="text-indigo-200" />
                <Sparkles size={18} className="absolute -top-2 -left-2 text-indigo-300 animate-pulse" />
                <Sparkles size={14} className="absolute bottom-4 right-10 text-indigo-100 animate-bounce" />
              </div>
            </div>
          )}

          {/* Decorative ambient gradients */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-36 h-36 bg-blue-500/10 rounded-full blur-xl -ml-12 -mb-12 pointer-events-none" />

          <div className="relative z-10 space-y-3">
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">Sistem Absensi Karyawan</p>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider ${isDaytime ? 'bg-amber-400 text-slate-900' : 'bg-indigo-600 text-white'}`}>
                  {isDaytime ? 'PAGI - SORE' : 'MALAM HARI'}
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">
                Halo, {dbUser.nama}!
              </h2>
            </div>
            
            <p className="text-blue-100/90 text-xs md:text-sm max-w-md leading-relaxed">
              Selamat datang kembali. Selalu pastikan Anda telah mengaktifkan izin GPS pada peramban Anda saat melakukan presensi masuk ataupun pulang.
            </p>
          </div>

          <div className="relative z-10 mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center gap-3">
            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-200">Status Jangkauan:</span>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 shadow-sm">
              <MapPin size={14} className={
                geofencingStatus === 'inside' ? 'text-emerald-400' :
                geofencingStatus === 'outside' ? 'text-amber-400' :
                geofencingStatus === 'error' ? 'text-red-400' : 'text-blue-200'
              } />
              <span className="text-xs font-semibold text-white">
                {geofencingMessage}
              </span>
            </div>
          </div>
        </div>
        
        <div className="lg:col-span-1">
          <RealTimeClock variant="card" className="h-full flex flex-col justify-between" />
        </div>
      </div>

      {/* Stats Cards Row (Dynamic Icon Set and Styles based on Day/Night) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`p-6 rounded-2xl border shadow-sm flex items-center space-x-4 transition-all duration-500 ${themeCardBg}`}>
          <div className={`p-3 rounded-xl transition-colors duration-500 ${isDaytime ? 'bg-blue-50 text-blue-600' : 'bg-cyan-950/60 text-cyan-400 border border-cyan-500/30'}`}>
             <UserCircle2 size={24} />
          </div>
          <div>
            <p className={`text-sm font-medium ${themeTextLabel}`}>Jabatan</p>
            <p className={`font-semibold ${themeTextVal}`}>{dbUser.jabatan || '-'}</p>
          </div>
        </div>
        <div className={`p-6 rounded-2xl border shadow-sm flex items-center space-x-4 transition-all duration-500 ${themeCardBg}`}>
          <div className={`p-3 rounded-xl transition-colors duration-500 ${isDaytime ? 'bg-indigo-50 text-indigo-600' : 'bg-purple-950/60 text-purple-400 border border-purple-500/30'}`}>
             <Briefcase size={24} />
          </div>
          <div>
            <p className={`text-sm font-medium ${themeTextLabel}`}>Divisi</p>
            <p className={`font-semibold ${themeTextVal}`}>{dbUser.divisi || '-'}</p>
          </div>
        </div>
        <div className={`p-6 rounded-2xl border shadow-sm flex items-center space-x-4 transition-all duration-500 ${themeCardBg}`}>
          {/* Dynamic icon choice based on daytime/nighttime */}
          <div className={`p-3 rounded-xl transition-colors duration-500 ${isDaytime ? 'bg-amber-50 text-amber-600' : 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/30'}`}>
             {isDaytime ? <CloudSun size={24} /> : <CloudMoon size={24} />}
          </div>
          <div>
            <p className={`text-sm font-medium ${themeTextLabel}`}>Status Hari Ini ({isDaytime ? 'Siang' : 'Malam'})</p>
            <p className={`font-semibold ${themeTextVal}`}>
               {todayAttendance ? (todayAttendance.jam_pulang ? 'Sudah Pulang' : 'Sudah Masuk') : 'Belum Absen'}
            </p>
          </div>
        </div>
      </div>
      
      {/* Today's Summary Card */}
      <div className={`rounded-2xl border p-6 transition-all duration-500 ${themeCardBg}`}>
        <h3 className={`text-lg font-bold mb-4 ${themeTextVal}`}>Ringkasan Hari Ini</h3>
        {todayAttendance ? (
           <div className="flex flex-col space-y-4">
             <div className={`flex justify-between items-center py-3 border-b ${themeBorder}`}>
                <span className={themeTextLabel}>Jam Masuk</span>
                <span className="font-semibold font-mono text-emerald-500">{todayAttendance.jam_masuk}</span>
             </div>
             <div className={`flex justify-between items-center py-3 border-b ${themeBorder}`}>
                <span className={themeTextLabel}>Jam Pulang</span>
                <span className={`font-semibold font-mono ${themeTextVal}`}>{todayAttendance.jam_pulang || '--:--:--'}</span>
             </div>
             <div className="flex justify-between items-center py-3">
                <span className={themeTextLabel}>Status</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${isDaytime ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20'}`}>
                  {todayAttendance.status}
                </span>
             </div>
           </div>
        ) : (
           <div className={`text-center py-8 ${themeTextLabel}`}>
             <p>Anda belum melakukan absensi hari ini.</p>
           </div>
        )}
      </div>

      {/* Profil Saya Card */}
      <div className={`rounded-2xl border p-6 transition-all duration-500 ${themeCardBg}`}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${isDaytime ? 'bg-blue-50 text-blue-600' : 'bg-indigo-950/60 text-indigo-400 border border-indigo-500/20'}`}>
              <UserCircle2 size={20} />
            </div>
            <h3 className={`text-lg font-bold ${themeTextVal}`}>Profil Saya</h3>
          </div>
          {!isEditing ? (
            <button
              onClick={() => {
                setEditNama(dbUser.nama || '');
                setEditWaNumber(dbUser.waNumber || '');
                setEditPassword(dbUser.password || '');
                setIsEditing(true);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus:outline-none ${isDaytime ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-indigo-950/80 text-indigo-400 hover:bg-indigo-900 border border-indigo-500/20'}`}
            >
              <Edit3 size={14} />
              <span>Edit Profil</span>
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(false)}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus:outline-none ${isDaytime ? 'bg-slate-50 text-slate-600 hover:bg-slate-100' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              <X size={14} />
              <span>Batal</span>
            </button>
          )}
        </div>

        {!isEditing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-sans">
            <div className={`p-4 rounded-xl border transition-all ${themeFieldBg} ${isDaytime ? 'border-slate-100' : 'border-slate-800/85'}`}>
              <span className="text-xs text-slate-400 font-medium block mb-1">Nama Lengkap</span>
              <span className={`text-sm font-semibold ${themeTextVal}`}>{dbUser.nama || '-'}</span>
            </div>
            <div className={`p-4 rounded-xl border transition-all ${themeFieldBg} ${isDaytime ? 'border-slate-100' : 'border-slate-800/85'}`}>
              <span className="text-xs text-slate-400 font-medium block mb-1">Nomor WhatsApp</span>
              <span className={`text-sm font-semibold ${themeTextVal}`}>{dbUser.waNumber || '-'}</span>
            </div>
            <div className={`p-4 rounded-xl border transition-all ${themeFieldBg} ${isDaytime ? 'border-slate-100' : 'border-slate-800/85'}`}>
              <span className="text-xs text-slate-400 font-medium block mb-1">Kata Sandi (Password)</span>
              <span className={`text-sm font-semibold font-mono ${themeTextVal}`}>••••••••</span>
            </div>
            <div className={`p-4 rounded-xl border transition-all ${themeFieldBg} ${isDaytime ? 'border-slate-100' : 'border-slate-800/85'}`}>
              <span className="text-xs text-slate-400 font-medium block mb-1">Role Akun</span>
              <div>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${isDaytime ? 'bg-blue-50 text-blue-700' : 'bg-indigo-950/60 text-indigo-400 border border-indigo-500/30'} mt-1`}>
                  {dbUser.role || 'Karyawan'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleUpdateProfile} className="space-y-4 font-sans">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${themeTextLabel}`}>Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={editNama}
                  onChange={(e) => setEditNama(e.target.value)}
                  placeholder="Masukkan nama lengkap"
                  className={`w-full px-4 py-2.5 rounded-xl outline-none text-sm font-medium transition-all border ${themeInputBg}`}
                />
              </div>
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${themeTextLabel}`}>Nomor WhatsApp</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Phone size={14} />
                  </div>
                  <input
                    type="tel"
                    required
                    value={editWaNumber}
                    onChange={(e) => setEditWaNumber(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Contoh: 08123456789"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl outline-none text-sm font-medium transition-all border ${themeInputBg}`}
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${themeTextLabel}`}>Kata Sandi Baru</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock size={14} />
                  </div>
                  <input
                    type="text"
                    required
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Masukkan kata sandi baru"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl outline-none text-sm font-medium transition-all border ${themeInputBg}`}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Kata sandi ini digunakan untuk masuk ke sistem menggunakan nomor WhatsApp Anda.</p>
              </div>
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className={`px-4 py-2 border font-semibold rounded-xl text-sm transition-colors cursor-pointer ${isDaytime ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-slate-800 text-slate-400 hover:bg-slate-800/50'}`}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={updating}
                className={`flex items-center space-x-2 px-5 py-2 font-semibold rounded-xl text-sm transition-colors cursor-pointer ${isDaytime ? 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400' : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-indigo-800'}`}
              >
                {updating ? (
                  <span>Menyimpan...</span>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Simpan Perubahan</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
