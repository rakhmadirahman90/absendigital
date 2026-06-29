import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot, getDoc, addDoc } from 'firebase/firestore';
import { Check, X, Search, Filter, RefreshCw, Calendar, Clock, User, MessageSquare, ChevronDown, Edit, Trash2, Sparkles } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from 'react-hot-toast';
import { createNotification } from '../../lib/notifications';

export default function ApprovalTab() {
    const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
    const [overtimeRequests, setOvertimeRequests] = useState<any[]>([]);
    const [usersMap, setUsersMap] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'leave' | 'overtime'>('leave');
    const [isExtracting, setIsExtracting] = useState(false);

    const handleAIApprovalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsExtracting(true);
        const toastId = toast.loading('AI sedang memindai dokumen & memproses pengajuan...');

        try {
            const base64Image = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            });

            const response = await fetch('/api/extract-approval', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Gagal berkomunikasi dengan AI');
            }

            const resData = await response.json();
            if (!resData.success || !resData.data) {
                throw new Error('AI tidak berhasil mengekstrak data dari dokumen ini.');
            }

            const extracted = resData.data;

            // Search for matching employee in usersMap by name or waNumber
            let matchedUserId = '';
            let matchedUserNama = '';
            
            const searchWa = extracted.waNumber ? extracted.waNumber.replace(/\D/g, '') : '';
            const searchName = extracted.nama ? extracted.nama.toLowerCase().trim() : '';

            // Try WA exact match first
            if (searchWa && usersMap[`wa-${searchWa}`]) {
                matchedUserId = `wa-${searchWa}`;
                matchedUserNama = usersMap[matchedUserId].nama;
            } else {
                // Try fuzzy name match
                const match = Object.entries(usersMap).find(([_, u]) => {
                    const usr = u as any;
                    const uName = (usr.nama || '').toLowerCase().trim();
                    return uName.includes(searchName) || searchName.includes(uName);
                });
                if (match) {
                    matchedUserId = match[0];
                    matchedUserNama = (match[1] as any).nama;
                }
            }

            if (!matchedUserId) {
                throw new Error(`Karyawan dengan nama "${extracted.nama}" tidak terdaftar di database. Silakan tambahkan karyawan tersebut terlebih dahulu.`);
            }

            if (extracted.type === 'leave') {
                const payload = {
                    user_id: matchedUserId,
                    tipe: extracted.tipe || 'izin',
                    tanggal_mulai: extracted.tanggal_mulai || new Date().toISOString().split('T')[0],
                    tanggal_akhir: extracted.tanggal_akhir || extracted.tanggal_mulai || new Date().toISOString().split('T')[0],
                    alasan: extracted.alasan || 'Pengajuan via AI Dokumen',
                    status: 'approved',
                    catatan_admin: 'Disetujui otomatis oleh AI (Dokumen diunggah Admin)',
                    created_at: new Date().toISOString()
                };

                await addDoc(collection(db, 'leave_requests'), payload);
                toast.success(`AI Berhasil! Menambahkan pengajuan ${payload.tipe} untuk ${matchedUserNama} (Disetujui otomatis).`, { id: toastId });
            } else {
                const payload = {
                    user_id: matchedUserId,
                    tanggal: extracted.tanggal || new Date().toISOString().split('T')[0],
                    durasi_jam: Number(extracted.durasi_jam || 2),
                    keterangan: extracted.keterangan || 'Overtime via AI Dokumen',
                    status: 'approved',
                    catatan_admin: 'Disetujui otomatis oleh AI (Dokumen diunggah Admin)',
                    created_at: new Date().toISOString()
                };

                await addDoc(collection(db, 'overtime'), payload);
                toast.success(`AI Berhasil! Menambahkan pengajuan Lembur untuk ${matchedUserNama} (Disetujui otomatis).`, { id: toastId });
            }

        } catch (error: any) {
            console.error("Gagal melakukan ekstraksi dokumen via AI:", error);
            toast.error(error.message || 'Gagal memproses dokumen menggunakan AI', { id: toastId });
        } finally {
            setIsExtracting(false);
            e.target.value = '';
        }
    };
    
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

    // Edit states
    const [editItem, setEditItem] = useState<{ item: any; collectionName: string } | null>(null);
    const [editLeaveForm, setEditLeaveForm] = useState({
        tipe: 'izin',
        tanggal_mulai: '',
        tanggal_akhir: '',
        alasan: '',
        status: 'pending',
        catatan_admin: ''
    });
    const [editOvertimeForm, setEditOvertimeForm] = useState({
        tanggal: '',
        durasi_jam: 1,
        keterangan: '',
        status: 'pending',
        catatan_admin: ''
    });

    // Delete states
    const [deleteData, setDeleteData] = useState<{ id: string; collectionName: string; employeeName: string } | null>(null);

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
            const docRef = doc(db, collectionName, id);
            const docSnap = await getDoc(docRef);
            
            await updateDoc(docRef, { 
                status,
                catatan_admin: adminRemark.trim()
            });

            if (docSnap.exists()) {
                const data = docSnap.data();
                const targetUserId = data.user_id;
                let reqType = '';
                if (collectionName === 'leave_requests') {
                    reqType = `pengajuan ${data.tipe || 'izin/sakit/cuti'}`;
                } else {
                    reqType = 'pengajuan lembur';
                }

                if (targetUserId) {
                    const title = status === 'approved' ? 'Pengajuan Disetujui' : (status === 'rejected' ? 'Pengajuan Ditolak' : 'Pengajuan Diubah');
                    const message = status === 'approved' 
                        ? `Selamat, ${reqType} Anda telah disetujui oleh Admin.${adminRemark.trim() ? ` Catatan: ${adminRemark.trim()}` : ''}` 
                        : (status === 'rejected' 
                            ? `Maaf, ${reqType} Anda ditolak oleh Admin.${adminRemark.trim() ? ` Catatan: ${adminRemark.trim()}` : ''}`
                            : `${reqType} Anda dikembalikan statusnya ke pending.`);
                    const type = status === 'rejected' ? 'submission_rejected' : 'submission_approved';
                    await createNotification(targetUserId, title, message, type);
                }
            }

            toast.success(`Berhasil mengubah status menjadi ${status}`);
        } catch (error) {
            console.error(error);
            toast.error('Gagal mengupdate status');
        } finally {
            setActionData(null);
            setAdminRemark('');
        }
    };

    const handleStartEdit = (item: any, collectionName: string) => {
        setEditItem({ item, collectionName });
        if (collectionName === 'leave_requests') {
            setEditLeaveForm({
                tipe: item.tipe || 'izin',
                tanggal_mulai: item.tanggal_mulai || '',
                tanggal_akhir: item.tanggal_akhir || '',
                alasan: item.alasan || '',
                status: item.status || 'pending',
                catatan_admin: item.catatan_admin || ''
            });
        } else {
            setEditOvertimeForm({
                tanggal: item.tanggal || '',
                durasi_jam: item.durasi_jam || 1,
                keterangan: item.keterangan || '',
                status: item.status || 'pending',
                catatan_admin: item.catatan_admin || ''
            });
        }
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editItem) return;
        const { item, collectionName } = editItem;
        try {
            const originalStatus = item.status || 'pending';
            let statusChanged = false;
            let newStatus = '';
            let remark = '';

            if (collectionName === 'leave_requests') {
                if (editLeaveForm.tanggal_mulai > editLeaveForm.tanggal_akhir) {
                    toast.error('Tanggal mulai tidak boleh melebihi tanggal akhir.');
                    return;
                }
                newStatus = editLeaveForm.status;
                remark = editLeaveForm.catatan_admin.trim();
                statusChanged = originalStatus !== newStatus;

                await updateDoc(doc(db, 'leave_requests', item.id), {
                    tipe: editLeaveForm.tipe,
                    tanggal_mulai: editLeaveForm.tanggal_mulai,
                    tanggal_akhir: editLeaveForm.tanggal_akhir,
                    alasan: editLeaveForm.alasan.trim(),
                    status: editLeaveForm.status,
                    catatan_admin: editLeaveForm.catatan_admin.trim()
                });
            } else {
                if (editOvertimeForm.durasi_jam <= 0) {
                    toast.error('Durasi jam lembur harus lebih besar dari 0.');
                    return;
                }
                newStatus = editOvertimeForm.status;
                remark = editOvertimeForm.catatan_admin.trim();
                statusChanged = originalStatus !== newStatus;

                await updateDoc(doc(db, 'overtime', item.id), {
                    tanggal: editOvertimeForm.tanggal,
                    durasi_jam: Number(editOvertimeForm.durasi_jam),
                    keterangan: editOvertimeForm.keterangan.trim(),
                    status: editOvertimeForm.status,
                    catatan_admin: editOvertimeForm.catatan_admin.trim()
                });
            }

            if (statusChanged && item.user_id) {
                let reqType = '';
                if (collectionName === 'leave_requests') {
                    reqType = `pengajuan ${editLeaveForm.tipe || 'izin/sakit/cuti'}`;
                } else {
                    reqType = 'pengajuan lembur';
                }
                const title = newStatus === 'approved' ? 'Pengajuan Disetujui' : (newStatus === 'rejected' ? 'Pengajuan Ditolak' : 'Pengajuan Diubah');
                const message = newStatus === 'approved' 
                    ? `Selamat, ${reqType} Anda telah disetujui oleh Admin.${remark ? ` Catatan: ${remark}` : ''}` 
                    : (newStatus === 'rejected' 
                        ? `Maaf, ${reqType} Anda ditolak oleh Admin.${remark ? ` Catatan: ${remark}` : ''}`
                        : `${reqType} Anda diubah statusnya menjadi ${newStatus}.`);
                const type = newStatus === 'rejected' ? 'submission_rejected' : 'submission_approved';
                await createNotification(item.user_id, title, message, type);
            }

            toast.success('Pengajuan berhasil diperbarui');
            setEditItem(null);
        } catch (error) {
            console.error(error);
            toast.error('Gagal memperbarui pengajuan');
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteData) return;
        const { id, collectionName } = deleteData;
        try {
            await deleteDoc(doc(db, collectionName, id));
            toast.success('Pengajuan berhasil dihapus');
        } catch (error) {
            console.error(error);
            toast.error('Gagal menghapus pengajuan');
        } finally {
            setDeleteData(null);
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
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Persetujuan & Pengajuan</h3>
                    <p className="text-sm text-slate-500 mt-1">Kelola permohonan izin, cuti, sakit, dan lembur dari seluruh karyawan.</p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <label 
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all text-xs cursor-pointer justify-center"
                        title="Unggah surat izin dokter, surat cuti, atau slip lembur untuk ditambahkan otomatis oleh AI"
                    >
                        <Sparkles size={14} className={isExtracting ? "animate-spin" : ""} />
                        <span>{isExtracting ? "Memproses AI..." : "Impor Izin/Lembur (AI)"}</span>
                        <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleAIApprovalUpload} 
                            disabled={isExtracting}
                            className="hidden" 
                        />
                    </label>

                    <div className="flex bg-slate-200 p-1 rounded-xl">
                        <button 
                            onClick={() => { setActiveTab('leave'); setFilterType('all'); }} 
                            className={`flex-1 sm:flex-none px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'leave' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-600 hover:text-slate-800'}`}
                        >
                            <span>Izin / Sakit / Cuti</span>
                            {leaveRequests.filter(item => item.status === 'pending').length > 0 && (
                                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-bounce">
                                    {leaveRequests.filter(item => item.status === 'pending').length}
                                </span>
                            )}
                        </button>
                        <button 
                            onClick={() => { setActiveTab('overtime'); setFilterType('all'); }} 
                            className={`flex-1 sm:flex-none px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'overtime' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-600 hover:text-slate-800'}`}
                        >
                            <span>Lembur</span>
                            {overtimeRequests.filter(item => item.status === 'pending').length > 0 && (
                                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-bounce">
                                    {overtimeRequests.filter(item => item.status === 'pending').length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Leave Summary */}
                <div className="bg-gradient-to-br from-white to-slate-50/50 p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                                <Calendar size={18} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm">Izin / Sakit / Cuti</h4>
                                <p className="text-xs text-slate-500">Ringkasan pengajuan absen</p>
                            </div>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
                            {leaveRequests.length} Total
                        </span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-amber-50/60 hover:bg-amber-50 p-3 rounded-xl border border-amber-100 transition-colors">
                            <p className="text-[11px] text-amber-600 font-medium">Menunggu</p>
                            <div className="flex items-baseline gap-1 mt-1">
                                <span className="text-xl font-bold text-amber-700">
                                    {leaveRequests.filter(item => item.status === 'pending').length}
                                </span>
                                <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">Masuk</span>
                            </div>
                        </div>
                        <div className="bg-emerald-50/60 hover:bg-emerald-50 p-3 rounded-xl border border-emerald-100 transition-colors">
                            <p className="text-[11px] text-emerald-600 font-medium">Disetujui</p>
                            <div className="flex items-baseline mt-1">
                                <span className="text-xl font-bold text-emerald-700">
                                    {leaveRequests.filter(item => item.status === 'approved').length}
                                </span>
                            </div>
                        </div>
                        <div className="bg-rose-50/60 hover:bg-rose-50 p-3 rounded-xl border border-rose-100 transition-colors">
                            <p className="text-[11px] text-rose-600 font-medium">Ditolak</p>
                            <div className="flex items-baseline mt-1">
                                <span className="text-xl font-bold text-rose-700">
                                    {leaveRequests.filter(item => item.status === 'rejected').length}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Overtime Summary */}
                <div className="bg-gradient-to-br from-white to-slate-50/50 p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                                <Clock size={18} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm">Lembur Karyawan</h4>
                                <p className="text-xs text-slate-500">Ringkasan pengajuan lembur</p>
                            </div>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
                            {overtimeRequests.length} Total
                        </span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-amber-50/60 hover:bg-amber-50 p-3 rounded-xl border border-amber-100 transition-colors">
                            <p className="text-[11px] text-amber-600 font-medium">Menunggu</p>
                            <div className="flex items-baseline gap-1 mt-1">
                                <span className="text-xl font-bold text-amber-700">
                                    {overtimeRequests.filter(item => item.status === 'pending').length}
                                </span>
                                <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">Masuk</span>
                            </div>
                        </div>
                        <div className="bg-emerald-50/60 hover:bg-emerald-50 p-3 rounded-xl border border-emerald-100 transition-colors">
                            <p className="text-[11px] text-emerald-600 font-medium">Disetujui</p>
                            <div className="flex items-baseline mt-1">
                                <span className="text-xl font-bold text-emerald-700">
                                    {overtimeRequests.filter(item => item.status === 'approved').length}
                                </span>
                            </div>
                        </div>
                        <div className="bg-rose-50/60 hover:bg-rose-50 p-3 rounded-xl border border-rose-100 transition-colors">
                            <p className="text-[11px] text-rose-600 font-medium">Ditolak</p>
                            <div className="flex items-baseline mt-1">
                                <span className="text-xl font-bold text-rose-700">
                                    {overtimeRequests.filter(item => item.status === 'rejected').length}
                                </span>
                            </div>
                        </div>
                    </div>
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
                                                    <div className="flex justify-end items-center gap-1.5 flex-wrap">
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
                                                            onClick={() => handleStartEdit(item, 'leave_requests')}
                                                            className="w-9 h-9 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                            title="Edit Pengajuan"
                                                        >
                                                            <Edit size={15} />
                                                        </button>

                                                        <button
                                                            onClick={() => setDeleteData({ id: item.id, collectionName: 'leave_requests', employeeName: user.nama || 'Karyawan' })}
                                                            className="w-9 h-9 flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                            title="Hapus Pengajuan"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>

                                                        <button
                                                            onClick={() => setDetailItem({ item, collectionName: 'leave_requests' })}
                                                            className="px-2.5 h-9 text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors flex items-center justify-center"
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
                                                    <div className="flex justify-end items-center gap-1.5 flex-wrap">
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
                                                            onClick={() => handleStartEdit(item, 'overtime')}
                                                            className="w-9 h-9 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                            title="Edit Pengajuan"
                                                        >
                                                            <Edit size={15} />
                                                        </button>

                                                        <button
                                                            onClick={() => setDeleteData({ id: item.id, collectionName: 'overtime', employeeName: user.nama || 'Karyawan' })}
                                                            className="w-9 h-9 flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                            title="Hapus Pengajuan"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>

                                                        <button
                                                            onClick={() => setDetailItem({ item, collectionName: 'overtime' })}
                                                            className="px-2.5 h-9 text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors flex items-center justify-center"
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

            {/* Edit Modal */}
            {editItem && (() => {
                const { item, collectionName } = editItem;
                const user = usersMap[item.user_id] || {};
                return (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            {/* Modal Header */}
                            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h4 className="font-bold text-slate-800">Edit Pengajuan</h4>
                                    <p className="text-xs text-slate-400 mt-0.5">Milik: {user.nama || 'Karyawan'}</p>
                                </div>
                                <button 
                                    onClick={() => setEditItem(null)} 
                                    className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200/50 rounded-lg transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            
                            {/* Modal Form */}
                            <form onSubmit={handleSaveEdit}>
                                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                                    {collectionName === 'leave_requests' ? (
                                        <>
                                            {/* Tipe Leave */}
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tipe Pengajuan</label>
                                                <select
                                                    value={editLeaveForm.tipe}
                                                    onChange={(e) => setEditLeaveForm(prev => ({ ...prev, tipe: e.target.value }))}
                                                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
                                                    required
                                                >
                                                    <option value="izin">Izin</option>
                                                    <option value="sakit">Sakit</option>
                                                    <option value="cuti">Cuti</option>
                                                </select>
                                            </div>

                                            {/* Tanggal Mulai & Akhir */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tanggal Mulai</label>
                                                    <input
                                                        type="date"
                                                        value={editLeaveForm.tanggal_mulai}
                                                        onChange={(e) => setEditLeaveForm(prev => ({ ...prev, tanggal_mulai: e.target.value }))}
                                                        className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tanggal Akhir</label>
                                                    <input
                                                        type="date"
                                                        value={editLeaveForm.tanggal_akhir}
                                                        onChange={(e) => setEditLeaveForm(prev => ({ ...prev, tanggal_akhir: e.target.value }))}
                                                        className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
                                                        required
                                                    />
                                                </div>
                                            </div>

                                            {/* Alasan */}
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Alasan Pengajuan</label>
                                                <textarea
                                                    rows={3}
                                                    value={editLeaveForm.alasan}
                                                    onChange={(e) => setEditLeaveForm(prev => ({ ...prev, alasan: e.target.value }))}
                                                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
                                                    required
                                                ></textarea>
                                            </div>

                                            {/* Status */}
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status Persetujuan</label>
                                                <select
                                                    value={editLeaveForm.status}
                                                    onChange={(e) => setEditLeaveForm(prev => ({ ...prev, status: e.target.value }))}
                                                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
                                                    required
                                                >
                                                    <option value="pending">Menunggu (Pending)</option>
                                                    <option value="approved">Disetujui (Approved)</option>
                                                    <option value="rejected">Ditolak (Rejected)</option>
                                                </select>
                                            </div>

                                            {/* Catatan Admin */}
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Catatan Admin</label>
                                                <textarea
                                                    rows={2}
                                                    value={editLeaveForm.catatan_admin}
                                                    onChange={(e) => setEditLeaveForm(prev => ({ ...prev, catatan_admin: e.target.value }))}
                                                    placeholder="Tulis alasan atau tanggapan perihal status pengajuan..."
                                                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
                                                ></textarea>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {/* Tanggal Lembur */}
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tanggal Lembur</label>
                                                <input
                                                    type="date"
                                                    value={editOvertimeForm.tanggal}
                                                    onChange={(e) => setEditOvertimeForm(prev => ({ ...prev, tanggal: e.target.value }))}
                                                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
                                                    required
                                                />
                                            </div>

                                            {/* Durasi Kerja */}
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Durasi Kerja (Jam)</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={24}
                                                    value={editOvertimeForm.durasi_jam}
                                                    onChange={(e) => setEditOvertimeForm(prev => ({ ...prev, durasi_jam: Number(e.target.value) }))}
                                                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
                                                    required
                                                />
                                            </div>

                                            {/* Keterangan */}
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Keterangan Aktivitas</label>
                                                <textarea
                                                    rows={3}
                                                    value={editOvertimeForm.keterangan}
                                                    onChange={(e) => setEditOvertimeForm(prev => ({ ...prev, keterangan: e.target.value }))}
                                                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
                                                    required
                                                ></textarea>
                                            </div>

                                            {/* Status */}
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status Persetujuan</label>
                                                <select
                                                    value={editOvertimeForm.status}
                                                    onChange={(e) => setEditOvertimeForm(prev => ({ ...prev, status: e.target.value }))}
                                                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
                                                    required
                                                >
                                                    <option value="pending">Menunggu (Pending)</option>
                                                    <option value="approved">Disetujui (Approved)</option>
                                                    <option value="rejected">Ditolak (Rejected)</option>
                                                </select>
                                            </div>

                                            {/* Catatan Admin */}
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Catatan Admin</label>
                                                <textarea
                                                    rows={2}
                                                    value={editOvertimeForm.catatan_admin}
                                                    onChange={(e) => setEditOvertimeForm(prev => ({ ...prev, catatan_admin: e.target.value }))}
                                                    placeholder="Tulis alasan atau tanggapan perihal status pengajuan..."
                                                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
                                                ></textarea>
                                            </div>
                                        </>
                                    )}
                                </div>
                                
                                {/* Modal Footer */}
                                <div className="p-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50">
                                    <button 
                                        type="button"
                                        onClick={() => setEditItem(null)} 
                                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                                    >
                                        Batal
                                    </button>
                                    <button 
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 rounded-lg transition-all text-sm shadow-sm"
                                    >
                                        Simpan Perubahan
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* Confirm Delete Dialog */}
            <ConfirmDialog
                isOpen={!!deleteData}
                title="Hapus Pengajuan"
                message={`Apakah Anda yakin ingin menghapus permanen pengajuan dari ${deleteData?.employeeName || 'Karyawan'}? Tindakan ini tidak dapat dibatalkan.`}
                confirmText="Hapus Permanen"
                cancelText="Batal"
                isDestructive={true}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteData(null)}
            />
        </div>
    );
}
