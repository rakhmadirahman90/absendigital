import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { MapPin, Image as ImageIcon, Edit2, Trash2, X, Users, CheckCircle2, Clock, AlertTriangle, Search, Filter, Printer, Download, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from 'react-hot-toast';

export default function AbsensiTab() {
    const [attendance, setAttendance] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterDivisi, setFilterDivisi] = useState('');
    const [usersMap, setUsersMap] = useState<Record<string, any>>({});
    const [divisiList, setDivisiList] = useState<string[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    
    // Additional filters for interactive UX
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'Hadir' | 'Terlambat' | 'absen'>('all');
    
    const [editingRecord, setEditingRecord] = useState<any>(null);
    const [editForm, setEditForm] = useState({ jam_masuk: '', jam_pulang: '', status: '' });
    
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [viewPhoto, setViewPhoto] = useState<string | null>(null);

    const handleAIAttendanceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsExtracting(true);
        const toastId = toast.loading('AI sedang memindai foto & memproses log kehadiran...');

        try {
            const base64Image = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            });

            const response = await fetch('/api/extract-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image, currentDate: filterDate })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Gagal berkomunikasi dengan AI');
            }

            const data = await response.json();
            if (!data.success || !data.records || data.records.length === 0) {
                throw new Error('AI tidak menemukan data absensi dalam gambar tersebut. Pastikan teks terlihat jelas.');
            }

            let importCount = 0;
            for (const record of data.records) {
                const waNumber = record.waNumber ? record.waNumber.replace(/\D/g, '') : '';
                if (!waNumber) continue;

                const userId = `wa-${waNumber}`;
                const attId = `${userId}-${record.tanggal}`;
                const payload: any = {
                    user_id: userId,
                    tanggal: record.tanggal,
                    jam_masuk: record.jam_masuk,
                    status: record.status,
                    method_masuk: 'Foto AI',
                    created_at: new Date().toISOString()
                };
                if (record.jam_pulang) {
                    payload.jam_pulang = record.jam_pulang;
                    payload.method_pulang = 'Foto AI';
                }

                await setDoc(doc(db, 'attendance', attId), payload, { merge: true });
                importCount++;
            }

            toast.success(`AI Berhasil! Mengimpor ${importCount} catatan absensi dari foto ke tanggal ${filterDate}.`, { id: toastId });
        } catch (error: any) {
            console.error("Gagal melakukan ekstraksi data via AI:", error);
            toast.error(error.message || 'Gagal memproses gambar menggunakan AI', { id: toastId });
        } finally {
            setIsExtracting(false);
            e.target.value = '';
        }
    };

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
            const map: Record<string, any> = {};
            const divisiSet = new Set<string>();
            snap.forEach(doc => {
                const data = doc.data();
                map[doc.id] = data;
                if (data.divisi) divisiSet.add(data.divisi);
            });
            setUsersMap(map);
            setDivisiList(Array.from(divisiSet));
        });
        return () => unsubUsers();
    }, []);

    useEffect(() => {
        if (Object.keys(usersMap).length === 0) return;
        
        setLoading(true);
        let q = query(collection(db, 'attendance'), where('tanggal', '==', filterDate));
        
        const unsubAttendance = onSnapshot(q, (snap) => {
            let data: any[] = [];
            snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

            // Client side filter for divisi
            if (filterDivisi) {
                data = data.filter(item => usersMap[item.user_id]?.divisi === filterDivisi);
            }
            
            setAttendance(data);
            setLoading(false);
        }, (error) => {
            console.error(error);
            setLoading(false);
        });

        return () => unsubAttendance();
    }, [filterDate, filterDivisi, usersMap]);

    const handleOpenMap = (lat: number, lng: number) => {
        window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await deleteDoc(doc(db, 'attendance', deleteId));
            toast.success('Data absensi berhasil dihapus');
        } catch (error) {
            console.error('Error deleting attendance:', error);
            toast.error('Gagal menghapus data absensi');
        } finally {
            setDeleteId(null);
        }
    };

    const handleEdit = (item: any) => {
        setEditingRecord(item);
        setEditForm({
            jam_masuk: item.jam_masuk || '',
            jam_pulang: item.jam_pulang || '',
            status: item.status || 'Hadir'
        });
    };

    const handleSaveEdit = async () => {
        if (!editingRecord) return;
        try {
            await updateDoc(doc(db, 'attendance', editingRecord.id), {
                jam_masuk: editForm.jam_masuk,
                jam_pulang: editForm.jam_pulang,
                status: editForm.status
            });
            toast.success('Data absensi berhasil diperbarui');
            setEditingRecord(null);
        } catch (error) {
            console.error('Error updating attendance:', error);
            toast.error('Gagal memperbarui data absensi');
        }
    };

    const handleExportAdminCSV = () => {
        if (displayedAttendance.length === 0) {
            toast.error('Tidak ada data untuk diekspor.');
            return;
        }
        const headers = ['No', 'Nama Karyawan', 'Divisi', 'Jam Masuk', 'Jam Pulang', 'Status', 'Alamat Masuk', 'Latitude', 'Longitude'];
        const rows = displayedAttendance.map((item, idx) => {
            const u = usersMap[item.user_id] || {};
            return [
                idx + 1,
                `"${(u.nama || 'Tidak Dikenal').replace(/"/g, '""')}"`,
                `"${(u.divisi || '-').replace(/"/g, '""')}"`,
                item.jam_masuk || '-',
                item.jam_pulang || '-',
                item.status || 'Hadir',
                item.alamat_masuk ? `"${item.alamat_masuk.replace(/"/g, '""')}"` : '-',
                item.latitude_masuk || '-',
                item.longitude_masuk || '-'
            ];
        });

        const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Laporan_Absensi_Harian_${filterDate}_${filterDivisi || 'Semua_Divisi'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Laporan harian berhasil diekspor.');
    };

    const handlePrintDaily = () => {
        window.print();
    };

    // Derived statistics over unfiltered attendance
    const totalCount = attendance.length;
    const hadirCount = attendance.filter(item => item.status === 'Hadir').length;
    const terlambatCount = attendance.filter(item => item.status === 'Terlambat').length;
    const absenCount = attendance.filter(item => ['Izin', 'Sakit', 'Alpa'].includes(item.status)).length;

    // Filter displayed list
    const displayedAttendance = attendance.filter(item => {
        const user = usersMap[item.user_id] || {};
        const employeeName = (user.nama || '').toLowerCase();
        const matchesSearch = employeeName.includes(searchQuery.toLowerCase());
        
        if (!matchesSearch) return false;
        
        if (statusFilter === 'all') return true;
        if (statusFilter === 'Hadir') return item.status === 'Hadir';
        if (statusFilter === 'Terlambat') return item.status === 'Terlambat';
        if (statusFilter === 'absen') return ['Izin', 'Sakit', 'Alpa'].includes(item.status);
        
        return true;
    });

    return (
        <div className="space-y-6">
            <style>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #print-daily-area, #print-daily-area * {
                        visibility: visible;
                    }
                    #print-daily-area {
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

            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 no-print">
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Monitor Absensi</h3>
                    <p className="text-xs text-slate-500 mt-1">Kelola dan pantau ketepatan waktu, foto selfie, serta lokasi absen harian karyawan.</p>
                </div>
                
                {/* Admin Export Actions */}
                <div className="flex flex-wrap gap-2">
                    <label 
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all text-xs cursor-pointer"
                        title="Unggah foto lembar presensi, logbook, atau tabel kehadiran untuk diimpor otomatis oleh AI"
                    >
                        <Sparkles size={14} className={isExtracting ? "animate-spin" : ""} />
                        <span>{isExtracting ? "Memproses AI..." : "Impor Absen (AI)"}</span>
                        <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleAIAttendanceUpload} 
                            disabled={isExtracting}
                            className="hidden" 
                        />
                    </label>
                    <button
                        onClick={handlePrintDaily}
                        disabled={displayedAttendance.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl border border-slate-200 shadow-sm transition-all text-xs disabled:opacity-50 cursor-pointer"
                    >
                        <Printer size={14} />
                        <span>Cetak Harian</span>
                    </button>
                    <button
                        onClick={handleExportAdminCSV}
                        disabled={displayedAttendance.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all text-xs disabled:opacity-50 cursor-pointer"
                    >
                        <Download size={14} />
                        <span>Ekspor CSV</span>
                    </button>
                </div>
            </div>

            {/* Interactive Statistics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card Total */}
                <button
                    onClick={() => setStatusFilter('all')}
                    className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
                        statusFilter === 'all'
                            ? 'bg-blue-50/60 border-blue-200 ring-2 ring-blue-500/20 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Absen</span>
                        <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg">
                            <Users size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-slate-800">{totalCount}</span>
                        <span className="text-[10px] text-slate-400 font-medium">Orang</span>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                        <span>Klik untuk melihat semua</span>
                    </div>
                </button>

                {/* Card Hadir */}
                <button
                    onClick={() => setStatusFilter(statusFilter === 'Hadir' ? 'all' : 'Hadir')}
                    className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
                        statusFilter === 'Hadir'
                            ? 'bg-emerald-50/60 border-emerald-200 ring-2 ring-emerald-500/20 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Tepat Waktu</span>
                        <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                            <CheckCircle2 size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-emerald-700">{hadirCount}</span>
                        <span className="text-[10px] text-emerald-500 font-medium">Hadir</span>
                    </div>
                    <div className="mt-2 text-[10px] text-emerald-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>{statusFilter === 'Hadir' ? 'Filter Aktif' : 'Klik untuk memfilter'}</span>
                    </div>
                </button>

                {/* Card Terlambat */}
                <button
                    onClick={() => setStatusFilter(statusFilter === 'Terlambat' ? 'all' : 'Terlambat')}
                    className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
                        statusFilter === 'Terlambat'
                            ? 'bg-rose-50/60 border-rose-200 ring-2 ring-rose-500/20 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Terlambat</span>
                        <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                            <Clock size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-rose-700">{terlambatCount}</span>
                        <span className="text-[10px] text-rose-500 font-medium">Orang</span>
                    </div>
                    <div className="mt-2 text-[10px] text-rose-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        <span>{statusFilter === 'Terlambat' ? 'Filter Aktif' : 'Klik untuk memfilter'}</span>
                    </div>
                </button>

                {/* Card Izin/Sakit/Alpa */}
                <button
                    onClick={() => setStatusFilter(statusFilter === 'absen' ? 'all' : 'absen')}
                    className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
                        statusFilter === 'absen'
                            ? 'bg-amber-50/60 border-amber-200 ring-2 ring-amber-500/20 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Izin / Sakit / Alpa</span>
                        <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                            <AlertTriangle size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-amber-700">{absenCount}</span>
                        <span className="text-[10px] text-amber-500 font-medium">Ketidakhadiran</span>
                    </div>
                    <div className="mt-2 text-[10px] text-amber-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        <span>{statusFilter === 'absen' ? 'Filter Aktif' : 'Klik untuk memfilter'}</span>
                    </div>
                </button>
            </div>
            
            {/* Filter and Search Bar */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Search Field */}
                    <div className="relative">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Cari Karyawan</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Masukkan nama karyawan..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                            />
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Date Selector */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tanggal Absensi</label>
                        <input 
                            type="date" 
                            value={filterDate} 
                            onChange={e => setFilterDate(e.target.value)} 
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700" 
                        />
                    </div>

                    {/* Division Selector */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Divisi</label>
                        <select 
                            value={filterDivisi} 
                            onChange={e => setFilterDivisi(e.target.value)} 
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 bg-white"
                        >
                            <option value="">Semua Divisi</option>
                            {divisiList.map(div => <option key={div} value={div}>{div}</option>)}
                        </select>
                    </div>
                </div>

                {/* Filter badges indicator */}
                {(statusFilter !== 'all' || searchQuery || filterDivisi) && (
                    <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-slate-100">
                        <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
                            <Filter size={12} />
                            Filter Aktif:
                        </span>
                        
                        {searchQuery && (
                            <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-slate-200">
                                Nama: &quot;{searchQuery}&quot;
                                <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                            </span>
                        )}

                        {statusFilter !== 'all' && (
                            <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-blue-200 font-medium">
                                Status: {statusFilter === 'absen' ? 'Izin / Sakit / Alpa' : statusFilter}
                                <button onClick={() => setStatusFilter('all')} className="text-blue-400 hover:text-blue-600"><X size={12} /></button>
                            </span>
                        )}

                        {filterDivisi && (
                            <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-indigo-200 font-medium">
                                Divisi: {filterDivisi}
                                <button onClick={() => setFilterDivisi('')} className="text-indigo-400 hover:text-indigo-600"><X size={12} /></button>
                            </span>
                        )}

                        <button 
                            onClick={() => { setSearchQuery(''); setStatusFilter('all'); setFilterDivisi(''); }}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline ml-auto font-medium"
                        >
                            Reset Semua Filter
                        </button>
                    </div>
                )}
            </div>

            {/* Attendance Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px]">Karyawan</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[110px]">Divisi</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Jam Masuk</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Jam Pulang</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Lokasi Presensi</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Foto Selfie</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center space-y-2">
                                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-sm font-medium">Memuat data absensi...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : displayedAttendance.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-slate-500">
                                        <div className="max-w-md mx-auto space-y-2">
                                            <p className="font-bold text-slate-700">Tidak ada data absensi</p>
                                            <p className="text-xs text-slate-400">
                                                {attendance.length === 0 
                                                    ? 'Belum ada data presensi yang masuk pada tanggal terpilih.' 
                                                    : 'Tidak ada data presensi yang cocok dengan filter aktif Anda.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                displayedAttendance.map(item => {
                                    const user = usersMap[item.user_id] || {};
                                    
                                    // Beautiful status colors
                                    const getStatusStyles = (status: string) => {
                                        switch (status) {
                                            case 'Hadir':
                                                return 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                            case 'Terlambat':
                                                return 'bg-rose-50 text-rose-700 border-rose-100';
                                            case 'Izin':
                                                return 'bg-amber-50 text-amber-700 border-amber-100';
                                            case 'Sakit':
                                                return 'bg-sky-50 text-sky-700 border-sky-100';
                                            case 'Alpa':
                                                return 'bg-slate-100 text-slate-700 border-slate-200';
                                            default:
                                                return 'bg-slate-50 text-slate-600 border-slate-100';
                                        }
                                    };

                                    return (
                                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-semibold text-slate-800 text-sm">{user.nama || 'Tidak Dikenal'}</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">UID: {item.user_id?.substring(0, 8)}...</div>
                                            </td>
                                            <td className="p-4 text-sm">
                                                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                                                    {user.divisi || '-'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-sm font-mono font-medium text-slate-600">
                                                {item.jam_masuk ? (
                                                    <span className="text-slate-700">{item.jam_masuk}</span>
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-sm font-mono font-medium text-slate-600">
                                                {item.jam_pulang ? (
                                                    <span className="text-slate-700">{item.jam_pulang}</span>
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex flex-col items-center justify-center gap-1">
                                                    {item.latitude_masuk ? (
                                                        <button 
                                                            onClick={() => handleOpenMap(item.latitude_masuk, item.longitude_masuk)} 
                                                            className="w-9 h-9 flex items-center justify-center text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded-xl border border-slate-100 shadow-sm transition-all" 
                                                            title={item.alamat_masuk || "Buka Lokasi di Google Maps"}
                                                        >
                                                            <MapPin size={16} />
                                                        </button>
                                                    ) : (
                                                        <span className="text-slate-300 text-xs">-</span>
                                                    )}
                                                    {item.alamat_masuk && (
                                                        <span 
                                                            className="text-[9px] text-slate-400 max-w-[120px] truncate block hover:text-slate-600" 
                                                            title={item.alamat_masuk}
                                                        >
                                                            {item.alamat_masuk}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center gap-1.5">
                                                    {item.selfie_masuk ? (
                                                        <button 
                                                            onClick={() => setViewPhoto(item.selfie_masuk)} 
                                                            className="w-9 h-9 inline-flex items-center justify-center text-indigo-600 hover:bg-indigo-50 rounded-xl border border-slate-100 shadow-sm transition-all" 
                                                            title="Selfie Masuk"
                                                        >
                                                            <ImageIcon size={15} />
                                                        </button>
                                                    ) : null}
                                                    {item.selfie_pulang ? (
                                                        <button 
                                                            onClick={() => setViewPhoto(item.selfie_pulang)} 
                                                            className="w-9 h-9 inline-flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-xl border border-slate-100 shadow-sm transition-all" 
                                                            title="Selfie Pulang"
                                                        >
                                                            <ImageIcon size={15} />
                                                        </button>
                                                    ) : null}
                                                    {!item.selfie_masuk && !item.selfie_pulang && (
                                                        <span className="text-slate-300 text-xs">-</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm">
                                                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${getStatusStyles(item.status || 'Hadir')}`}>
                                                    {item.status || 'Hadir'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex justify-end gap-1.5">
                                                    <button 
                                                        onClick={() => handleEdit(item)} 
                                                        className="w-9 h-9 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                        title="Edit Absensi"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button 
                                                        onClick={() => setDeleteId(item.id)} 
                                                        className="w-9 h-9 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                        title="Hapus Absensi"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Dialog Modal */}
            {editingRecord && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="font-bold text-slate-800">Edit Absensi</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Milik: {usersMap[editingRecord.user_id]?.nama || 'Karyawan'}</p>
                            </div>
                            <button 
                                onClick={() => setEditingRecord(null)} 
                                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200/50 rounded-lg transition-all"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Jam Masuk</label>
                                <input 
                                    type="time" 
                                    step="1"
                                    value={editForm.jam_masuk}
                                    onChange={(e) => setEditForm({...editForm, jam_masuk: e.target.value})}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Jam Pulang</label>
                                <input 
                                    type="time" 
                                    step="1"
                                    value={editForm.jam_pulang}
                                    onChange={(e) => setEditForm({...editForm, jam_pulang: e.target.value})}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status Presensi</label>
                                <select 
                                    value={editForm.status}
                                    onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 bg-white"
                                >
                                    <option value="Hadir">Hadir</option>
                                    <option value="Terlambat">Terlambat</option>
                                    <option value="Izin">Izin</option>
                                    <option value="Sakit">Sakit</option>
                                    <option value="Alpa">Alpa</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50">
                            <button 
                                onClick={() => setEditingRecord(null)} 
                                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                Batal
                            </button>
                            <button 
                                onClick={handleSaveEdit} 
                                className="px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 rounded-lg transition-all text-sm shadow-sm"
                            >
                                Simpan Perubahan
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Confirmation Dialog */}
            <ConfirmDialog
                isOpen={!!deleteId}
                title="Hapus Data Absensi"
                message={`Apakah Anda yakin ingin menghapus data absensi milik ${usersMap[attendance.find(item => item.id === deleteId)?.user_id]?.nama || 'Karyawan'}? Tindakan ini tidak dapat dibatalkan.`}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteId(null)}
                isDestructive={true}
                confirmText="Hapus Permanen"
                cancelText="Batal"
            />

            {/* Photo Viewer Modal */}
            {viewPhoto && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800">Foto Selfie Absensi</h3>
                            <button onClick={() => setViewPhoto(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200/50 rounded-lg transition-all">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 flex flex-col items-center bg-slate-100 justify-center">
                            <div className="relative w-full max-h-[70vh] bg-slate-200 rounded-xl overflow-auto border border-slate-300 shadow-inner flex items-center justify-center">
                                <img 
                                    src={viewPhoto} 
                                    alt="Selfie Absensi" 
                                    className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-sm"
                                    referrerPolicy="no-referrer"
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end bg-white">
                            <button 
                                onClick={() => setViewPhoto(null)} 
                                className="px-5 py-2 bg-slate-800 text-white font-medium hover:bg-slate-900 rounded-lg transition-colors text-sm shadow-sm"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- ADMIN DAILY PRINT AREA (ONLY SHOWN IN PRINT) --- */}
            <div id="print-daily-area" className="hidden p-8 font-sans space-y-6">
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">HRIS ABSENSI ONLINE</h1>
                        <p className="text-xs text-slate-500 font-medium">LAPORAN MONITORING ABSENSI HARIAN KARYAWAN</p>
                    </div>
                    <div className="text-right text-xs">
                        <p className="font-bold">Admin Portal</p>
                        <p className="text-slate-500">Tanggal Laporan: {filterDate}</p>
                        {filterDivisi && <p className="text-slate-500">Divisi: {filterDivisi}</p>}
                        <p className="text-slate-400">Dicetak: {format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}</p>
                    </div>
                </div>

                {/* Print Summary Stats */}
                <div className="grid grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="text-center">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Presensi</p>
                        <p className="text-xl font-bold mt-1 text-slate-900">{totalCount} Orang</p>
                    </div>
                    <div className="text-center border-l border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tepat Waktu</p>
                        <p className="text-xl font-bold mt-1 text-emerald-600">{hadirCount} Orang</p>
                    </div>
                    <div className="text-center border-l border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Terlambat</p>
                        <p className="text-xl font-bold mt-1 text-rose-600">{terlambatCount} Orang</p>
                    </div>
                    <div className="text-center border-l border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Izin/Sakit/Alpa</p>
                        <p className="text-xl font-bold mt-1 text-amber-600">{absenCount} Orang</p>
                    </div>
                </div>

                {/* Print Daily Table */}
                <table className="w-full text-left text-[11px] border-collapse mt-4">
                    <thead>
                        <tr className="border-b border-slate-300 bg-slate-100 text-slate-700">
                            <th className="p-2 font-bold uppercase">No</th>
                            <th className="p-2 font-bold uppercase">Nama Karyawan</th>
                            <th className="p-2 font-bold uppercase">Divisi</th>
                            <th className="p-2 font-bold uppercase">Jam Masuk</th>
                            <th className="p-2 font-bold uppercase">Jam Pulang</th>
                            <th className="p-2 font-bold uppercase">Status</th>
                            <th className="p-2 font-bold uppercase">Alamat Check-in</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {displayedAttendance.map((item, idx) => {
                            const u = usersMap[item.user_id] || {};
                            return (
                                <tr key={item.id} className="align-top">
                                    <td className="p-2">{idx + 1}</td>
                                    <td className="p-2 font-semibold text-slate-900">{u.nama || 'Tidak Dikenal'}</td>
                                    <td className="p-2">{u.divisi || '-'}</td>
                                    <td className="p-2 font-mono font-bold text-emerald-600">{item.jam_masuk || '--:--'}</td>
                                    <td className="p-2 font-mono text-slate-700">{item.jam_pulang || '--:--'}</td>
                                    <td className="p-2 font-semibold capitalize">{item.status || 'Hadir'}</td>
                                    <td className="p-2 text-slate-500 max-w-xs">{item.alamat_masuk || '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Print Signatures */}
                <div className="pt-12 grid grid-cols-2 gap-12 text-center text-xs">
                    <div>
                        <p className="text-slate-400">Dibuat Oleh,</p>
                        <div className="h-16"></div>
                        <p className="font-bold underline uppercase">HR Staff</p>
                        <p className="text-[10px] text-slate-400">HRIS Administration</p>
                    </div>
                    <div>
                        <p className="text-slate-400">Disetujui Oleh,</p>
                        <div className="h-16"></div>
                        <p className="font-bold underline uppercase">HR Manager</p>
                        <p className="text-[10px] text-slate-400">HRIS Online System</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
