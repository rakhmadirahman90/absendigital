import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { 
  Clock, 
  MapPin, 
  Image as ImageIcon, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  X, 
  ExternalLink, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  FileText,
  User,
  Building,
  MapPinOff,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function History() {
  const { user, dbUser } = useAuth();
  
  // Data States
  const [history, setHistory] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Hadir' | 'Terlambat'>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all'); // format: YYYY-MM

  // Interaction States
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    
    setLoading(true);

    // 1. Fetch Attendance History
    const qAttendance = query(
      collection(db, 'attendance'),
      where('user_id', '==', user.uid)
    );
    
    const unsubAttendance = onSnapshot(qAttendance, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      records.sort((a: any, b: any) => b.tanggal.localeCompare(a.tanggal));
      setHistory(records);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching attendance history: ", error);
      setLoading(false);
    });

    // 2. Fetch Leave/Permit Requests for Stat calculation
    const qLeaves = query(
      collection(db, 'leave_requests'),
      where('user_id', '==', user.uid)
    );

    const unsubLeaves = onSnapshot(qLeaves, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeaveRequests(records);
    }, (error) => {
      console.error("Error fetching leave requests: ", error);
    });

    // 3. Fetch Overtime Requests for Stat calculation
    const qOvertimes = query(
      collection(db, 'overtime'),
      where('user_id', '==', user.uid)
    );

    const unsubOvertimes = onSnapshot(qOvertimes, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOvertimeRequests(records);
    }, (error) => {
      console.error("Error fetching overtime requests: ", error);
    });

    return () => {
      unsubAttendance();
      unsubLeaves();
      unsubOvertimes();
    };
  }, [user]);

  // Calculations for Statistics Cards
  const totalHadir = history.filter(item => item.status === 'Hadir').length;
  const totalTerlambat = history.filter(item => item.status === 'Terlambat').length;
  const totalPresensi = totalHadir + totalTerlambat;
  
  const presentRate = totalPresensi > 0 
    ? Math.round((totalHadir / totalPresensi) * 100) 
    : 100;

  // Count approved leave requests
  const totalIzinCutiApproved = leaveRequests.filter(item => item.status === 'approved').length;
  
  // Sum approved overtime hours
  const totalLemburHoursApproved = overtimeRequests
    .filter(item => item.status === 'approved')
    .reduce((sum, item) => sum + (Number(item.durasi_jam) || 0), 0);

  // Generate Unique Month Options from history for Month Selector (YYYY-MM format)
  const monthOptions = (Array.from(
    new Set(
      history.map(item => {
        const date = new Date(item.tanggal);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      })
    )
  ) as string[]).sort((a, b) => b.localeCompare(a));

  // Helper to format Month/Year name
  const formatMonthYearOption = (val: string) => {
    const [year, month] = val.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return format(date, 'MMMM yyyy', { locale: idLocale });
  };

  // Helper to calculate duration worked
  const calculateWorkDuration = (jamMasuk?: string, jamPulang?: string) => {
    if (!jamMasuk || !jamPulang) return null;
    try {
      const [h1, m1, s1] = jamMasuk.split(':').map(Number);
      const [h2, m2, s2] = jamPulang.split(':').map(Number);
      
      let diffSecs = (h2 * 3600 + m2 * 60 + (s2 || 0)) - (h1 * 3600 + m1 * 60 + (s1 || 0));
      if (diffSecs < 0) diffSecs += 24 * 3600; // Crosses midnight
      
      const hours = Math.floor(diffSecs / 3600);
      const minutes = Math.floor((diffSecs % 3600) / 60);
      return { hours, minutes, text: `${hours} jam ${minutes} menit` };
    } catch (e) {
      return null;
    }
  };

  // Filter handler
  const filteredHistory = history.filter(item => {
    // 1. Search Query filter (matches date or notes/address)
    const matchesSearch = 
      item.tanggal.includes(searchQuery) ||
      (item.alamat_masuk && item.alamat_masuk.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.alamat_pulang && item.alamat_pulang.toLowerCase().includes(searchQuery.toLowerCase()));

    // 2. Status Filter
    const matchesStatus = 
      statusFilter === 'all' || 
      item.status === statusFilter;

    // 3. Month Filter
    let matchesMonth = true;
    if (monthFilter !== 'all') {
      const itemMonth = item.tanggal.substring(0, 7); // "YYYY-MM"
      matchesMonth = itemMonth === monthFilter;
    }

    return matchesSearch && matchesStatus && matchesMonth;
  });

  // Action: Export CSV
  const handleExportCSV = () => {
    if (filteredHistory.length === 0) {
      toast.error('Tidak ada data untuk diekspor.');
      return;
    }

    const headers = ['No', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Alamat Masuk', 'Alamat Pulang', 'Latitude Masuk', 'Longitude Masuk', 'Latitude Pulang', 'Longitude Pulang'];
    const rows = filteredHistory.map((item, idx) => [
      idx + 1,
      item.tanggal,
      item.jam_masuk || '-',
      item.jam_pulang || '-',
      item.status || 'Hadir',
      item.alamat_masuk ? `"${item.alamat_masuk.replace(/"/g, '""')}"` : '-',
      item.alamat_pulang ? `"${item.alamat_pulang.replace(/"/g, '""')}"` : '-',
      item.latitude_masuk || '-',
      item.longitude_masuk || '-',
      item.latitude_pulang || '-',
      item.longitude_pulang || '-'
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    const nameStr = dbUser?.nama ? dbUser.nama.replace(/\s+/g, '_') : 'Karyawan';
    const monthStr = monthFilter !== 'all' ? `_${monthFilter}` : '';
    
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_Absensi_${nameStr}${monthStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Laporan berhasil diekspor ke CSV.');
  };

  // Action: Print Report Page (Generates printable HTML iframe/overlay)
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Printable Style Sheet Override */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 no-print">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Clock className="text-blue-600" size={26} />
            Riwayat Kehadiran
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Pantau rincian kehadiran harian Anda, unduh laporan, serta lihat rekapitulasi data.
          </p>
        </div>
        
        {/* Actions Button */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePrint}
            disabled={filteredHistory.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl border border-slate-200 shadow-sm transition-all text-sm disabled:opacity-50 cursor-pointer"
          >
            <Printer size={16} />
            Cetak / PDF
          </button>
          <button
            onClick={handleExportCSV}
            disabled={filteredHistory.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all text-sm disabled:opacity-50 cursor-pointer"
          >
            <Download size={16} />
            Ekspor CSV
          </button>
        </div>
      </div>

      {/* Statistics Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        {/* 1. Kehadiran Tepat Waktu */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Hadir Tepat Waktu</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-slate-800">{totalHadir}</span>
            <span className="text-xs font-semibold text-slate-400">Hari</span>
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-2 bg-emerald-50 px-2 py-0.5 rounded-full w-max flex items-center gap-1">
            <TrendingUp size={12} />
            <span>Tingkat Ketepatan: {presentRate}%</span>
          </div>
        </div>

        {/* 2. Terlambat */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Terlambat</span>
            <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
              <AlertCircle size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-slate-800">{totalTerlambat}</span>
            <span className="text-xs font-semibold text-slate-400">Hari</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">
            {totalTerlambat > 0 ? 'Harap tingkatkan kedisiplinan Anda' : 'Kerja bagus, pertahankan!'}
          </p>
        </div>

        {/* 3. Izin & Cuti disetujui */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cuti / Izin Disetujui</span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <FileText size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-slate-800">{totalIzinCutiApproved}</span>
            <span className="text-xs font-semibold text-slate-400">Pengajuan</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">
            Mencakup izin sakit, keperluan pribadi & cuti tahunan.
          </p>
        </div>

        {/* 4. Total Jam Lembur Disetujui */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Lembur Disetujui</span>
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Clock size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-slate-800">{totalLemburHoursApproved}</span>
            <span className="text-xs font-semibold text-slate-400">Jam Kerja</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">
            Akumulasi durasi lembur resmi yang telah divalidasi.
          </p>
        </div>
      </div>

      {/* Filter Options Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Month Filter */}
          <div>
            <label htmlFor="month-select" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pilih Bulan</label>
            <select
              id="month-select"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 bg-white cursor-pointer font-medium"
            >
              <option value="all">Semua Bulan</option>
              {monthOptions.map(opt => (
                <option key={opt} value={opt}>{formatMonthYearOption(opt)}</option>
              ))}
            </select>
          </div>

          {/* 2. Status Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Status Presensi</label>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all text-center ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Hadir')}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all text-center ${
                  statusFilter === 'Hadir'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-500 hover:text-emerald-600'
                }`}
              >
                Tepat Waktu
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Terlambat')}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all text-center ${
                  statusFilter === 'Terlambat'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'text-slate-500 hover:text-rose-600'
                }`}
              >
                Terlambat
              </button>
            </div>
          </div>

          {/* 3. Text Search */}
          <div>
            <label htmlFor="search-input" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cari Alamat / Tanggal</label>
            <div className="relative">
              <input
                id="search-input"
                type="text"
                placeholder="Cari lokasi, alamat, atau YYYY-MM-DD..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 placeholder-slate-400"
              />
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Query Indicator Info */}
        {(monthFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Ditemukan <strong>{filteredHistory.length}</strong> data dari total {history.length} rekaman absensi Anda.</span>
            <button
              onClick={() => { setMonthFilter('all'); setStatusFilter('all'); setSearchQuery(''); }}
              className="text-blue-600 font-bold hover:underline"
            >
              Bersihkan Filter
            </button>
          </div>
        )}
      </div>

      {/* Desktop & Mobile Main Attendance List View */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden no-print">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-16 text-slate-500 space-y-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-semibold">Memuat riwayat kehadiran...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center text-slate-400 space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
              <Calendar size={28} />
            </div>
            <div>
              <h4 className="font-bold text-slate-700">Tidak Ada Rekaman Absensi</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {history.length === 0 
                  ? 'Anda belum pernah mencatat absensi di sistem ini.' 
                  : 'Tidak ada rekaman yang cocok dengan filter pencarian aktif Anda.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* 1. TABLE FOR DESKTOP VIEWS */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Hari / Tanggal</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Masuk</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Pulang</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Durasi Kerja</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.map((record) => {
                    const dur = calculateWorkDuration(record.jam_masuk, record.jam_pulang);
                    return (
                      <tr 
                        key={record.id} 
                        onClick={() => setSelectedRecord(record)}
                        className="hover:bg-slate-50/75 cursor-pointer transition-colors group"
                      >
                        <td className="p-4 text-slate-800 font-medium">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800 text-sm">
                              {format(parseISO(record.tanggal), 'EEEE, dd MMM yyyy', { locale: idLocale })}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5">{record.tanggal}</span>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-emerald-600 font-bold text-sm">
                          {record.jam_masuk || '--:--'}
                        </td>
                        <td className="p-4 font-mono text-slate-600 font-bold text-sm">
                          {record.jam_pulang || '--:--'}
                        </td>
                        <td className="p-4 text-sm text-slate-600 font-medium">
                          {dur ? (
                            <span className="text-slate-700 bg-slate-100 px-2 py-1 rounded-lg text-xs font-semibold">
                              {dur.text}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                            record.status === 'Terlambat'
                              ? 'bg-rose-50 text-rose-700 border border-rose-100'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${record.status === 'Terlambat' ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                            <span>{record.status || 'Hadir'}</span>
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            type="button"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Tampilkan Detail Lengkap"
                          >
                            <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 2. CARD VIEW FOR MOBILE SCREENS */}
            <div className="block md:hidden divide-y divide-slate-100">
              {filteredHistory.map((record) => {
                const dur = calculateWorkDuration(record.jam_masuk, record.jam_pulang);
                return (
                  <div 
                    key={record.id}
                    onClick={() => setSelectedRecord(record)}
                    className="p-4 hover:bg-slate-50/50 transition-colors cursor-pointer active:bg-slate-100"
                  >
                    <div className="flex justify-between items-start mb-2.5">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          {format(parseISO(record.tanggal), 'EEEE, dd MMM yyyy', { locale: idLocale })}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono font-medium">{record.tanggal}</span>
                      </div>
                      
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        record.status === 'Terlambat'
                          ? 'bg-rose-50 text-rose-600 border border-rose-100'
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      }`}>
                        <span>{record.status || 'Hadir'}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Jam Masuk</span>
                        <span className="font-mono text-emerald-600 font-bold text-sm block mt-0.5">{record.jam_masuk || '--:--'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Jam Pulang</span>
                        <span className="font-mono text-slate-700 font-bold text-sm block mt-0.5">{record.jam_pulang || '--:--'}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-3 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Clock size={12} />
                        <span className="font-medium text-[11px]">Durasi: {dur ? dur.text : '-'}</span>
                      </div>
                      <span className="text-blue-600 font-bold flex items-center text-[11px] gap-0.5">
                        Lihat Detail
                        <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* --- OFFLINE / PRINT SLIP CONTAINER (ONLY SHOWN WHEN PRINTING / HIDDEN IN UI) --- */}
      <div id="print-area" className="hidden p-8 font-sans space-y-6">
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">PRESENSI KARYAWAN US 162 BILIBILI</h1>
            <p className="text-xs text-slate-500 font-medium">LAPORAN REKAPITULASI HADIR 162</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold">{dbUser?.nama || 'Karyawan'}</p>
            <p className="text-slate-500">Divisi: {dbUser?.divisi || '-'}</p>
            <p className="text-slate-400">Dicetak Pada: {format(new Date(), 'dd MMMM yyyy HH:mm', { locale: idLocale })}</p>
          </div>
        </div>

        {/* Print Statistics Header */}
        <div className="grid grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="text-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hadir Tepat Waktu</p>
            <p className="text-xl font-bold mt-1 text-emerald-600">{totalHadir} Hari</p>
          </div>
          <div className="text-center border-l border-slate-200">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Terlambat</p>
            <p className="text-xl font-bold mt-1 text-rose-600">{totalTerlambat} Hari</p>
          </div>
          <div className="text-center border-l border-slate-200">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Izin / Cuti</p>
            <p className="text-xl font-bold mt-1 text-blue-600">{totalIzinCutiApproved} Kali</p>
          </div>
          <div className="text-center border-l border-slate-200">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Lembur</p>
            <p className="text-xl font-bold mt-1 text-indigo-600">{totalLemburHoursApproved} Jam</p>
          </div>
        </div>

        {/* Print Table */}
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-100 text-slate-700">
              <th className="p-2 font-bold uppercase">Hari / Tanggal</th>
              <th className="p-2 font-bold uppercase">Jam Masuk</th>
              <th className="p-2 font-bold uppercase">Jam Pulang</th>
              <th className="p-2 font-bold uppercase">Status</th>
              <th className="p-2 font-bold uppercase">Lokasi Check-in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredHistory.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="p-2 font-medium">
                  {format(parseISO(item.tanggal), 'EEEE, dd MMMM yyyy', { locale: idLocale })}
                </td>
                <td className="p-2 font-mono font-bold text-emerald-600">{item.jam_masuk || '--:--'}</td>
                <td className="p-2 font-mono text-slate-700">{item.jam_pulang || '--:--'}</td>
                <td className="p-2 font-semibold capitalize">{item.status || 'Hadir'}</td>
                <td className="p-2 text-slate-500 max-w-xs">{item.alamat_masuk || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Printable Footer Signatures */}
        <div className="pt-12 grid grid-cols-2 gap-12 text-center text-xs">
          <div>
            <p className="text-slate-400">Karyawan Bersangkutan</p>
            <div className="h-16"></div>
            <p className="font-bold underline uppercase">{dbUser?.nama || 'Karyawan'}</p>
            <p className="text-[10px] text-slate-400">UID: {user?.uid}</p>
          </div>
          <div>
            <p className="text-slate-400">Hormat Kami,</p>
            <div className="h-16"></div>
            <p className="font-bold underline uppercase">HR Manager / Admin</p>
            <p className="text-[10px] text-slate-400">Hadir 162 - US Bilibili 162</p>
          </div>
        </div>
      </div>

      {/* --- DETAILED ATTTENDANCE VIEW MODAL --- */}
      <AnimatePresence>
        {selectedRecord && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Rincian Kehadiran Lengkap</h3>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {format(parseISO(selectedRecord.tanggal), 'EEEE, dd MMMM yyyy', { locale: idLocale })}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedRecord(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-200/50 rounded-lg transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[75vh] space-y-6">
                
                {/* Duration and Status Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 border border-slate-100 p-4 rounded-xl">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status Hari Ini</span>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mt-1 ${
                      selectedRecord.status === 'Terlambat'
                        ? 'bg-rose-50 text-rose-700 border border-rose-100'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${selectedRecord.status === 'Terlambat' ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                      {selectedRecord.status || 'Hadir'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Durasi Kerja</span>
                    <span className="text-slate-700 font-extrabold text-sm flex items-center gap-1.5 mt-1">
                      <Clock size={14} className="text-blue-500" />
                      {calculateWorkDuration(selectedRecord.jam_masuk, selectedRecord.jam_pulang)?.text || '-'}
                    </span>
                  </div>
                </div>

                {/* Grid Masuk vs Pulang */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* LEFT: CHECK IN COLUMN */}
                  <div className="space-y-4">
                    <div className="border-b border-slate-100 pb-2">
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                        Presensi Masuk (Check-In)
                      </h4>
                    </div>

                    {/* Selfie Preview */}
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Foto Selfie Masuk</span>
                      {selectedRecord.selfie_masuk ? (
                        <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-inner group">
                          <img 
                            src={selectedRecord.selfie_masuk} 
                            alt="Selfie Check-in" 
                            className="w-full h-full object-cover rounded-xl"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ) : (
                        <div className="aspect-[4/3] rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
                          <User size={32} className="text-slate-300" />
                          <span className="text-xs font-semibold">Tidak ada selfie</span>
                        </div>
                      )}
                    </div>

                    {/* Checkin Meta */}
                    <div className="space-y-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100 text-xs">
                      <div className="flex justify-between items-baseline border-b border-slate-100/60 pb-1.5">
                        <span className="text-slate-400 font-semibold">Jam Masuk</span>
                        <span className="font-mono font-bold text-emerald-600 text-sm">{selectedRecord.jam_masuk || '--:--'}</span>
                      </div>
                      
                      <div className="space-y-1">
                        <span className="text-slate-400 font-semibold block">Lokasi Presensi</span>
                        {selectedRecord.alamat_masuk ? (
                          <div className="space-y-2">
                            <p className="text-slate-600 text-[11px] leading-relaxed">{selectedRecord.alamat_masuk}</p>
                            {selectedRecord.latitude_masuk && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${selectedRecord.latitude_masuk},${selectedRecord.longitude_masuk}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-blue-600 font-bold hover:underline text-[10px]"
                              >
                                <ExternalLink size={12} />
                                Lihat di Google Maps ({selectedRecord.latitude_masuk.toFixed(4)}, {selectedRecord.longitude_masuk.toFixed(4)})
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs flex items-center gap-1">
                            <MapPinOff size={12} />
                            Titik koordinat tidak direkam
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: CHECK OUT COLUMN */}
                  <div className="space-y-4">
                    <div className="border-b border-slate-100 pb-2">
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                        Presensi Pulang (Check-Out)
                      </h4>
                    </div>

                    {/* Selfie Preview */}
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Foto Selfie Pulang</span>
                      {selectedRecord.selfie_pulang ? (
                        <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-inner group">
                          <img 
                            src={selectedRecord.selfie_pulang} 
                            alt="Selfie Check-out" 
                            className="w-full h-full object-cover rounded-xl"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ) : (
                        <div className="aspect-[4/3] rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
                          <User size={32} className="text-slate-300" />
                          <span className="text-xs font-semibold">Belum melakukan check-out</span>
                        </div>
                      )}
                    </div>

                    {/* Checkout Meta */}
                    <div className="space-y-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100 text-xs">
                      <div className="flex justify-between items-baseline border-b border-slate-100/60 pb-1.5">
                        <span className="text-slate-400 font-semibold">Jam Pulang</span>
                        <span className="font-mono font-bold text-slate-700 text-sm">{selectedRecord.jam_pulang || '--:--'}</span>
                      </div>
                      
                      <div className="space-y-1">
                        <span className="text-slate-400 font-semibold block">Lokasi Presensi</span>
                        {selectedRecord.alamat_pulang ? (
                          <div className="space-y-2">
                            <p className="text-slate-600 text-[11px] leading-relaxed">{selectedRecord.alamat_pulang}</p>
                            {selectedRecord.latitude_pulang && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${selectedRecord.latitude_pulang},${selectedRecord.longitude_pulang}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-blue-600 font-bold hover:underline text-[10px]"
                              >
                                <ExternalLink size={12} />
                                Lihat di Google Maps ({selectedRecord.latitude_pulang.toFixed(4)}, {selectedRecord.longitude_pulang.toFixed(4)})
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs flex items-center gap-1">
                            <MapPinOff size={12} />
                            {selectedRecord.jam_pulang ? 'Titik koordinat tidak direkam' : 'Menunggu absen pulang'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
                >
                  Tutup Rincian
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
