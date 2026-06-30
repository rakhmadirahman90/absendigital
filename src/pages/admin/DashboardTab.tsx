import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, getDocs, limit, orderBy } from 'firebase/firestore';
import { Users, CheckCircle, Clock, Download, BarChart2, AlertCircle, Eye, Calendar, ArrowRight, FileCheck, CheckCircle2, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend } from 'recharts';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';

export default function DashboardTab() {
  const [stats, setStats] = useState<any>({
    totalKaryawan: 0,
    hadirHariIni: 0,
    izinCutiHariIni: 0,
    terlambat: 0,
    belumAbsen: 0
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setLoading(true);

    // 1. Fetch Users map and total employees
    const unsubUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
      const map: Record<string, any> = {};
      usersSnap.forEach(doc => {
        map[doc.id] = { id: doc.id, ...doc.data() };
      });
      setUsersMap(map);
      
      const totalKaryawan = usersSnap.size;
      setStats(prev => {
        const belumAbsen = Math.max(0, totalKaryawan - (prev.hadirHariIni || 0) - (prev.izinCutiHariIni || 0));
        return { ...prev, totalKaryawan, belumAbsen };
      });
    });

    // 2. Monitor Today's Attendance Real-time
    const unsubAttendance = onSnapshot(query(collection(db, 'attendance'), where('tanggal', '==', today)), (attendanceSnap) => {
      let hadirHariIni = attendanceSnap.size;
      let terlambat = 0;
      const logs: any[] = [];
      
      attendanceSnap.forEach(doc => {
        const data = doc.data();
        if (data.status === 'Terlambat') {
          terlambat++;
        }
        logs.push({ id: doc.id, ...data });
      });

      // Sort logs by jam_masuk descending for real-time feed
      logs.sort((a, b) => (b.jam_masuk || '').localeCompare(a.jam_masuk || ''));
      setRecentAttendance(logs.slice(0, 5));

      setStats(prev => {
        const belumAbsen = Math.max(0, (prev.totalKaryawan || 0) - hadirHariIni - (prev.izinCutiHariIni || 0));
        return { ...prev, hadirHariIni, terlambat, belumAbsen };
      });
    });

    // 3. Monitor Today's Approved Leaves
    const unsubLeave = onSnapshot(query(collection(db, 'leave_requests'), where('tanggal_mulai', '<=', today)), (leaveSnap) => {
      let izinCutiHariIni = 0;
      leaveSnap.forEach(doc => {
        const data = doc.data();
        if (data.status === 'approved' && data.tanggal_akhir >= today) {
          izinCutiHariIni++;
        }
      });
      
      setStats(prev => {
        const belumAbsen = Math.max(0, (prev.totalKaryawan || 0) - (prev.hadirHariIni || 0) - izinCutiHariIni);
        return { ...prev, izinCutiHariIni, belumAbsen };
      });
    });

    // 4. Monitor Pending Approvals (Leave Requests + Overtimes)
    const unsubLeavePending = onSnapshot(query(collection(db, 'leave_requests'), where('status', '==', 'pending')), (leaveSnap) => {
      const leaves: any[] = [];
      leaveSnap.forEach(doc => {
        leaves.push({ id: doc.id, type: 'leave', category: 'Cuti/Izin', timestamp: doc.data().created_at || '', ...doc.data() });
      });

      // Get pending overtimes too
      const unsubOvertimePending = onSnapshot(query(collection(db, 'overtime'), where('status', '==', 'pending')), (otSnap) => {
        const ots: any[] = [];
        otSnap.forEach(doc => {
          ots.push({ id: doc.id, type: 'overtime', category: 'Lembur', timestamp: doc.data().tanggal || '', ...doc.data() });
        });

        // Combine and sort by timestamp
        const combined = [...leaves, ...ots].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        setPendingSubmissions(combined.slice(0, 5));
        setLoading(false);
      });

      return () => unsubOvertimePending();
    });

    // 5. Monitor Current Week's Attendance Trends (On-Time vs Late)
    const unsubWeeklyTrends = onSnapshot(collection(db, 'attendance'), (snapshot) => {
      const current = new Date();
      const day = current.getDay();
      const mondayDiff = day === 0 ? -6 : 1 - day;
      const monday = new Date(current);
      monday.setDate(current.getDate() + mondayDiff);
      
      const weekDates = [];
      const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'];
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        weekDates.push({
          name: dayNames[i],
          dateStr: d.toISOString().split('T')[0]
        });
      }

      const allRecords = snapshot.docs.map(doc => doc.data());
      
      const parsedWeekly = weekDates.map(wd => {
        const dayRecords = allRecords.filter((r: any) => r.tanggal === wd.dateStr);
        const tepatWaktu = dayRecords.filter((r: any) => r.status !== 'Terlambat').length;
        const terlambat = dayRecords.filter((r: any) => r.status === 'Terlambat').length;
        
        return {
          name: wd.name,
          'Tepat Waktu': tepatWaktu,
          'Terlambat': terlambat,
        };
      });
      
      setWeeklyData(parsedWeekly);
    });

    return () => {
      unsubUsers();
      unsubAttendance();
      unsubLeave();
      unsubLeavePending();
      unsubWeeklyTrends();
    };
  }, []);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const attendanceSnap = await getDocs(collection(db, 'attendance'));
      const records: any[] = [];
      
      attendanceSnap.forEach(doc => {
         const data = doc.data();
         const user = usersMap[data.user_id] || {};
         records.push({
           Tanggal: data.tanggal,
           'Nama Karyawan': user.nama || 'Tidak Dikenal',
           Divisi: user.divisi || '-',
           'Jam Masuk': data.jam_masuk || '-',
           'Jam Pulang': data.jam_pulang || '-',
           Status: data.status || '-'
         });
      });

      if (records.length === 0) {
        toast.error('Tidak ada rekaman data absensi ditemukan');
        return;
      }

      records.sort((a, b) => b.Tanggal.localeCompare(a.Tanggal));

      const headers = Object.keys(records[0]).join(',');
      const rows = records.map(r => Object.values(r).map(v => `"${v}"`).join(','));
      const csv = [headers, ...rows].join('\n');

      const url = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `rekap_absensi_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Laporan berhasil diunduh!');
    } catch (error) {
      console.error('Error exporting data', error);
      toast.error('Gagal mengunduh data absensi.');
    } finally {
      setExporting(false);
    }
  };

  const attendanceRate = stats.totalKaryawan > 0 
    ? Math.round(((stats.hadirHariIni + stats.izinCutiHariIni) / stats.totalKaryawan) * 100) 
    : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-sm font-semibold text-slate-500">Memuat analisis dashboard admin...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Premium Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Hadir 162 • US Bilibili 162</span>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight mt-0.5">Ringkasan Eksekutif</h2>
          <p className="text-xs text-slate-400 mt-1">Pantau dan kelola presensi karyawan, perizinan, serta rekap data langsung secara real-time.</p>
        </div>
        <button 
          onClick={handleExportCSV}
          disabled={exporting}
          className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-500/15 disabled:opacity-50 cursor-pointer"
        >
          <Download size={15} />
          <span>{exporting ? 'Mengekspor...' : 'Unduh Rekap CSV'}</span>
        </button>
      </div>

      {/* Bento Grid Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Karyawan */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Karyawan</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-800 font-sans">{stats.totalKaryawan}</span>
            <span className="text-xs text-slate-400 font-semibold">Aktif</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-500" />
        </div>

        {/* Hadir Hari Ini */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Hadir Hari Ini</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-emerald-600 font-sans">{stats.hadirHariIni}</span>
            <span className="text-xs text-slate-400 font-semibold">Presensi</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-emerald-500" />
        </div>

        {/* Izin/Cuti */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">Sedang Izin/Cuti</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Calendar size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-amber-600 font-sans">{stats.izinCutiHariIni}</span>
            <span className="text-xs text-slate-400 font-semibold">Orang</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-amber-500" />
        </div>

        {/* Terlambat */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-rose-500 uppercase tracking-wider">Terlambat</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <Clock size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-rose-600 font-sans">{stats.terlambat}</span>
            <span className="text-xs text-slate-400 font-semibold">Karyawan</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-rose-500" />
        </div>

        {/* Belum Absen */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Belum Presensi</span>
            <div className="p-2 bg-slate-50 text-slate-600 rounded-xl">
              <AlertCircle size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-700 font-sans">{stats.belumAbsen}</span>
            <span className="text-xs text-slate-400 font-semibold">Sisa</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-400" />
        </div>
      </div>

      {/* Main Charts and Widgets Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Weekly Chart Panel */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <BarChart2 size={18} className="text-blue-500" /> Kehadiran Mingguan (Jumlah Karyawan)
            </h3>
            <p className="text-xs text-slate-400 mt-1">Menampilkan statistik total kehadiran harian dari hari Senin sampai Jumat.</p>
          </div>
          
          <div className="h-64 w-full mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                  labelStyle={{ fontWeight: 'bold', color: '#94a3b8' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Tepat Waktu" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="Terlambat" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4 text-xs">
            <span className="text-slate-400 font-medium">Tingkat Partisipasi Rata-rata</span>
            <span className="text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg">~88.2% Kehadiran</span>
          </div>
        </div>

        {/* Dynamic Circular Attendance Rate Widget */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">Rasio Presensi</h3>
            <p className="text-xs text-slate-400 mt-1">Rasio kehadiran & perizinan karyawan hari ini.</p>
          </div>

          <div className="flex flex-col items-center justify-center my-6">
            <div className="relative w-36 h-36 flex items-center justify-center">
              {/* Outer circular indicator using svg */}
              <svg className="w-full h-full transform -rotate-90">
                <circle 
                  cx="72" 
                  cy="72" 
                  r="60" 
                  stroke="#f1f5f9" 
                  strokeWidth="12" 
                  fill="transparent" 
                />
                <circle 
                  cx="72" 
                  cy="72" 
                  r="60" 
                  stroke={attendanceRate >= 80 ? "#10b981" : (attendanceRate >= 50 ? "#f59e0b" : "#ef4444")} 
                  strokeWidth="12" 
                  fill="transparent" 
                  strokeDasharray={377}
                  strokeDashoffset={377 - (377 * attendanceRate) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-3xl font-black text-slate-800">{attendanceRate}%</span>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Tercapai</p>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex justify-between items-center text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Hadir & Izin
              </span>
              <span className="text-slate-800 font-bold">{stats.hadirHariIni + stats.izinCutiHariIni} Orang</span>
            </div>
            <div className="flex justify-between items-center text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-300"></span> Belum Absen
              </span>
              <span className="text-slate-800 font-bold">{stats.belumAbsen} Karyawan</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Real-time Feed and Quick Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Real-time Presence Feed */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <RefreshCw size={17} className="text-blue-500 animate-spin-slow" /> Aktivitas Presensi Terbaru
              </h3>
              <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full uppercase tracking-wider">Live</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">Daftar 5 karyawan terakhir yang melakukan check-in atau check-out hari ini.</p>
          </div>

          <div className="divide-y divide-slate-100 overflow-hidden">
            {recentAttendance.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Belum ada aktivitas presensi terekam hari ini.
              </div>
            ) : (
              recentAttendance.map(log => {
                const user = usersMap[log.user_id] || {};
                const isLate = log.status === 'Terlambat';
                return (
                  <div key={log.id} className="py-3.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors rounded-xl px-2">
                    <div className="flex items-center space-x-3 min-w-0">
                      {log.selfie_masuk ? (
                        <div className="w-9 h-9 rounded-xl overflow-hidden border border-slate-100 bg-slate-100 shrink-0 shadow-inner">
                          <img 
                            src={log.selfie_masuk} 
                            alt="Selfie" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-bold text-sm border border-blue-100 shadow-sm">
                          {user.nama?.substring(0, 1).toUpperCase() || 'K'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-700 truncate">{user.nama || 'Tidak Dikenal'}</p>
                        <p className="text-[10px] text-slate-400 truncate">{user.divisi || '-'} • {log.alamat_masuk ? log.alamat_masuk.split(',')[0] : 'Lokasi Terdaftar'}</p>
                      </div>
                    </div>
                    
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-slate-600 block">{log.jam_masuk}</span>
                      <span className={`inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider mt-0.5 ${isLate ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                        {log.status || 'Hadir'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          <div className="border-t border-slate-100 pt-4 mt-4 text-center">
            <Link 
              to="/admin/absensi" 
              className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1.5 transition-all"
            >
              Lihat Detail Semua Presensi <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Quick Pending Approvals Queue */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <FileCheck size={18} className="text-amber-500" /> Menunggu Persetujuan
              </h3>
              {pendingSubmissions.length > 0 && (
                <span className="text-[10px] font-extrabold bg-amber-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                  {pendingSubmissions.length} Pending
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">Berikut adalah pengajuan cuti, izin, atau lembur karyawan terbaru yang memerlukan verifikasi Anda.</p>
          </div>

          <div className="divide-y divide-slate-100 overflow-hidden">
            {pendingSubmissions.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs flex flex-col items-center justify-center space-y-1">
                <CheckCircle2 size={32} className="text-slate-300 mb-2" />
                <span>Semua pengajuan telah diproses!</span>
                <span className="text-[10px] text-slate-400 font-normal">Kerja bagus, tidak ada antrean pending.</span>
              </div>
            ) : (
              pendingSubmissions.map(req => {
                const user = usersMap[req.user_id] || {};
                const isLeave = req.type === 'leave';
                return (
                  <div key={req.id} className="py-3.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors rounded-xl px-2">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm shadow-sm ${isLeave ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-purple-50 text-purple-600 border border-purple-100'}`}>
                        {isLeave ? 'C' : 'L'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-700 truncate">{user.nama || 'Tidak Dikenal'}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {isLeave 
                            ? `Cuti/Izin: ${req.tipe || 'Keperluan'} • Alasan: "${req.alasan || '-'}"` 
                            : `Lembur: ${req.durasi_jam || 0} Jam • Ket: "${req.keterangan || '-'}"`
                          }
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">
                        {isLeave ? (req.tanggal_mulai ? req.tanggal_mulai.split('-').reverse().join('/') : '-') : (req.tanggal ? req.tanggal.split('-').reverse().join('/') : '-')}
                      </span>
                      <span className={`inline-block text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${isLeave ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}`}>
                        {req.category}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4 text-center">
            <Link 
              to="/admin/approval" 
              className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1.5 transition-all"
            >
              Proses Pengajuan Sekarang <ArrowRight size={14} />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
