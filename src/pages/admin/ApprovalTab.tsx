import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot, getDoc, addDoc, getDocs, where, limit } from 'firebase/firestore';
import { Check, X, Search, Filter, RefreshCw, Calendar, Clock, User, MessageSquare, ChevronDown, Edit, Trash2, Sparkles, AlertTriangle, ShieldCheck, CheckCircle2, MapPin } from 'lucide-react';
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

    // AI Suspicious Request Analysis states
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);
    const [isScanningAll, setIsScanningAll] = useState(false);
    const [analysisResultsMap, setAnalysisResultsMap] = useState<Record<string, any>>({});
    const [selectedAnalysis, setSelectedAnalysis] = useState<any>(null);
    const [showAnalysisModal, setShowAnalysisModal] = useState(false);

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

            const responseText = await response.text();
            let resData: any = {};
            try {
                resData = responseText ? JSON.parse(responseText) : {};
            } catch (parseErr) {
                throw new Error('Respon server tidak valid (bukan JSON).');
            }

            if (!response.ok) {
                throw new Error(resData.error || resData.message || 'Gagal berkomunikasi dengan AI');
            }
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

    const handleAnalyzeRequest = async (request: any) => {
        // If already analyzed, just open the modal to display details
        if (analysisResultsMap[request.id]) {
            setSelectedAnalysis({
                request,
                analysis: analysisResultsMap[request.id]
            });
            setShowAnalysisModal(true);
            return;
        }

        setAnalyzingId(request.id);
        const toastId = toast.loading('Mengambil data riwayat & mendeteksi pola lokasi...');

        try {
            // 1. Fetch employee details
            const user = usersMap[request.user_id] || {};
            const employeeName = user.nama || 'Karyawan';

            // 2. Fetch recent attendance logs of this user (up to 30 records)
            const attendanceSnap = await getDocs(
                query(
                    collection(db, 'attendance'),
                    where('user_id', '==', request.user_id),
                    limit(30)
                )
            );
            const attendanceHistory: any[] = [];
            attendanceSnap.forEach(docSnap => {
                attendanceHistory.push({ id: docSnap.id, ...docSnap.data() });
            });

            // 3. Get other leave requests of this user from local list
            const employeeHistory = leaveRequests.filter(h => h.user_id === request.user_id && h.id !== request.id);

            // 4. Call our Gemini analysis API
            const response = await fetch('/api/analyze-suspicious-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leaveRequest: request,
                    employeeName,
                    employeeHistory,
                    attendanceHistory
                })
            });

            const responseText = await response.text();
            let data: any = {};
            try {
                data = responseText ? JSON.parse(responseText) : {};
            } catch (parseErr) {
                throw new Error('Respon server tidak valid (bukan JSON).');
            }

            if (!response.ok) {
                throw new Error(data.error || 'Gagal terhubung dengan mesin analisis AI.');
            }
            if (!data.success || !data.analysis) {
                throw new Error('Gagal memproses hasil analisis kecurigaan AI.');
            }

            const analysis = data.analysis;

            // Save in map
            setAnalysisResultsMap(prev => ({
                ...prev,
                [request.id]: analysis
            }));

            // Open modal
            setSelectedAnalysis({
                request,
                analysis
            });
            setShowAnalysisModal(true);

            toast.success('Analisis Pola AI Selesai!', { id: toastId });

        } catch (error: any) {
            console.error('Error in handleAnalyzeRequest:', error);
            toast.error(error.message || 'Gagal menganalisis pola absensi', { id: toastId });
        } finally {
            setAnalyzingId(null);
        }
    };

    const handleAutoScanAllPending = async () => {
        const pendingLeaves = filteredLeaves.filter(item => item.status === 'pending' && !analysisResultsMap[item.id]);
        if (pendingLeaves.length === 0) {
            toast.success('Semua pengajuan pending sudah dipindai oleh AI!');
            return;
        }

        setIsScanningAll(true);
        const toastId = toast.loading(`Sedang memindai ${pendingLeaves.length} pengajuan via AI...`);
        let successCount = 0;

        for (const req of pendingLeaves) {
            try {
                const user = usersMap[req.user_id] || {};
                const employeeName = user.nama || 'Karyawan';

                const attendanceSnap = await getDocs(
                    query(
                        collection(db, 'attendance'),
                        where('user_id', '==', req.user_id),
                        limit(30)
                    )
                );
                const attendanceHistory: any[] = [];
                attendanceSnap.forEach(docSnap => {
                    attendanceHistory.push({ id: docSnap.id, ...docSnap.data() });
                });

                const employeeHistory = leaveRequests.filter(h => h.user_id === req.user_id && h.id !== req.id);

                const response = await fetch('/api/analyze-suspicious-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        leaveRequest: req,
                        employeeName,
                        employeeHistory,
                        attendanceHistory
                    })
                });

                const responseText = await response.text();
                if (response.ok) {
                    let data: any = {};
                    try {
                        data = responseText ? JSON.parse(responseText) : {};
                    } catch (parseErr) {
                        data = {};
                    }
                    if (data.success && data.analysis) {
                        setAnalysisResultsMap(prev => ({
                            ...prev,
                            [req.id]: data.analysis
                        }));
                        successCount++;
                    }
                }
            } catch (err) {
                console.warn('Gagal memindai pengajuan:', req.id, err);
            }
        }

        setIsScanningAll(false);
        toast.success(`Selesai! Berhasil memindai ${successCount} dari ${pendingLeaves.length} pengajuan.`, { id: toastId });
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

                    {activeTab === 'leave' && (
                        <button
                            onClick={handleAutoScanAllPending}
                            disabled={isScanningAll}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all text-xs cursor-pointer justify-center disabled:opacity-50"
                            title="Audit otomatis semua pengajuan pending untuk mendeteksi kecurigaan pola riwayat & lokasi"
                        >
                            <AlertTriangle size={14} className={isScanningAll ? "animate-bounce" : ""} />
                            <span>{isScanningAll ? "Mengaudit Pola..." : "Audit Kecurigaan AI"}</span>
                        </button>
                    )}

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
                                                        <span className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 flex-wrap">
                                                            {user.nama || 'Karyawan'}
                                                            {analysisResultsMap[item.id] && (
                                                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                                                    analysisResultsMap[item.id].is_suspicious 
                                                                        ? 'bg-rose-100 text-rose-800 animate-pulse' 
                                                                        : 'bg-emerald-100 text-emerald-800'
                                                                }`}>
                                                                    {analysisResultsMap[item.id].is_suspicious ? 'Suspicious' : 'Verified'}
                                                                </span>
                                                            )}
                                                        </span>
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
                                                            onClick={() => handleAnalyzeRequest(item)}
                                                            className={`px-2.5 h-9 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 shadow-sm ${
                                                                analysisResultsMap[item.id]
                                                                    ? analysisResultsMap[item.id].is_suspicious
                                                                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                                                                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                                    : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white'
                                                            }`}
                                                            title="Analisis kecurigaan pola pengajuan & riwayat lokasi via AI"
                                                            disabled={analyzingId === item.id}
                                                        >
                                                            <Sparkles size={12} className={analyzingId === item.id ? "animate-spin" : ""} />
                                                            <span>
                                                                {analyzingId === item.id 
                                                                    ? 'Memindai...' 
                                                                    : analysisResultsMap[item.id]
                                                                        ? analysisResultsMap[item.id].is_suspicious
                                                                            ? 'Suspicious!'
                                                                            : 'Aman (AI)'
                                                                        : 'Analisis AI'}
                                                            </span>
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

            {/* AI Suspicious Pattern Analysis Modal */}
            {showAnalysisModal && selectedAnalysis && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        
                        {/* Modal Header */}
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-150 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sparkles className="text-amber-500 animate-pulse" size={20} />
                                <div>
                                    <h4 className="text-md font-bold text-slate-800">Analisis Integritas & Pola Absensi Karyawan (AI)</h4>
                                    <p className="text-xs text-slate-500">Mendeteksi potensi manipulasi berdasarkan riwayat dan lokasi</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => { setShowAnalysisModal(false); setSelectedAnalysis(null); }}
                                className="p-1.5 hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-6 overflow-y-auto">
                            {/* Target Leave Info */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 grid grid-cols-2 gap-4 text-xs">
                                <div>
                                    <span className="text-slate-400 block uppercase font-semibold">Nama Karyawan</span>
                                    <span className="text-slate-800 font-bold text-sm">{selectedAnalysis.employeeName || usersMap[selectedAnalysis.request.user_id]?.nama || 'Karyawan'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block uppercase font-semibold">Tipe & Durasi Pengajuan</span>
                                    <span className="text-slate-800 font-bold text-sm capitalize">
                                        {selectedAnalysis.request.tipe} ({format(parseISO(selectedAnalysis.request.tanggal_mulai), 'dd MMM yyyy', { locale: idLocale })} s/d {format(parseISO(selectedAnalysis.request.tanggal_akhir), 'dd MMM yyyy', { locale: idLocale })})
                                    </span>
                                </div>
                                <div className="col-span-2 border-t border-slate-150 pt-2 mt-1">
                                    <span className="text-slate-400 block uppercase font-semibold">Alasan yang Diajukan</span>
                                    <span className="text-slate-700 italic font-medium">"{selectedAnalysis.request.alasan}"</span>
                                </div>
                            </div>

                            {/* Indicator Panel */}
                            <div className={`p-5 rounded-2xl border flex items-start gap-4 ${
                                selectedAnalysis.analysis.is_suspicious 
                                    ? 'bg-rose-50 border-rose-100 text-rose-900' 
                                    : 'bg-emerald-50 border-emerald-100 text-emerald-900'
                            }`}>
                                <div className={`p-3 rounded-xl ${selectedAnalysis.analysis.is_suspicious ? 'bg-rose-100' : 'bg-emerald-100'}`}>
                                    {selectedAnalysis.analysis.is_suspicious ? (
                                        <AlertTriangle className="text-rose-600 animate-bounce" size={24} />
                                    ) : (
                                        <ShieldCheck className="text-emerald-600" size={24} />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                        <h5 className="font-extrabold text-lg tracking-tight">
                                            {selectedAnalysis.analysis.is_suspicious ? 'Terdeteksi Pola Mencurigakan!' : 'Pola Dinilai Aman & Wajar'}
                                        </h5>
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wide ${
                                            selectedAnalysis.analysis.is_suspicious 
                                                ? 'bg-rose-200 text-rose-800' 
                                                : 'bg-emerald-200 text-emerald-800'
                                        }`}>
                                            Keyakinan: {selectedAnalysis.analysis.confidence_score}%
                                        </span>
                                    </div>
                                    <p className="text-xs mt-1.5 opacity-90 leading-relaxed">
                                        {selectedAnalysis.analysis.suspicion_details || 'AI tidak mendeteksi anomali aneh atau pengajuan mencurigakan pada riwayat absensi dan geolokasi karyawan.'}
                                    </p>
                                </div>
                            </div>

                            {/* Two-Column Deep Analysis */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Employee History Column */}
                                <div className="border border-slate-150 rounded-xl p-4 space-y-2 bg-slate-50/50">
                                    <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs uppercase tracking-wider">
                                        <Clock size={14} className="text-indigo-500" />
                                        <span>Analisis Pola Riwayat</span>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                        {selectedAnalysis.analysis.history_analysis || 'Riwayat pengajuan cuti/izin karyawan ini konsisten dan tidak menunjukkan kecenderungan memanipulasi akhir pekan atau hari libur.'}
                                    </p>
                                </div>

                                {/* Location Column */}
                                <div className="border border-slate-150 rounded-xl p-4 space-y-2 bg-slate-50/50">
                                    <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs uppercase tracking-wider">
                                        <MapPin size={14} className="text-rose-500" />
                                        <span>Analisis Riwayat Lokasi</span>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                        {selectedAnalysis.analysis.location_analysis || 'Titik koordinat GPS dan alamat check-in terakhir sinkron dengan alamat rumah atau lokasi penugasan karyawan.'}
                                    </p>
                                </div>
                            </div>

                            {/* Key Indicators / Reasons */}
                            {selectedAnalysis.analysis.reasons && selectedAnalysis.analysis.reasons.length > 0 && (
                                <div className="space-y-2">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Faktor Temuan Kunci</span>
                                    <ul className="space-y-1.5">
                                        {selectedAnalysis.analysis.reasons.map((reason: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                                                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${selectedAnalysis.analysis.is_suspicious ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                                                <span>{reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* HR Actions Recommendations */}
                            <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/60 space-y-1.5">
                                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block flex items-center gap-1">
                                    <CheckCircle2 size={13} className="text-amber-600" />
                                    Rekomendasi Tindakan HRD
                                </span>
                                <p className="text-xs text-amber-900 leading-relaxed">
                                    {selectedAnalysis.analysis.hr_recommendation || 'Bisa disetujui secara normal. Tetap monitor pengajuan berikutnya secara berkala.'}
                                </p>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-150 flex justify-end gap-3">
                            <button
                                onClick={() => { setShowAnalysisModal(false); setSelectedAnalysis(null); }}
                                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors border border-slate-200"
                            >
                                Tutup
                            </button>
                            {selectedAnalysis.analysis.is_suspicious && selectedAnalysis.request.status === 'pending' && (
                                <button
                                    onClick={() => {
                                        setActionData({ collectionName: 'leave_requests', id: selectedAnalysis.request.id, status: 'rejected' });
                                        setShowAnalysisModal(false);
                                        setSelectedAnalysis(null);
                                    }}
                                    className="px-4 py-2 text-xs font-bold bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-colors shadow-sm"
                                >
                                    Tolak Pengajuan Ini
                                </button>
                            )}
                            {!selectedAnalysis.analysis.is_suspicious && selectedAnalysis.request.status === 'pending' && (
                                <button
                                    onClick={() => {
                                        setActionData({ collectionName: 'leave_requests', id: selectedAnalysis.request.id, status: 'approved' });
                                        setShowAnalysisModal(false);
                                        setSelectedAnalysis(null);
                                    }}
                                    className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
                                >
                                    Setujui Pengajuan Ini
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
