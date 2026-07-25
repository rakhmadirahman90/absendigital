import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import React, { useEffect, useState } from 'react';
import { UserCircle2, Briefcase, Building, MapPin, Edit3, Save, Phone, Lock, X, Sun, Moon, Sparkles, CloudSun, CloudMoon, BarChart2 } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import RealTimeClock from '../components/RealTimeClock';
import { toast } from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

function getWeekDates() {
  const current = new Date();
  const day = current.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const mondayDiff = day === 0 ? -6 : 1 - day; // diff to Monday
  const monday = new Date(current);
  monday.setDate(current.getDate() + mondayDiff);
  
  const dates = [];
  const daysName = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateString = d.toISOString().split('T')[0];
    dates.push({
      dayName: daysName[i],
      dateString
    });
  }
  return dates;
}

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
  const [weeklyTrends, setWeeklyTrends] = useState<any[]>([]);
  const [geofencingStatus, setGeofencingStatus] = useState<'checking' | 'inside' | 'outside' | 'error'>('checking');
  const [geofencingMessage, setGeofencingMessage] = useState('Mengecek lokasi...');
  const [mySalaryStats, setMySalaryStats] = useState<any>({
    totalRegularHours: 0,
    totalLemburHours: 0,
    totalDryerBonus: 0,
    estimatedSalary: 0,
    daysPresent: 0
  });

  const [officialPayslips, setOfficialPayslips] = useState<any[]>([]);
  const [activeSalaryTab, setActiveSalaryTab] = useState<'estimasi' | 'slip'>('estimasi');

  // Profile update states
  const [isEditing, setIsEditing] = useState(false);
  const [editNama, setEditNama] = useState('');
  const [editWaNumber, setEditWaNumber] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editLoginMethod, setEditLoginMethod] = useState<'password' | 'pin'>('password');
  const [editPin, setEditPin] = useState('');
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

  const [allRecords, setAllRecords] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, 'attendance'),
      where('user_id', '==', user.uid)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllRecords(records);
    }, (error) => {
        console.error("Failed fetching history realtime", error);
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!allRecords || allRecords.length === 0) return;

    const todayStr = format(time, 'yyyy-MM-dd');
    const todayRecord = allRecords.find((r: any) => r.tanggal === todayStr);
    setTodayAttendance(todayRecord || null);

    // Calculate estimated salary for current month
    const currentMonthStr = format(time, 'yyyy-MM'); // "YYYY-MM"
    const currentMonthRecords = allRecords.filter((r: any) => r.tanggal && r.tanggal.startsWith(currentMonthStr));
    
    let regHrs = 0;
    let lembHrs = 0;
    let dryerBns = 0;
    let presentDays = 0;

    currentMonthRecords.forEach((rec: any) => {
      if (!['Hadir', 'Terlambat'].includes(rec.status)) return;
      presentDays++;
      
      const inVal = rec.jam_masuk || '';
      const outVal = rec.jam_pulang || '';
      
      // Only calculate if both check-in and check-out are filled.
      if (!inVal || !outVal) return;

      let inTime = 0;
      let outTime = 0;
      if (inVal.includes(':')) {
          const [h, m] = inVal.split(':').map(Number);
          inTime = (h || 0) + (m || 0) / 60;
      } else {
          inTime = Number(inVal) || 0;
      }
      
      if (outVal.includes(':')) {
          const [h, m] = outVal.split(':').map(Number);
          outTime = (h || 0) + (m || 0) / 60;
      } else {
          outTime = Number(outVal) || 0;
      }

      const breakHours = rec.istirahat !== undefined ? Number(rec.istirahat) : 1;
      const rawHours = Math.max(0, outTime - inTime);
      const netHours = Math.max(0, rawHours - breakHours);

      const isJuned = dbUser?.nama?.toLowerCase().includes('juned') || false;
      const isAsma = dbUser?.nama?.toLowerCase().includes('asma') || false;

      let recordRegHrs = 0;
      let recordLembHrs = 0;

      if (rec.is_lembur) {
          recordLembHrs = netHours;
      } else {
          if (isJuned) {
              if (outTime > 17) {
                  const ovt = Math.max(0, outTime - 17);
                  recordLembHrs = Math.min(netHours, ovt);
                  recordRegHrs = Math.max(0, netHours - recordLembHrs);
              } else {
                  recordRegHrs = netHours;
              }
          } else if (isAsma) {
              if (outTime > 18) {
                  const ovt = Math.max(0, outTime - 18);
                  recordLembHrs = Math.min(netHours, ovt);
                  recordRegHrs = Math.max(0, netHours - recordLembHrs);
              } else {
                  recordRegHrs = netHours;
              }
          } else {
              recordRegHrs = netHours;
          }
      }

      regHrs += recordRegHrs;
      lembHrs += recordLembHrs;

      if (rec.dryer_menyala && dbUser?.bonus_dryer_1) {
          dryerBns += 10000;
      }
    });

    const isMonthly = dbUser?.gaji_type === 'per_bulan';
    const regRate = isMonthly ? 0 : (dbUser?.gaji_per_jam !== undefined ? Number(dbUser.gaji_per_jam) : 14000);
    const isJuned = dbUser?.nama?.toLowerCase().includes('juned') || false;
    const isAsma = dbUser?.nama?.toLowerCase().includes('asma') || false;
    let lemburRate = dbUser?.gaji_lembur_per_jam !== undefined ? Number(dbUser.gaji_lembur_per_jam) : 14000;
    if (isJuned) lemburRate = 15000;
    if (isAsma) lemburRate = 16000;
    const basePay = isMonthly ? (Number(dbUser.gaji_bulanan) || 0) : 0;

    const earnedRegPay = regHrs * regRate;
    const earnedLemburPay = lembHrs * lemburRate;
    const estimatedSalary = basePay + earnedRegPay + earnedLemburPay + dryerBns;

    setMySalaryStats({
      totalRegularHours: regHrs,
      totalLemburHours: lembHrs,
      totalDryerBonus: dryerBns,
      estimatedSalary,
      daysPresent: presentDays
    });

    // Process current week's trends (Monday to Friday)
    const weekDates = getWeekDates().slice(0, 5); // Just Mon-Fri
    const trends = weekDates.map(wd => {
      const dayRecord = allRecords.find((r: any) => r.tanggal === wd.dateString) as any;
      let onTime = 0;
      let late = 0;
      
      if (dayRecord) {
        if (dayRecord.status === 'Terlambat') {
          late = 1;
        } else {
          onTime = 1;
        }
      }
      
      return {
        name: wd.dayName.substring(0, 3), // "Sen", "Sel", "Rab", etc.
        'Tepat Waktu': onTime,
        'Terlambat': late,
        hadir: dayRecord ? 1 : 0
      };
    });
    setWeeklyTrends(trends);
  }, [allRecords, dbUser, time, user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'payrolls'),
      where('user_id', '==', user.uid)
    );
    const unsubPayrolls = onSnapshot(q, (snap) => {
      const slips: any[] = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.status === 'approved' || data.status === 'paid') {
          slips.push({ id: doc.id, ...data });
        }
      });
      setOfficialPayslips(slips.sort((a, b) => b.bulan.localeCompare(a.bulan)));
    }, (error) => {
      console.error("Error listening to user payrolls:", error);
    });
    return () => unsubPayrolls();
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
          const mappedId = dbUser.assignedOfficeId === 'default_office' ? 'default' : dbUser.assignedOfficeId;
          officesList = officesList.filter((o: any) => o.id === mappedId);
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
      const updateData: any = {
        nama: editNama.trim(),
        waNumber: editWaNumber.trim(),
        password: editPassword.trim(),
        loginMethod: editLoginMethod
      };
      
      if (editLoginMethod === 'pin') {
        if (editPin.length !== 6 || !/^\d+$/.test(editPin)) {
          toast.error('PIN harus terdiri dari 6 angka');
          setUpdating(false);
          return;
        }
        updateData.pin = editPin;
      }

      await updateDoc(userDocRef, updateData);
      toast.success('Profil Anda berhasil diperbarui!');
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Gagal memperbarui profil. Silakan coba lagi.');
    } finally {
      setUpdating(false);
    }
  };

  const handlePrintOfficialSlip = (slip: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Gagal membuka jendela cetak. Pastikan pop-up diperbolehkan.');
      return;
    }

    const currentMonthName = format(new Date(slip.bulan + "-02"), 'MMMM yyyy', { locale: id });
    
    // Fallbacks if some metadata isn't frozen yet
    const nama = slip.employee_nama || dbUser?.nama || 'Karyawan';
    const jabatan = slip.employee_jabatan || dbUser?.jabatan || '-';
    const divisi = slip.employee_divisi || dbUser?.divisi || '-';
    const isMonthly = (slip.employee_gaji_type || dbUser?.gaji_type) === 'per_bulan';
    const ratePerJam = slip.employee_gaji_per_jam || dbUser?.gaji_per_jam || 14000;
    const isJunedPrint = nama?.toLowerCase().includes('juned') || false;
    const isAsmaPrint = nama?.toLowerCase().includes('asma') || false;
    const rateLembur = isJunedPrint ? 15000 : (isAsmaPrint ? 16000 : (slip.employee_gaji_lembur_per_jam || dbUser?.gaji_lembur_per_jam || 14000));
    const hasBonusDryer = slip.employee_bonus_dryer_1 !== undefined ? slip.employee_bonus_dryer_1 : dbUser?.bonus_dryer_1;

    // Sum up the grand total salary
    const computedGrandTotal = (slip.grandTotalSalary !== undefined) ? slip.grandTotalSalary : 
      ((slip.basePay || 0) + (slip.totalRegPay || 0) + (slip.totalLemburPay || 0) + (slip.totalDryerBonus || 0) +
      ((slip.tunjangan_makan || 0) + (slip.tunjangan_jabatan || 0) + (slip.tunjangan_transport || 0)) -
      ((slip.potongan_kasbon || 0) + (slip.potongan_bpjs || 0) + (slip.potongan_lain || 0)));

    printWindow.document.write(`
      <html>
      <head>
          <title>Slip Gaji Resmi - ${nama}</title>
          <style>
              body {
                  font-family: 'Courier New', Courier, monospace;
                  padding: 40px;
                  color: #000;
                  background: #fff;
                  max-width: 800px;
                  margin: auto;
              }
              .header {
                  text-align: center;
                  border-bottom: 2px dashed #000;
                  padding-bottom: 20px;
                  margin-bottom: 25px;
              }
              .company-name {
                  font-size: 20px;
                  font-weight: bold;
              }
              .title {
                  font-size: 16px;
                  margin-top: 5px;
              }
              .meta-grid {
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  margin-bottom: 20px;
                  font-size: 13px;
              }
              .table {
                  width: 100%;
                  border-collapse: collapse;
                  margin-top: 15px;
                  margin-bottom: 25px;
              }
              .table th, .table td {
                  padding: 8px;
                  text-align: left;
                  border-bottom: 1px dashed #000;
                  font-size: 13px;
              }
              .table th {
                  font-weight: bold;
              }
              .total-box {
                  border-top: 2px dashed #000;
                  border-bottom: 2px dashed #000;
                  padding: 15px 10px;
                  font-size: 15px;
                  font-weight: bold;
                  display: flex;
                  justify-content: space-between;
                  margin-bottom: 30px;
              }
              .footer-sig {
                  display: flex;
                  justify-content: space-between;
                  margin-top: 50px;
                  font-size: 13px;
              }
              .sig-space {
                  height: 70px;
              }
              @media print {
                  body { padding: 10px; }
              }
          </style>
      </head>
      <body>
          <div class="header">
              <div class="company-name">HADIR 162 - LAUNDRY & DRYING SERVICES</div>
              <div class="title">SLIP GAJI RESMI KARYAWAN</div>
              <div style="font-size: 12px; margin-top: 4px;">Periode Pembayaran: ${currentMonthName}</div>
          </div>

          <div class="meta-grid">
              <div>
                  <strong>Nama Karyawan :</strong> ${nama}<br>
                  <strong>Jabatan       :</strong> ${jabatan}<br>
                  <strong>Divisi        :</strong> ${divisi}
              </div>
              <div style="text-align: right;">
                  <strong>Sistem Gaji   :</strong> ${isMonthly ? 'Bulanan' : 'Per Jam'}<br>
                  <strong>Hari Hadir    :</strong> ${slip.daysPresent || 0} Hari<br>
                  <strong>Status Gaji   :</strong> <span style="font-weight: bold; text-transform: uppercase; color: ${slip.status === 'paid' ? '#059669' : '#2563eb'}">${slip.status || 'approved'}</span><br>
                  <strong>Tanggal Cetak :</strong> ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}
              </div>
          </div>

          <h3>Rincian Perhitungan Upah</h3>
          <table class="table">
              <thead>
                  <tr>
                      <th>Komponen Gaji</th>
                      <th>Kuantitas / Tarif</th>
                      <th style="text-align: right;">Jumlah</th>
                  </tr>
              </thead>
              <tbody>
                  ${isMonthly ? `
                      <tr>
                          <td>Gaji Pokok Bulanan</td>
                          <td>Fixed (1 Bulan)</td>
                          <td style="text-align: right;">Rp ${(slip.basePay || 0).toLocaleString('id-ID')}</td>
                      </tr>
                  ` : `
                      <tr>
                          <td>Gaji Kerja Reguler</td>
                          <td>${(slip.totalRegularHours || 0).toFixed(1)} Jam × Rp ${ratePerJam.toLocaleString('id-ID')}/jam</td>
                          <td style="text-align: right;">Rp ${(slip.totalRegPay || 0).toLocaleString('id-ID')}</td>
                      </tr>
                  `}
                  <tr>
                      <td>Uang Lembur (Overtime)</td>
                      <td>${(slip.totalLemburHours || 0).toFixed(1)} Jam × Rp ${rateLembur.toLocaleString('id-ID')}/jam</td>
                      <td style="text-align: right;">Rp ${(slip.totalLemburPay || 0).toLocaleString('id-ID')}</td>
                  </tr>
                  ${hasBonusDryer ? `
                      <tr>
                          <td>Insentif Bonus Dryer 1 Aktif</td>
                          <td>Hadir Dryer 1 Menyala</td>
                          <td style="text-align: right;">Rp ${(slip.totalDryerBonus || 0).toLocaleString('id-ID')}</td>
                      </tr>
                  ` : ''}
                  ${slip.tunjangan_makan ? `
                      <tr>
                          <td>Tunjangan Makan</td>
                          <td>Penyesuaian Bulanan</td>
                          <td style="text-align: right; color: #059669;">+Rp ${slip.tunjangan_makan.toLocaleString('id-ID')}</td>
                      </tr>
                  ` : ''}
                  ${slip.tunjangan_jabatan ? `
                      <tr>
                          <td>Tunjangan Jabatan</td>
                          <td>Penyesuaian Bulanan</td>
                          <td style="text-align: right; color: #059669;">+Rp ${slip.tunjangan_jabatan.toLocaleString('id-ID')}</td>
                      </tr>
                  ` : ''}
                  ${slip.tunjangan_transport ? `
                      <tr>
                          <td>Tunjangan Transport</td>
                          <td>Penyesuaian Bulanan</td>
                          <td style="text-align: right; color: #059669;">+Rp ${slip.tunjangan_transport.toLocaleString('id-ID')}</td>
                      </tr>
                  ` : ''}
                  ${slip.potongan_kasbon ? `
                      <tr>
                          <td>Potongan Kasbon / Pinjaman</td>
                          <td>Penyesuaian Bulanan</td>
                          <td style="text-align: right; color: #dc2626;">-Rp ${slip.potongan_kasbon.toLocaleString('id-ID')}</td>
                      </tr>
                  ` : ''}
                  ${slip.potongan_bpjs ? `
                      <tr>
                          <td>Potongan BPJS</td>
                          <td>Penyesuaian Bulanan</td>
                          <td style="text-align: right; color: #dc2626;">-Rp ${slip.potongan_bpjs.toLocaleString('id-ID')}</td>
                      </tr>
                  ` : ''}
                  ${slip.potongan_lain ? `
                      <tr>
                          <td>Potongan Lain-lain</td>
                          <td>Penyesuaian Bulanan</td>
                          <td style="text-align: right; color: #dc2626;">-Rp ${slip.potongan_lain.toLocaleString('id-ID')}</td>
                      </tr>
                  ` : ''}
              </tbody>
          </table>

          <div class="total-box">
              <span>TOTAL GAJI DITERIMA (TAKE HOME PAY)</span>
              <span>Rp ${computedGrandTotal.toLocaleString('id-ID')}</span>
          </div>

          ${slip.catatan ? `
              <div style="font-size: 11px; margin-top: 15px; margin-bottom: 25px; border: 1px dashed #000; padding: 10px; background: #fafafa; border-radius: 4px;">
                  <strong>Catatan Slip:</strong> ${slip.catatan}
              </div>
          ` : ''}

          <div class="footer-sig">
              <div style="text-align: center; width: 200px;">
                  Penerima,<br><br>
                  <div class="sig-space"></div>
                  ( ____________________ )<br>
                  ${nama}
              </div>
              <div style="text-align: center; width: 200px;">
                  Mengetahui,<br>
                  Manajer Keuangan / Admin<br>
                  <div class="sig-space"></div>
                  ( ____________________ )<br>
                  Hadir 162 Admin
              </div>
          </div>

          <script>
              window.onload = function() {
                  window.print();
              }
          </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const toggleTheme = () => {
    setIsDaytime(!isDaytime);
    toast.success(!isDaytime ? 'Beralih ke Tema Siang' : 'Beralih ke Tema Malam');
  };

  if (!dbUser) return <div className="p-8 text-center text-slate-500 font-medium">Memuat profil...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`md:col-span-2 rounded-2xl p-6 md:p-8 text-white shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[220px] transition-all duration-500 bg-gradient-to-br ${isDaytime ? 'from-sky-500 via-blue-600 to-indigo-700' : 'from-slate-950 via-slate-900 to-indigo-950 border border-indigo-500/20 shadow-[0_0_25px_rgba(99,102,241,0.15)]'}`}>
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
        
        <div className="md:col-span-1">
          <RealTimeClock variant="card" className="h-full flex flex-col justify-between" />
        </div>
      </div>

      {/* Stats Cards Row (Dynamic Icon Set and Styles based on Day/Night) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className={`p-6 rounded-2xl border shadow-sm flex items-center space-x-4 transition-all duration-500 col-span-1 ${themeCardBg}`}>
          <div className={`p-3 rounded-xl transition-colors duration-500 ${isDaytime ? 'bg-blue-50 text-blue-600' : 'bg-cyan-950/60 text-cyan-400 border border-cyan-500/30'}`}>
             <UserCircle2 size={24} />
          </div>
          <div>
            <p className={`text-sm font-medium ${themeTextLabel}`}>Jabatan</p>
            <p className={`font-semibold ${themeTextVal}`}>{dbUser.jabatan || '-'}</p>
          </div>
        </div>
        <div className={`p-6 rounded-2xl border shadow-sm flex items-center space-x-4 transition-all duration-500 col-span-1 ${themeCardBg}`}>
          <div className={`p-3 rounded-xl transition-colors duration-500 ${isDaytime ? 'bg-indigo-50 text-indigo-600' : 'bg-purple-950/60 text-purple-400 border border-purple-500/30'}`}>
             <Briefcase size={24} />
          </div>
          <div>
            <p className={`text-sm font-medium ${themeTextLabel}`}>Divisi</p>
            <p className={`font-semibold ${themeTextVal}`}>{dbUser.divisi || '-'}</p>
          </div>
        </div>
        <div className={`p-6 rounded-2xl border shadow-sm flex items-center space-x-4 transition-all duration-500 col-span-2 lg:col-span-1 ${themeCardBg}`}>
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
      
      {/* Summary and Trends Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Today's Summary Card */}
        <div className={`rounded-2xl border p-6 transition-all duration-500 ${themeCardBg} md:col-span-1 flex flex-col justify-between`}>
          <div>
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
               <div className={`text-center py-12 ${themeTextLabel}`}>
                 <p className="text-sm font-medium">Anda belum melakukan absensi hari ini.</p>
                 <p className="text-xs text-slate-400 mt-1">Silakan lakukan presensi masuk di menu Check-in.</p>
               </div>
            )}
          </div>
        </div>

        {/* Weekly Attendance Trend Card */}
        <div className={`rounded-2xl border p-6 transition-all duration-500 ${themeCardBg} md:col-span-2 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-lg font-bold flex items-center gap-2 ${themeTextVal}`}>
                <BarChart2 size={20} className={isDaytime ? "text-blue-500" : "text-indigo-400"} />
                Tren Kehadiran Mingguan Anda
              </h3>
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Minggu Ini
              </span>
            </div>
            <p className={`text-xs ${themeTextLabel} mb-4`}>
              Statistik perbandingan status presensi (Tepat Waktu vs Terlambat) dari Senin s/d Jumat.
            </p>
          </div>

          <div className="h-48 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTrends} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDaytime ? "#f1f5f9" : "#1e293b"} />
                <XAxis dataKey="name" stroke={isDaytime ? "#94a3b8" : "#64748b"} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={isDaytime ? "#94a3b8" : "#64748b"} fontSize={11} tickLine={false} axisLine={false} ticks={[0, 1]} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: isDaytime ? '#0f172a' : '#1e293b', 
                    borderRadius: '12px', 
                    border: 'none', 
                    color: '#fff',
                    fontSize: '12px' 
                  }}
                  labelStyle={{ fontWeight: 'bold', color: '#94a3b8' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Tepat Waktu" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="Terlambat" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={`flex items-center justify-between border-t ${themeBorder} pt-4 mt-4 text-xs`}>
            <span className={`${themeTextLabel} font-medium`}>Ringkasan Minggu Ini:</span>
            <div className="flex gap-3 text-[11px] font-bold">
              <span className="text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                {weeklyTrends.filter(t => t['Tepat Waktu'] > 0).length} Tepat Waktu
              </span>
              <span className="text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md">
                {weeklyTrends.filter(t => t['Terlambat'] > 0).length} Terlambat
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Salary & Payroll Card */}
      <div className={`rounded-2xl border p-6 transition-all duration-500 ${themeCardBg}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${isDaytime ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20'}`}>
              <span className="text-lg">💰</span>
            </div>
            <div>
              <h3 className={`text-lg font-bold ${themeTextVal}`}>Fitur Gaji & Payroll</h3>
              <p className="text-[11px] text-slate-400 font-medium">Sistem Pengupahan Resmi Hadir 162</p>
            </div>
          </div>
          
          {/* Sub-Tabs Switcher */}
          <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl text-xs font-bold self-stretch sm:self-auto">
            <button
              onClick={() => setActiveSalaryTab('estimasi')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeSalaryTab === 'estimasi'
                  ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Estimasi Bulan Ini
            </button>
            <button
              onClick={() => setActiveSalaryTab('slip')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeSalaryTab === 'slip'
                  ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Slip Gaji Resmi
              {officialPayslips.length > 0 && (
                <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                  {officialPayslips.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeSalaryTab === 'estimasi' ? (
          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Estimasi Berjalan</span>
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 px-2.5 py-1 rounded-full uppercase tracking-wider font-mono">
                {dbUser.gaji_type === 'per_bulan' ? 'Sistem Bulanan' : 'Sistem Per Jam'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Main Earnings */}
              <div className={`p-4 rounded-xl border col-span-1 md:col-span-2 flex flex-col justify-between ${themeFieldBg} ${isDaytime ? 'border-slate-100' : 'border-slate-800/85'}`}>
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">Estimasi Pendapatan Kotor</span>
                <span className="text-2xl md:text-3xl font-black text-emerald-600 font-mono mt-2 block">
                  Rp {(mySalaryStats.estimatedSalary || 0).toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] text-slate-400 block mt-2">
                  *Belum termasuk penyesuaian tunjangan resmi & potongan manual dari admin.
                </span>
              </div>

              {/* Breakdown Stats */}
              <div className={`p-4 rounded-xl border ${themeFieldBg} ${isDaytime ? 'border-slate-100' : 'border-slate-800/85'}`}>
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">Jam Kerja Reguler</span>
                <span className={`text-xl font-bold font-mono mt-2 block ${themeTextVal}`}>
                  {(mySalaryStats.totalRegularHours || 0).toFixed(1)} <span className="text-xs font-sans font-normal text-slate-400">Jam</span>
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  {dbUser.gaji_type === 'per_bulan' 
                    ? 'Termasuk gaji pokok bulanan' 
                    : `Tarif: Rp ${(dbUser.gaji_per_jam || 14000).toLocaleString('id-ID')}/jam`}
                </span>
              </div>

              <div className={`p-4 rounded-xl border ${themeFieldBg} ${isDaytime ? 'border-slate-100' : 'border-slate-800/85'}`}>
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">Lembur (Overtime)</span>
                <span className="text-xl font-bold font-mono text-amber-500 mt-2 block">
                  {(mySalaryStats.totalLemburHours || 0).toFixed(1)} <span className="text-xs font-sans font-normal text-slate-400">Jam</span>
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Tarif: Rp {(
                    dbUser.nama?.toLowerCase().includes('juned') ? 15000 :
                    dbUser.nama?.toLowerCase().includes('asma') ? 16000 :
                    (dbUser.gaji_lembur_per_jam || 14000)
                  ).toLocaleString('id-ID')}/jam
                </span>
              </div>
            </div>

            {/* Detailed Breakdown list */}
            <div className={`mt-6 p-4 rounded-xl border border-dashed text-xs space-y-2.5 ${isDaytime ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/20 border-slate-800'}`}>
              <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-1.5 border-b border-slate-100/50">
                <span>Komponen Upah</span>
                <span>Jumlah</span>
              </div>
              {dbUser.gaji_type === 'per_bulan' && (
                <div className="flex justify-between items-center">
                  <span className={themeTextLabel}>Gaji Pokok Bulanan</span>
                  <span className={`font-mono font-bold ${themeTextVal}`}>Rp {(dbUser.gaji_bulanan || 0).toLocaleString('id-ID')}</span>
                </div>
              )}
              {dbUser.gaji_type !== 'per_bulan' && (
                <div className="flex justify-between items-center">
                  <span className={themeTextLabel}>Gaji Pokok Per Jam ({(mySalaryStats.totalRegularHours || 0).toFixed(1)} jam × Rp {(dbUser.gaji_per_jam || 14000).toLocaleString('id-ID')})</span>
                  <span className={`font-mono font-bold ${themeTextVal}`}>Rp {((mySalaryStats.totalRegularHours || 0) * (dbUser.gaji_per_jam || 14000)).toLocaleString('id-ID')}</span>
                </div>
              )}
              {(() => {
                const isJunedRender = dbUser.nama?.toLowerCase().includes('juned') || false;
                const isAsmaRender = dbUser.nama?.toLowerCase().includes('asma') || false;
                const renderLemburRate = isJunedRender ? 15000 : (isAsmaRender ? 16000 : (dbUser.gaji_lembur_per_jam || 14000));
                return (
                  <div className="flex justify-between items-center">
                    <span className={themeTextLabel}>Upah Lembur ({(mySalaryStats.totalLemburHours || 0).toFixed(1)} jam × Rp {renderLemburRate.toLocaleString('id-ID')})</span>
                    <span className={`font-mono font-bold text-amber-500`}>Rp {((mySalaryStats.totalLemburHours || 0) * renderLemburRate).toLocaleString('id-ID')}</span>
                  </div>
                );
              })()}
              {dbUser.bonus_dryer_1 && (
                <div className="flex justify-between items-center">
                  <span className={themeTextLabel}>Bonus Insentif Dryer 1 Aktif</span>
                  <span className="font-mono font-bold text-emerald-500">+Rp {(mySalaryStats.totalDryerBonus || 0).toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2.5 border-t border-slate-100/50">
                <span className={`font-bold ${themeTextVal}`}>Kehadiran Bulan Ini</span>
                <span className={`font-mono font-bold ${themeTextVal}`}>{mySalaryStats.daysPresent || 0} Hari Masuk Kerja</span>
              </div>
            </div>
          </div>
        ) : (
          /* Official Payslips History */
          <div className="space-y-4">
            {officialPayslips.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-950/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                <p className="text-xs font-medium">Belum ada slip gaji resmi yang diterbitkan oleh manajemen untuk Anda.</p>
                <p className="text-[10px] text-slate-400 mt-1">Selesai bulan berjalan, manajemen HRD akan mengumumkan dan mempublikasikan slip gaji Anda di sini.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {officialPayslips.map((slip) => {
                  const computedGrandTotal = (slip.grandTotalSalary !== undefined) ? slip.grandTotalSalary : 
                    ((slip.basePay || 0) + (slip.totalRegPay || 0) + (slip.totalLemburPay || 0) + (slip.totalDryerBonus || 0) +
                    ((slip.tunjangan_makan || 0) + (slip.tunjangan_jabatan || 0) + (slip.tunjangan_transport || 0)) -
                    ((slip.potongan_kasbon || 0) + (slip.potongan_bpjs || 0) + (slip.potongan_lain || 0)));

                  return (
                    <div key={slip.id} className={`p-4 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${isDaytime ? 'bg-slate-50/50 border-slate-100' : 'bg-slate-950/30 border-slate-800'}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-800 dark:text-white">
                            {format(new Date(slip.bulan + "-02"), 'MMMM yyyy', { locale: id })}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                            slip.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {slip.status === 'paid' ? '💵 Lunas / Dibayar' : '✅ Disetujui'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-400">
                          <div>Gaji Pokok: <span className="font-semibold text-slate-700 dark:text-slate-300">Rp {(slip.basePay || 0).toLocaleString('id-ID')}</span></div>
                          <div>Reguler: <span className="font-semibold text-slate-700 dark:text-slate-300">Rp {(slip.totalRegPay || 0).toLocaleString('id-ID')}</span></div>
                          <div>Lembur: <span className="font-semibold text-slate-700 dark:text-slate-300">Rp {(slip.totalLemburPay || 0).toLocaleString('id-ID')}</span></div>
                          <div>Hadir: <span className="font-semibold text-slate-700 dark:text-slate-300">{slip.daysPresent || 0} Hari</span></div>
                          {((slip.tunjangan_makan || 0) + (slip.tunjangan_jabatan || 0) + (slip.tunjangan_transport || 0)) > 0 && (
                            <div>Tunjangan: <span className="font-semibold text-emerald-600">+Rp {((slip.tunjangan_makan || 0) + (slip.tunjangan_jabatan || 0) + (slip.tunjangan_transport || 0)).toLocaleString('id-ID')}</span></div>
                          )}
                          {((slip.potongan_kasbon || 0) + (slip.potongan_bpjs || 0) + (slip.potongan_lain || 0)) > 0 && (
                            <div>Potongan: <span className="font-semibold text-rose-600">-Rp {((slip.potongan_kasbon || 0) + (slip.potongan_bpjs || 0) + (slip.potongan_lain || 0)).toLocaleString('id-ID')}</span></div>
                          )}
                        </div>
                        {slip.catatan && (
                          <p className="text-[10px] italic text-slate-400 mt-1.5 dark:text-slate-500">Catatan HRD: "{slip.catatan}"</p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t dark:border-slate-800 md:border-t-0 pt-2.5 md:pt-0">
                        <div className="text-left md:text-right">
                          <span className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider">Total Bersih</span>
                          <span className="text-sm font-extrabold text-blue-600 font-mono">
                            Rp {computedGrandTotal.toLocaleString('id-ID')}
                          </span>
                        </div>
                        <button
                          onClick={() => handlePrintOfficialSlip(slip)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-[10px] shadow-sm cursor-pointer select-none active:scale-95 transition-all shrink-0"
                        >
                          Cetak Slip (PDF)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                setEditLoginMethod(dbUser.loginMethod || 'password');
                setEditPin(dbUser.pin || '');
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
            <div className={`p-4 rounded-xl border transition-all ${themeFieldBg} ${isDaytime ? 'border-slate-100' : 'border-slate-800/85'}`}>
              <span className="text-xs text-slate-400 font-medium block mb-1">Preferensi Login Utama</span>
              <span className={`text-sm font-semibold ${themeTextVal}`}>
                {dbUser.loginMethod === 'pin' ? 'PIN 6-Digit (Aktif)' : 'Kata Sandi Teks'}
              </span>
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

              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${themeTextLabel}`}>Metode Login Utama</label>
                  <select
                    value={editLoginMethod}
                    onChange={(e) => setEditLoginMethod(e.target.value as 'password' | 'pin')}
                    className={`w-full px-4 py-2.5 rounded-xl outline-none text-sm font-medium transition-all border ${themeInputBg}`}
                  >
                    <option value="password">Kata Sandi Teks</option>
                    <option value="pin">PIN 6-Digit</option>
                  </select>
                </div>
                {editLoginMethod === 'pin' && (
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${themeTextLabel}`}>PIN 6-Digit Baru</label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={editPin}
                      onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Masukkan 6 angka PIN baru"
                      className={`w-full px-4 py-2.5 rounded-xl outline-none text-sm font-medium transition-all border ${themeInputBg} font-mono`}
                    />
                  </div>
                )}
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
