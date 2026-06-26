import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import React, { useEffect, useState } from 'react';
import { UserCircle2, Briefcase, Building, MapPin } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import RealTimeClock from '../components/RealTimeClock';

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

  if (!dbUser) return <div>Loading profile...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-2xl p-6 md:p-8 text-white shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[220px]">
          {/* Decorative ambient gradients */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-36 h-36 bg-blue-500/10 rounded-full blur-xl -ml-12 -mb-12 pointer-events-none" />

          <div className="relative z-10 space-y-3">
            <div>
              <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1">Sistem Absensi Karyawan</p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="bg-slate-100 p-3 rounded-xl text-slate-600">
             <UserCircle2 size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Jabatan</p>
            <p className="text-slate-800 font-semibold">{dbUser.jabatan || '-'}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="bg-slate-100 p-3 rounded-xl text-slate-600">
             <Briefcase size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Divisi</p>
            <p className="text-slate-800 font-semibold">{dbUser.divisi || '-'}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="bg-slate-100 p-3 rounded-xl text-slate-600">
             <Building size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Status Hari Ini</p>
            <p className="text-slate-800 font-semibold">
               {todayAttendance ? (todayAttendance.jam_pulang ? 'Sudah Pulang' : 'Sudah Masuk') : 'Belum Absen'}
            </p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Ringkasan Hari Ini</h3>
        {todayAttendance ? (
           <div className="flex flex-col space-y-4">
             <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <span className="text-slate-500">Jam Masuk</span>
                <span className="font-semibold font-mono text-emerald-600">{todayAttendance.jam_masuk}</span>
             </div>
             <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <span className="text-slate-500">Jam Pulang</span>
                <span className="font-semibold font-mono text-slate-800">{todayAttendance.jam_pulang || '--:--:--'}</span>
             </div>
             <div className="flex justify-between items-center py-3">
                <span className="text-slate-500">Status</span>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium capitalize">{todayAttendance.status}</span>
             </div>
           </div>
        ) : (
           <div className="text-center py-8 text-slate-500">
             <p>Anda belum melakukan absensi hari ini.</p>
           </div>
        )}
      </div>
    </div>
  );
}
