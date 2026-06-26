import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, doc, updateDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Check, X, Search, Filter, RefreshCw, Calendar, Clock, User, MessageSquare, ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from 'react-hot-toast';

export default function ApprovalTab() {
    const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
    const [overtimeRequests, setOvertimeRequests] = useState<any[]>([]);
    const [usersMap, setUsersMap] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'leave' | 'overtime'>('leave');
    
    // Filters
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchEmployee, setSearchEmployee] = useState<string>('');
    const [filterType, setFilterType] = useState<string>('all'); // specific for leave

    // Confirmation actions & remarks
    const [actionData, setActionData] = useState<{
        collectionName: string;
        id: string;
        status: 'approved' | 'rejected' | 'pending';
    } | null>(null);
    const [adminRemark, setAdminRemark] = useState<string>('');
    
    // Detailed viewer modal
    const [detailItem, setDetailItem] = useState<{
        item: any;
        collectionName: string;
    } | null>(null);

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
            const map: Record<string, any> = {};
            snap.forEach(doc => {
                map[doc.id] = doc.data();
            });
            setUsersMap(map);
        });

        const unsubLeave = onSnapshot(query(collection(db, 'leave_requests'), orderBy('created_at', 'desc')), (snap) => {
            const leaves: any[] = [];
            snap.forEach(doc => leaves.push({ id: doc.id, ...doc.data() }));
            setLeaveRequests(leaves);
        });

        const unsubOvertime = onSnapshot(query(collection(db, 'overtime'), orderBy('tanggal', 'desc')), (snap) => {
            const overtimes: any[] = [];
            snap.forEach(doc => overtimes.push({ id: doc.id, ...doc.data() }));
            setOvertimeRequests(overtimes);
            setLoading(false);
        }, () => {
            setLoading(false);
        });

        return () => {
            unsubUsers();
            unsubLeave();
            unsubOvertime();
        };
    }, []);

    const confirmAction = async () => {
        if (!actionData) return;
        const { collectionName, id, status } = actionData;
        try {
            await updateDoc(doc(db, collectionName, id), { 
                status,
                catatan_admin: adminRemark.trim()
            });
            toast.success(`Berhasil mengubah status menjadi ${status}`);
        } catch (error) {
            console.error(error);
            toast.error('Gagal mengupdate status');
        } finally {
            setActionData(null);
            setAdminRemark('');
        }
    };

    // Filtered lists
    const filteredLeaves = leaveRequests.filter(item => {
        const user = usersMap[item.user_id] || {};
        const userName = (user.nama || '').toLowerCase();
        const matchesEmployee = userName.includes(searchEmployee.toLowerCase());
        const matchesStatus = filterStatus === 'all' ? true : item.status === filterStatus;
        const matchesType = filterType === 'all' ? true : item.tipe === filterType;
        return matchesEmployee && matchesStatus && matchesType;
    });

    const filteredOvertimes = overtimeRequests.filter(item => {
        const user = usersMap[item.user_id] || {};
        const userName = (user.nama || '').toLowerCase();
        const matchesEmployee = userName.includes(searchEmployee.toLowerCase());
        const matchesStatus = filterStatus === 'all' ? true : item.status === filterStatus;
        return matchesEmployee && matchesStatus;
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Persetujuan & Pengajuan</h3>
                    <p className="text-sm text-slate-500 mt-1">Kelola permohonan izin, cuti, sakit, dan lembur dari seluruh karyawan.</p>
                </div>
                <div className="flex bg-slate-200 p-1 rounded-xl w-full sm:w-auto">
                    <button 
                        onClick={() => { setActiveTab('leave'); setFilterType('all'); }} 
                        className={`flex-1 sm:flex-none px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'leave' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                        Izin / Sakit / Cuti
                    </button>
                    <button 
                        onClick={() => { setActiveTab('overtime'); setFilterType('all'); }} 
                        className={`flex-1 sm:flex-none px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'overtime' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                        Lembur
                    </button>
                </div>
            </div>

            {/* Filter Section */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Search Employee Name */}
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Cari nama karyawan..."
                            value={searchEmployee}
                            onChange={(e) => setSearchEmployee(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* Filter Status */}
                    <div className="flex items-center gap-2">
                        <Filter className="text-slate-400 shrink-0" size={16} />
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                        >
                            <option value="all">Semua Status</option>
                            <option value="pending">Menunggu (Pending)</option>
                            <option value="approved">Disetujui (Approved)</option>
                            <option value="rejected">Ditolak (Rejected)</option>
                        </select>
                    </div>

                    {/* Filter Type (Leaves Only) */}
                    {activeTab === 'leave' ? (
                        <div className="flex items-center gap-2">
                            <Calendar className="text-slate-400 shrink-0" size={16} />
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                            >
                                <option value="all">Semua Tipe Pengajuan</option>
                                <option value="izin">Izin</option>
                                <option value="sakit">Sakit</option>
                                <option value="cuti">Cuti</option>
                            </select>
                        </div>
                    ) : (
                        <div className="hidden md:block"></div>
                    )}
                </div>
            </div>

            {/* Content List */}
            {activeTab === 'leave' ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
                    <div className="overflow-x-auto font-sans">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider">Karyawan</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider">Tipe</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider min-w-[180px]">Tanggal</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider min-w-[200px]">Alasan / Catatan</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider">Status</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={6} className="p-8 text-center text-slate-500">Memuat data...</td></tr>
                                ) : filteredLeaves.length === 0 ? (
                                    <tr><td colSpan={6} className="p-8 text-center text-slate-500">Tidak ada pengajuan izin/cuti yang cocok.</td></tr>
                                ) : (
                                    filteredLeaves.map(item => {
                                        const user = usersMap[item.user_id] || {};
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50/40 transition-colors">
                                                <td className="p-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-slate-800 text-sm">{user.nama || 'Karyawan'}</span>
                                                        <span className="text-xs text-slate-400">{user.jabatan || 'Staf'} - {user.divisi || '-'}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-2.5 py-1 text-xs font-bold capitalize rounded-lg border ${
                                                        item.tipe === 'cuti' 
                                                            ? 'bg-blue-50 border-blue-100 text-blue-700' 
                                                            : item.tipe === 'sakit'
                                                            ? 'bg-amber-50 border-amber-100 text-amber-700'
                                                            : 'bg-purple-50 border-purple-100 text-purple-700'
                                                    }`}>
                                                        {item.tipe}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm text-slate-600">
                                                    <div className="flex flex-col">
                                                        <span>{format(parseISO(item.tanggal_mulai), 'dd MMM yyyy', { locale: idLocale })}</span>
                                                        <span className="text-xs text-slate-400">s/d {format(parseISO(item.tanggal_akhir), 'dd MMM yyyy', { locale: idLocale })}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-sm max-w-sm">
                                                    <div>
                                                        <p className="text-slate-600 line-clamp-2">{item.alasan}</p>
                                                        {item.catatan_admin && (
                                                            <p className="text-xs text-slate-400 italic mt-1 bg-slate-50 p-1 rounded">
                                                                Catatan: {item.catatan_admin}
                                                            </p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                                                        item.status === 'approved' 
                                                            ? 'bg-emerald-100 text-emerald-700' 
                                                            : item.status === 'rejected' 
                                                            ? 'bg-rose-100 text-rose-700' 
                                                            : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex justify-end gap-1.5">
                                                        {item.status === 'pending' ? (
                                                            <>
                                                                <button 
                                                                    onClick={() => setActionData({collectionName: 'leave_requests', id: item.id, status: 'approved'})} 
                                                                    className="w-9 h-9 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                                    title="Setujui"
                                                                >
                                                                    <Check size={16} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => setActionData({collectionName: 'leave_requests', id: item.id, status: 'rejected'})} 
                                                                    className="w-9 h-9 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                                    title="Tolak"
                                                                >
                                                                    <X size={16} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => setActionData({collectionName: 'leave_requests', id: item.id, status: 'pending'})}
                                                                className="w-9 h-9 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-150 transition-colors"
                                                                title="Ubah Keputusan / Reset"
                                                            >
                                                                <RefreshCw size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => setDetailItem({ item, collectionName: 'leave_requests' })}
                                                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                                                        >
                                                            Detail
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
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
                    <div className="overflow-x-auto font-sans">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider">Karyawan</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider">Tanggal Lembur</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider">Durasi (Jam)</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider min-w-[200px]">Pekerjaan</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider">Status</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 tracking-wider text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={6} className="p-8 text-center text-slate-500">Memuat data...</td></tr>
                                ) : filteredOvertimes.length === 0 ? (
                                    <tr><td colSpan={6} className="p-8 text-center text-slate-500">Tidak ada pengajuan lembur yang cocok.</td></tr>
                                ) : (
                                    filteredOvertimes.map(item => {
                                        const user = usersMap[item.user_id] || {};
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50/40 transition-colors">
                                                <td className="p-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-slate-800 text-sm">{user.nama || 'Karyawan'}</span>
                                                        <span className="text-xs text-slate-400">{user.jabatan || 'Staf'} - {user.divisi || '-'}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-sm text-slate-600">
                                                    {format(parseISO(item.tanggal), 'dd MMMM yyyy', { locale: idLocale })}
                                                </td>
                                                <td className="p-4 text-sm font-semibold font-mono text-slate-700">
                                                    {item.durasi_jam} Jam
                                                </td>
                                                <td className="p-4 text-sm max-w-sm">
                                                    <div>
                                                        <p className="text-slate-600 line-clamp-2">{item.keterangan}</p>
                                                        {item.catatan_admin && (
                                                            <p className="text-xs text-slate-400 italic mt-1 bg-slate-50 p-1 rounded">
                                                                Catatan: {item.catatan_admin}
                                                            </p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                                                        item.status === 'approved' 
                                                            ? 'bg-emerald-100 text-emerald-700' 
                                                            : item.status === 'rejected' 
                                                            ? 'bg-rose-100 text-rose-700' 
                                                            : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex justify-end gap-1.5">
                                                        {item.status === 'pending' ? (
                                                            <>
                                                                <button 
                                                                    onClick={() => setActionData({collectionName: 'overtime', id: item.id, status: 'approved'})} 
                                                                    className="w-9 h-9 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                                    title="Setujui"
                                                                >
                                                                    <Check size={16} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => setActionData({collectionName: 'overtime', id: item.id, status: 'rejected'})} 
                                                                    className="w-9 h-9 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                                    title="Tolak"
                                                                >
                                                                    <X size={16} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => setActionData({collectionName: 'overtime', id: item.id, status: 'pending'})}
                                                                className="w-9 h-9 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-150 transition-colors"
                                                                title="Ubah Keputusan / Reset"
                                                            >
                                                                <RefreshCw size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => setDetailItem({ item, collectionName: 'overtime' })}
                                                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                                                        >
                                                            Detail
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
            )}
            
            {/* Action Dialog with Remarks field */}
            {actionData && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
                        <div className="p-5 border-b border-slate-100">
                            <h4 className="font-bold text-slate-800 text-lg">
                                {actionData.status === 'pending' ? 'Ubah Status ke Pending' : `Konfirmasi ${actionData.status === 'approved' ? 'Persetujuan' : 'Penolakan'}`}
                            </h4>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-sm text-slate-600">
                                {actionData.status === 'pending' 
                                    ? 'Apakah Anda yakin ingin membatalkan keputusan sebelumnya dan mengembalikan status pengajuan ini menjadi Menunggu (Pending)?'
                                    : `Apakah Anda yakin ingin ${actionData.status === 'approved' ? 'menyetujui' : 'menolak'} pengajuan ini?`}
                            </p>
                            
                            {actionData.status !== 'pending' && (
                                <div>
                                    <label htmlFor="remark" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Catatan / Alasan Admin (Opsional)</label>
                                    <textarea
                                        id="remark"
                                        rows={3}
                                        placeholder="Masukkan catatan perihal persetujuan atau penolakan..."
                                        value={adminRemark}
                                        onChange={(e) => setAdminRemark(e.target.value)}
                                        className="w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-700"
                                    ></textarea>
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2.5">
                            <button
                                onClick={() => { setActionData(null); setAdminRemark(''); }}
                                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                            >
                                Kembali
                            </button>
                            <button
                                onClick={confirmAction}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors ${
                                    actionData.status === 'approved' 
                                        ? 'bg-emerald-600 hover:bg-emerald-700' 
                                        : actionData.status === 'rejected'
                                        ? 'bg-rose-600 hover:bg-rose-700'
                                        : 'bg-slate-700 hover:bg-slate-800'
                                }`}
                            >
                                {actionData.status === 'approved' ? 'Setujui' : actionData.status === 'rejected' ? 'Tolak' : 'Simpan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Viewer Modal */}
            {detailItem && (() => {
                const { item, collectionName } = detailItem;
                const user = usersMap[item.user_id] || {};
                return (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
                            {/* Modal Header */}
                            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h4 className="font-bold text-slate-800">Detail Pengajuan</h4>
                                <button 
                                    onClick={() => setDetailItem(null)} 
                                    className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200/50 rounded-lg transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            
                            {/* Modal Body */}
                            <div className="p-6 space-y-5">
                                {/* Profile Info */}
                                <div className="flex gap-3 items-center bg-slate-50 border border-slate-100 p-4 rounded-xl">
                                    <div className="w-11 h-11 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-base shadow-inner">
                                        {(user.nama || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h5 className="font-semibold text-slate-800 text-sm">{user.nama || 'Karyawan'}</h5>
                                        <p className="text-xs text-slate-400 font-medium">{user.jabatan || 'Staf'} • {user.divisi || '-'}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">WhatsApp: {user.waNumber || '-'}</p>
                                    </div>
                                </div>

                                {/* Form Details */}
                                <div className="space-y-3.5 text-sm">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Kategori</span>
                                            <span className="font-medium text-slate-800 block capitalize mt-0.5">
                                                {collectionName === 'leave_requests' ? `Izin / ${item.tipe}` : 'Lembur Pekerjaan'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Status Persetujuan</span>
                                            <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full mt-0.5 ${
                                                item.status === 'approved' 
                                                    ? 'bg-emerald-100 text-emerald-700' 
                                                    : item.status === 'rejected' 
                                                    ? 'bg-red-100 text-red-700' 
                                                    : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {item.status}
                                            </span>
                                        </div>
                                    </div>

                                    {collectionName === 'leave_requests' ? (
                                        <>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Tanggal Mulai</span>
                                                    <span className="font-medium text-slate-700 mt-0.5 block">
                                                        {format(parseISO(item.tanggal_mulai), 'dd MMMM yyyy', { locale: idLocale })}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Tanggal Selesai</span>
                                                    <span className="font-medium text-slate-700 mt-0.5 block">
                                                        {format(parseISO(item.tanggal_akhir), 'dd MMMM yyyy', { locale: idLocale })}
                                                    </span>
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Alasan Pengajuan</span>
                                                <p className="text-slate-600 mt-1 bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-line text-sm leading-relaxed">
                                                    {item.alasan}
                                                </p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Tanggal Lembur</span>
                                                    <span className="font-medium text-slate-700 mt-0.5 block">
                                                        {format(parseISO(item.tanggal), 'dd MMMM yyyy', { locale: idLocale })}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Durasi Kerja</span>
                                                    <span className="font-bold text-slate-700 font-mono mt-0.5 block">
                                                        {item.durasi_jam} Jam
                                                    </span>
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Keterangan Aktivitas</span>
                                                <p className="text-slate-600 mt-1 bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-line text-sm leading-relaxed">
                                                    {item.keterangan}
                                                </p>
                                            </div>
                                        </>
                                    )}

                                    {/* Admin Remarks section */}
                                    <div>
                                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Catatan Admin</span>
                                        <div className="mt-1 bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-start gap-2 text-sm text-slate-600">
                                            <MessageSquare size={16} className="text-slate-400 shrink-0 mt-0.5" />
                                            <span>{item.catatan_admin || <span className="text-slate-400 italic">Belum ada catatan administratif dari admin.</span>}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Modal Footer */}
                            <div className="p-4 border-t border-slate-100 flex justify-end bg-white">
                                <button 
                                    onClick={() => setDetailItem(null)} 
                                    className="px-5 py-2.5 bg-slate-800 text-white font-semibold hover:bg-slate-900 rounded-xl transition-all text-sm shadow-sm"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
