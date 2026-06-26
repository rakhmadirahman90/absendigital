import React, { useState, useRef } from 'react';
import Webcam from 'react-webcam';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, addDoc, updateDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { MapPin, Camera, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

export default function CheckInOut() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const webcamRef = useRef<Webcam>(null);

  const captureAndLocate = async (type: 'checkin' | 'checkout') => {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      if (!user) throw new Error('Harap login terlebih dahulu');

      if (!navigator.geolocation) {
        throw new Error('Geolokasi tidak didukung oleh browser Anda');
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const { latitude, longitude } = position.coords;
      const imageSrc = webcamRef.current?.getScreenshot();

      if (!imageSrc) {
        throw new Error('Gagal mengambil foto. Pastikan kamera diizinkan.');
      }

      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const timeStr = today.toTimeString().split(' ')[0];

      const attendanceRef = collection(db, 'attendance');
      const q = query(attendanceRef, where('user_id', '==', user.uid), where('tanggal', '==', dateStr));
      const existing = await getDocs(q);

      // Fetch office location setting
      const officeDocRef = doc(db, 'settings', 'office_location');
      const officeSnap = await getDoc(officeDocRef);

      if (!officeSnap.exists()) {
        throw new Error('Pengaturan lokasi kantor belum diatur oleh admin.');
      }
      
      const office = officeSnap.data();
      const distance = getDistanceFromLatLonInM(latitude, longitude, office.latitude, office.longitude);
      
      if (distance > (office.radius || 100)) {
        throw new Error('Di luar radius kantor');
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
          selfie_masuk: imageSrc, // Saving base64 for simplicity
          status: status,
          created_at: serverTimestamp()
        });
        setMessage(`Absen masuk berhasil (${status})`);
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
          selfie_pulang: imageSrc,
          updated_at: serverTimestamp()
        });
        setMessage('Absen pulang berhasil');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Absensi Kehadiran</h2>
      
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col items-center">
        <div className="relative w-full max-w-sm aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden mb-6">
          {/* @ts-ignore */}
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: "user" }}
            className="object-cover w-full h-full"
          />
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
