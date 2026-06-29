import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, addDoc, updateDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { MapPin, Camera, CheckCircle2, AlertCircle, RefreshCw, Navigation, Compass, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import RealTimeClock from '../components/RealTimeClock';
import { createNotification } from '../lib/notifications';

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

function drawWatermark(
  imageSrc: string,
  timestampStr: string,
  lat: number,
  lng: number,
  address: string
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    
    // Safety timeout of 2.5 seconds to fallback to original image in case onload hangs
    const timeoutId = setTimeout(() => {
      console.warn('Watermark timeout: falling back to raw image');
      resolve(imageSrc);
    }, 2500);

    if (imageSrc.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }
    
    img.onload = () => {
      clearTimeout(timeoutId);
      
      const width = img.width || 640;
      const height = img.height || 480;
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageSrc);
        return;
      }
      
      // Draw original photo
      ctx.drawImage(img, 0, 0, width, height);
      
      // Translucent slate background at the bottom
      const heightPercentage = 0.22;
      const boxHeight = height * heightPercentage;
      const boxY = height - boxHeight;
      
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)'; // slate-900 with opacity
      ctx.fillRect(0, boxY, width, boxHeight);
      
      // Blue vertical status line on the left side of the watermark box
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(0, boxY, 6, boxHeight);
      
      const padding = 16;
      ctx.fillStyle = '#ffffff';
      
      // Determine font sizes based on canvas size
      const titleFontSize = Math.max(12, Math.floor(width * 0.038));
      const textFontSize = Math.max(10, Math.floor(width * 0.032));
      
      // Title / info line
      ctx.font = `bold ${titleFontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(`${timestampStr} | ${lat.toFixed(6)}, ${lng.toFixed(6)}`, padding + 6, boxY + 16);
      
      // Address lines
      ctx.font = `normal ${textFontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = '#cbd5e1'; // slate-300
      
      const maxTextWidth = width - (padding * 2) - 14;
      const addressText = `Lokasi: ${address}`;
      
      const words = addressText.split(' ');
      let line = '';
      let yOffset = boxY + 16 + titleFontSize + 10;
      const lineHeight = textFontSize + 4;
      
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxTextWidth && n > 0) {
          ctx.fillText(line, padding + 6, yOffset);
          line = words[n] + ' ';
          yOffset += lineHeight;
          if (yOffset > height - 8) break;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, padding + 6, yOffset);
      
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      resolve(imageSrc);
    };
    img.src = imageSrc;
  });
}

export default function CheckInOut() {
  const { user, dbUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const webcamRef = useRef<Webcam>(null);

  interface OfficeLocation {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
  }

  // Office GPS configurations & interactive verification state
  const [offices, setOffices] = useState<OfficeLocation[]>([]);
  const [nearestOffice, setNearestOffice] = useState<OfficeLocation | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distanceFromOffice, setDistanceFromOffice] = useState<number | null>(null);
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [isWithinRadius, setIsWithinRadius] = useState<boolean | null>(null);

  // GPS Simulation states for sandbox preview environments
  const [isSimulatingGPS, setIsSimulatingGPS] = useState(false);
  const [simulatedCoords, setSimulatedCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // Helper to resolve coordinates either from simulation or real GPS API
  const getCoordinates = (): Promise<{ latitude: number; longitude: number }> => {
    if (isSimulatingGPS && simulatedCoords) {
      return Promise.resolve(simulatedCoords);
    }
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolokasi tidak didukung oleh browser Anda'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (err) => {
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  // Helper to find closest office and determine validation
  const evaluateLocations = (userLat: number, userLng: number, officesList: OfficeLocation[]) => {
    if (officesList.length === 0) return;

    let nearest: OfficeLocation | null = null;
    let minDistance = Infinity;
    let withinAny = false;
    let matchedOffice: OfficeLocation | null = null;

    officesList.forEach((office) => {
      const dist = getDistanceFromLatLonInM(userLat, userLng, office.latitude, office.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = office;
      }
      if (dist <= (office.radius || 100)) {
        withinAny = true;
        if (!matchedOffice || dist < getDistanceFromLatLonInM(userLat, userLng, matchedOffice.latitude, matchedOffice.longitude)) {
          matchedOffice = office;
        }
      }
    });

    const activeOffice = matchedOffice || nearest;
    if (activeOffice) {
      const activeDist = getDistanceFromLatLonInM(userLat, userLng, activeOffice.latitude, activeOffice.longitude);
      setNearestOffice(activeOffice);
      setDistanceFromOffice(activeDist);
      setIsWithinRadius(withinAny);
    }
  };

  const handleToggleSimulation = (enable: boolean) => {
    setIsSimulatingGPS(enable);
    if (enable && offices.length > 0) {
      const firstOffice = offices[0];
      const coords = { latitude: firstOffice.latitude, longitude: firstOffice.longitude };
      setSimulatedCoords(coords);
      setUserLocation(coords);
      evaluateLocations(coords.latitude, coords.longitude, offices);
      toast.success(`Mengaktifkan simulasi GPS di lokasi "${firstOffice.name}" (Dalam Radius)`);
    } else {
      setSimulatedCoords(null);
      setCheckingLocation(true);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setUserLocation({ latitude, longitude });
            evaluateLocations(latitude, longitude, offices);
            setCheckingLocation(false);
          },
          (err) => {
            console.error('Gagal mendapatkan lokasi real:', err);
            setUserLocation(null);
            setCheckingLocation(false);
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      } else {
        setCheckingLocation(false);
      }
    }
  };

  // Load office configurations and user location on component mount
  useEffect(() => {
    const loadOfficeAndLocation = async () => {
      setCheckingLocation(true);
      try {
        const officeDocRef = doc(db, 'settings', 'office_location');
        const officeSnap = await getDoc(officeDocRef);
        if (officeSnap.exists()) {
          const officeData = officeSnap.data();
          let officesList: OfficeLocation[] = [];

          if (officeData.offices && Array.isArray(officeData.offices)) {
            officesList = officeData.offices;
          } else if (officeData.latitude && officeData.longitude) {
            // Fallback for single office
            officesList = [{
              id: 'default',
              name: officeData.name || 'Kantor Pusat',
              latitude: Number(officeData.latitude),
              longitude: Number(officeData.longitude),
              radius: Number(officeData.radius || 100)
            }];
          }

          // Filter offices list if user is restricted to a specific office
          if (dbUser && dbUser.assignedOfficeId && dbUser.assignedOfficeId !== 'all') {
            const mappedId = dbUser.assignedOfficeId === 'default_office' ? 'default' : dbUser.assignedOfficeId;
            officesList = officesList.filter(o => o.id === mappedId);
          }

          setOffices(officesList);
          
          if (navigator.geolocation && officesList.length > 0) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                const { latitude, longitude } = position.coords;
                setUserLocation({ latitude, longitude });
                evaluateLocations(latitude, longitude, officesList);
                setCheckingLocation(false);
              },
              (err) => {
                console.error('Gagal mendapatkan lokasi saat render awal:', err);
                setCheckingLocation(false);
              },
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
            );
          } else {
            setCheckingLocation(false);
          }
        } else {
          setCheckingLocation(false);
        }
      } catch (err) {
        console.error('Error loading settings:', err);
        setCheckingLocation(false);
      }
    };

    loadOfficeAndLocation();
  }, [dbUser]);

  const refreshLocation = async () => {
    if (offices.length === 0) {
      toast.error('Pengaturan lokasi kantor tidak ditemukan');
      return;
    }
    setCheckingLocation(true);
    try {
      const coords = await getCoordinates();
      setUserLocation(coords);
      evaluateLocations(coords.latitude, coords.longitude, offices);
      setCheckingLocation(false);
      toast.success(isSimulatingGPS ? 'Lokasi simulasi berhasil diperbarui' : 'Lokasi GPS berhasil diperbarui');
    } catch (err: any) {
      console.error('Gagal menyegarkan lokasi:', err);
      setCheckingLocation(false);
      toast.error('Gagal menyegarkan lokasi. Pastikan izin lokasi aktif atau gunakan Simulator.');
    }
  };

  const captureAndLocate = async (type: 'checkin' | 'checkout') => {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      if (!user) throw new Error('Harap login terlebih dahulu');

      setMessage('Mengambil koordinat GPS Anda...');
      const coords = await getCoordinates();
      const { latitude, longitude } = coords;
      
      const video = webcamRef.current?.video;
      if (!video) {
        throw new Error('Kamera belum siap. Mohon tunggu beberapa saat.');
      }

      if (video.paused) {
        try {
          await video.play();
        } catch (playErr) {
          console.error('Gagal memulai streaming kamera secara manual:', playErr);
        }
      }

      if (video.readyState < 2) {
        throw new Error('Kamera sedang memuat aliran video. Silakan coba lagi dalam beberapa detik.');
      }

      const rawImageSrc = webcamRef.current?.getScreenshot();

      if (!rawImageSrc) {
        throw new Error('Gagal mengambil foto. Pastikan kamera diizinkan.');
      }

      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const timeStr = today.toTimeString().split(' ')[0];
      const timestampLabel = `${dateStr} ${timeStr}`;

      setMessage('Mendeteksi nama lokasi berdasarkan GPS...');
      
      let resolvedAddress = 'Koordinat: ' + latitude.toFixed(6) + ', ' + longitude.toFixed(6);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 second timeout
        
        const geoResponse = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
          {
            signal: controller.signal,
            headers: {
              'User-Agent': 'HRIS-App-AI-Studio',
              'Accept-Language': 'id,en'
            }
          }
        );
        clearTimeout(timeoutId);
        
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          resolvedAddress = geoData.display_name || resolvedAddress;
        }
      } catch (err) {
        console.error('Reverse geocoding error:', err);
      }

      setMessage('Memproses foto & menempelkan watermark...');
      const watermarkedImageSrc = await drawWatermark(
        rawImageSrc,
        timestampLabel,
        latitude,
        longitude,
        resolvedAddress
      );

      const attendanceRef = collection(db, 'attendance');
      const q = query(attendanceRef, where('user_id', '==', user.uid), where('tanggal', '==', dateStr));
      const existing = await getDocs(q);

      // Fetch office location setting
      const officeDocRef = doc(db, 'settings', 'office_location');
      const officeSnap = await getDoc(officeDocRef);

      if (!officeSnap.exists()) {
        throw new Error('Pengaturan lokasi kantor belum diatur oleh admin.');
      }
      
      const officeData = officeSnap.data();
      let officesList: OfficeLocation[] = [];

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

      // Filter offices list if user is restricted to a specific office
      if (dbUser && dbUser.assignedOfficeId && dbUser.assignedOfficeId !== 'all') {
        const mappedId = dbUser.assignedOfficeId === 'default_office' ? 'default' : dbUser.assignedOfficeId;
        officesList = officesList.filter(o => o.id === mappedId);
        if (officesList.length === 0) {
          throw new Error('Kantor khusus yang ditugaskan kepada Anda tidak ditemukan atau telah dihapus. Hubungi admin.');
        }
      }

      if (officesList.length === 0) {
        throw new Error('Lokasi kantor belum dikonfigurasi oleh admin.');
      }

      setUserLocation({ latitude, longitude });

      let nearest: OfficeLocation | null = null;
      let minDistance = Infinity;
      let withinAny = false;
      let matchedOffice: OfficeLocation | null = null;

      officesList.forEach((office) => {
        const dist = getDistanceFromLatLonInM(latitude, longitude, office.latitude, office.longitude);
        if (dist < minDistance) {
          minDistance = dist;
          nearest = office;
        }
        if (dist <= (office.radius || 100)) {
          withinAny = true;
          if (!matchedOffice || dist < getDistanceFromLatLonInM(latitude, longitude, matchedOffice.latitude, matchedOffice.longitude)) {
            matchedOffice = office;
          }
        }
      });

      const activeOffice = matchedOffice || nearest;
      if (activeOffice) {
        const activeDist = getDistanceFromLatLonInM(latitude, longitude, activeOffice.latitude, activeOffice.longitude);
        setNearestOffice(activeOffice);
        setDistanceFromOffice(activeDist);
        setIsWithinRadius(withinAny);
      }

      if (!withinAny) {
        if (activeOffice) {
          throw new Error(`Di luar radius kantor. Kantor terdekat: "${activeOffice.name}". Jarak Anda: ${Math.round(minDistance)} meter (Maksimal radius diperbolehkan: ${activeOffice.radius || 100} meter).`);
        } else {
          throw new Error('Di luar radius kantor.');
        }
      }

      if (type === 'checkin') {
        if (!existing.empty) {
          throw new Error('Anda sudah absen masuk');
        }

        // Determine if late
        let status = 'hadir';
        if (timeStr > '08:00:00') {
           status = 'Terlambat';
        } else {
           status = 'Hadir';
        }

        await addDoc(attendanceRef, {
          user_id: user.uid,
          tanggal: dateStr,
          jam_masuk: timeStr,
          latitude_masuk: latitude,
          longitude_masuk: longitude,
          alamat_masuk: resolvedAddress,
          selfie_masuk: watermarkedImageSrc,
          status: status,
          created_at: serverTimestamp()
        });
        
        await createNotification(
          user.uid,
          'Absen Masuk Berhasil',
          `Absensi masuk Anda pada tanggal ${dateStr} pukul ${timeStr} berhasil dicatat (${status}).`,
          'attendance'
        );

        const msg = `Absen masuk berhasil (${status})`;
        setMessage(msg);
        toast.success(msg);
      } else {
        if (existing.empty) {
          throw new Error('Anda belum absen masuk hari ini');
        }

        const docToUpdate = existing.docs[0];
        if (docToUpdate.data().jam_pulang) {
          throw new Error('Anda sudah melakukan absen pulang');
        }

        await updateDoc(docToUpdate.ref, {
          jam_pulang: timeStr,
          latitude_pulang: latitude,
          longitude_pulang: longitude,
          alamat_pulang: resolvedAddress,
          selfie_pulang: watermarkedImageSrc,
          updated_at: serverTimestamp()
        });

        await createNotification(
          user.uid,
          'Absen Pulang Berhasil',
          `Absensi pulang Anda pada tanggal ${dateStr} pukul ${timeStr} berhasil dicatat.`,
          'attendance'
        );

        const msg = 'Absen pulang berhasil';
        setMessage(msg);
        toast.success(msg);
      }
    } catch (err: any) {
      const errMsg = err.message || 'Terjadi kesalahan';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Absensi Kehadiran</h2>
          <p className="text-xs text-slate-500 mt-1">Gunakan kamera depan dan aktifkan lokasi GPS Anda untuk melakukan presensi.</p>
        </div>
        
        {offices.length > 0 && (
          <button
            onClick={refreshLocation}
            disabled={checkingLocation || loading}
            className="self-start sm:self-center flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-xl transition-all disabled:opacity-50 shadow-sm"
          >
            <RefreshCw size={12} className={`transition-transform duration-500 ${checkingLocation ? 'animate-spin' : ''}`} />
            <span>Segarkan Jarak GPS</span>
          </button>
        )}
      </div>

      {/* Real-time Digital Clock Banner */}
      <RealTimeClock variant="banner" />

      {/* Geofencing Live Validation Card */}
      {offices.length > 0 && (
        <div className="bg-gradient-to-r from-slate-50 to-slate-100/50 p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass size={16} className="text-blue-600 animate-pulse" />
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Validasi Jarak Kantor</h3>
            </div>
            
            {checkingLocation ? (
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                <RefreshCw size={8} className="animate-spin" />
                Mencari GPS...
              </span>
            ) : isWithinRadius === true ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                Dalam Radius Kantor
              </span>
            ) : isWithinRadius === false ? (
              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-100">
                Di Luar Radius Kantor
              </span>
            ) : (
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                Menunggu GPS...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Col: Office Bounds Configuration */}
            <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200/60">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                {nearestOffice ? `Kantor Terdekat: ${nearestOffice.name}` : 'Acuan Kantor'}
              </p>
              {nearestOffice ? (
                <>
                  <div className="text-xs text-slate-700 font-mono flex items-center gap-1">
                    <MapPin size={12} className="text-slate-400 shrink-0" />
                    <span>{nearestOffice.latitude.toFixed(6)}, {nearestOffice.longitude.toFixed(6)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Radius Absen Maksimal: <strong className="text-slate-700">{nearestOffice.radius} meter</strong>
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-400 italic">Mencari kantor terdekat...</p>
              )}
            </div>

            {/* Right Col: User Current Distance info */}
            <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200/60">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Posisi GPS Anda</p>
              {checkingLocation ? (
                <div className="text-xs text-slate-400 italic">Mencari koordinat Anda...</div>
              ) : userLocation ? (
                <>
                  <div className="text-xs text-slate-700 font-mono flex items-center gap-1">
                    <Navigation size={12} className="text-slate-400 shrink-0" />
                    <span>{userLocation.latitude.toFixed(6)}, {userLocation.longitude.toFixed(6)}</span>
                  </div>
                  {distanceFromOffice !== null && (
                    <p className="text-[11px]">
                      Jarak Anda saat ini:{' '}
                      <strong className={isWithinRadius ? 'text-emerald-600' : 'text-rose-600'}>
                        {Math.round(distanceFromOffice)} meter
                      </strong>{' '}
                      {isWithinRadius ? '(Aman)' : '(Terlalu Jauh!)'}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-slate-500">Gagal mendeteksi lokasi otomatis.</p>
                  <button onClick={refreshLocation} className="text-[10px] text-blue-600 hover:underline text-left font-bold">
                    Izinkan Akses Lokasi & Coba Lagi
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Alert Message for UX guidance */}
          {!checkingLocation && isWithinRadius === false && (
            <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-xl border border-amber-100 flex items-start gap-2">
              <Info size={15} className="shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-semibold">Perhatian: Anda Berada di Luar Jangkauan Kantor</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  {nearestOffice ? (
                    <>Anda berjarak {distanceFromOffice ? Math.round(distanceFromOffice) : ''} meter dari <strong>{nearestOffice.name}</strong>. Silakan mendekat ke lokasi tersebut dalam radius {nearestOffice.radius} meter untuk melakukan absensi kehadiran.</>
                  ) : (
                    <>Anda berada di luar jangkauan radius kantor mana pun. Silakan mendekat ke salah satu lokasi kantor yang telah ditentukan oleh admin.</>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* GPS Simulator panel for sandbox testing */}
          <div className="mt-2 pt-3 border-t border-slate-200/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isSimulatingGPS ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`}></span>
                Mode Demo: Simulator GPS
              </span>
              <button
                type="button"
                onClick={() => handleToggleSimulation(!isSimulatingGPS)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                  isSimulatingGPS 
                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' 
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isSimulatingGPS ? 'Matikan Simulator' : 'Aktifkan Simulator'}
              </button>
            </div>

            {isSimulatingGPS && (
              <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100/80 space-y-2.5">
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Gunakan simulator ini untuk menguji validasi geofencing di lingkungan sandbox / iframe tanpa harus berada di lokasi fisik kantor.
                </p>
                <div className="flex flex-wrap gap-2">
                  {offices.map((office) => (
                    <button
                      key={office.id}
                      type="button"
                      onClick={() => {
                        const coords = { latitude: office.latitude, longitude: office.longitude };
                        setSimulatedCoords(coords);
                        setUserLocation(coords);
                        evaluateLocations(coords.latitude, coords.longitude, offices);
                        toast.success(`GPS diatur tepat di "${office.name}" (Dalam Radius)`);
                      }}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 transition cursor-pointer"
                    >
                      Presisi: {office.name}
                    </button>
                  ))}
                  
                  {nearestOffice && (
                    <button
                      type="button"
                      onClick={() => {
                        const coords = { 
                          latitude: nearestOffice.latitude + 0.005, 
                          longitude: nearestOffice.longitude + 0.005 
                        };
                        setSimulatedCoords(coords);
                        setUserLocation(coords);
                        evaluateLocations(coords.latitude, coords.longitude, offices);
                        toast.error(`GPS diatur di luar jangkauan "${nearestOffice.name}" (Luar Radius)`);
                      }}
                      className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-[10px] font-bold text-rose-700 transition cursor-pointer"
                    >
                      Atur Luar Jangkauan
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col items-center">
        <div className="relative w-full max-w-sm aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden mb-6">
          {/* @ts-ignore */}
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode }}
            className="object-cover w-full h-full"
            playsInline={true}
            autoPlay={true}
            muted={true}
          />
          
          {/* Switch Camera Button */}
          <button
            type="button"
            onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
            className="absolute top-4 right-4 bg-black/60 hover:bg-black/85 active:scale-95 text-white px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all border border-white/20 backdrop-blur-sm cursor-pointer hover:shadow-lg shadow-black/20"
          >
            <RefreshCw size={13} className="animate-pulse" />
            <span>{facingMode === 'user' ? 'Kamera Belakang' : 'Kamera Depan'}</span>
          </button>

          <div className="absolute bottom-4 left-0 right-0 flex justify-center text-white">
            <div className="bg-black/50 px-3 py-1.5 rounded-full flex items-center space-x-2 text-sm backdrop-blur-sm">
              <Camera size={16} />
              <span>Posisikan wajah Anda di tengah</span>
            </div>
          </div>
        </div>

        {message && (
          <div className="w-full mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-xl flex items-center space-x-3">
            <CheckCircle2 size={20} />
            <span className="font-medium">{message}</span>
          </div>
        )}

        {error && (
          <div className="w-full mb-6 p-4 bg-red-50 text-red-700 rounded-xl flex items-center space-x-3">
            <AlertCircle size={20} />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          <button
            onClick={() => captureAndLocate('checkin')}
            disabled={loading}
            className="flex flex-col items-center justify-center p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            <span className="font-bold text-lg">MASUK</span>
          </button>
          
          <button
            onClick={() => captureAndLocate('checkout')}
            disabled={loading}
            className="flex flex-col items-center justify-center p-4 bg-slate-800 text-white rounded-xl hover:bg-slate-900 active:bg-black disabled:opacity-50 transition-colors"
          >
            <span className="font-bold text-lg">PULANG</span>
          </button>
        </div>
        
        <p className="text-xs text-slate-500 mt-6 text-center max-w-xs flex items-center space-x-1 justify-center">
          <MapPin size={12} />
          <span>Lokasi dan foto akan dicatat saat absensi.</span>
        </p>
      </div>
    </div>
  );
}
