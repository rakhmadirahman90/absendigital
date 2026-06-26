import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, doc, updateDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Check, X } from 'lucide-react';
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
    
    const [actionData, setActionData] = useState<{collectionName: string, id: string, status: string} | null>(null);

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
            await updateDoc(doc(db, collectionName, id), { status });
            toast.success(`Berhasil menandai sebagai ${status}`);
        } catch (error) {
            console.error(error);
            toast.error('Gagal mengupdate status');
        } finally {
            setActionData(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h3 className="text-xl font-bold text-slate-800">Persetujuan (Approval)</h3>
                <div className="flex bg-slate-200 p-1 rounded-lg w-full sm:w-auto">
                    <button onClick={() => setActiveTab('leave')} className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'leave' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-600 hover:text-slate-800'}`}>Izin / Cuti</button>
                    <button onClick={() => setActiveTab('overtime')} className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'overtime' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-600 hover:text-slate-800'}`}>Lembur</button>
                </div>
            </div>

            {activeTab === 'leave' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="p-4 text-sm font-medium text-slate-500 min-w-[120px]">Karyawan</th>
                                    <th className="p-4 text-sm font-medium text-slate-500">Tipe</th>
                                    <th className="p-4 text-sm font-medium text-slate-500 min-w-[200px]">Tanggal</th>
                                    <th className="p-4 text-sm font-medium text-slate-500 min-w-[200px]">Alasan</th>
                                    <th className="p-4 text-sm font-medium text-slate-500">Status</th>
                                    <th className="p-4 text-sm font-medium text-slate-500 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className="p-4 text-center text-slate-500">Loading...</td></tr>
                                ) : leaveRequests.length === 0 ? (
                                    <tr><td colSpan={6} className="p-4 text-center text-slate-500">Tidak ada pengajuan izin/cuti.</td></tr>
                                ) : (
                                    leaveRequests.map(item => {
                                        const user = usersMap[item.user_id] || {};
                                        return (
                                            <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                                <td className="p-4 text-sm font-medium text-slate-800">{user.nama || 'Unknown'}</td>
                                                <td className="p-4 text-sm capitalize text-slate-600">{item.tipe}</td>
                                                <td className="p-4 text-sm text-slate-600">
                                                    {format(parseISO(item.tanggal_mulai), 'dd MMM yyyy', { locale: idLocale })} - {format(parseISO(item.tanggal_akhir), 'dd MMM yyyy', { locale: idLocale })}
                                                </td>
                                                <td className="p-4 text-sm text-slate-600">{item.alasan}</td>
                                                <td className="p-4 text-sm">
                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${item.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : item.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm">
                                                    <div className="flex justify-end gap-2">
                                                        {item.status === 'pending' && (
                                                            <>
                                                                <button onClick={() => setActionData({collectionName: 'leave_requests', id: item.id, status: 'approved'})} className="w-10 h-10 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Check size={18} /></button>
                                                                <button onClick={() => setActionData({collectionName: 'leave_requests', id: item.id, status: 'rejected'})} className="w-10 h-10 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"><X size={18} /></button>
                                                            </>
                                                        )}
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

            {activeTab === 'overtime' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="p-4 text-sm font-medium text-slate-500 min-w-[120px]">Karyawan</th>
                                    <th className="p-4 text-sm font-medium text-slate-500 min-w-[120px]">Tanggal</th>
                                    <th className="p-4 text-sm font-medium text-slate-500 min-w-[120px]">Durasi (Jam)</th>
                                    <th className="p-4 text-sm font-medium text-slate-500 min-w-[200px]">Keterangan</th>
                                    <th className="p-4 text-sm font-medium text-slate-500">Status</th>
                                    <th className="p-4 text-sm font-medium text-slate-500 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className="p-4 text-center text-slate-500">Loading...</td></tr>
                                ) : overtimeRequests.length === 0 ? (
                                    <tr><td colSpan={6} className="p-4 text-center text-slate-500">Tidak ada pengajuan lembur.</td></tr>
                                ) : (
                                    overtimeRequests.map(item => {
                                        const user = usersMap[item.user_id] || {};
                                        return (
                                            <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                                <td className="p-4 text-sm font-medium text-slate-800">{user.nama || 'Unknown'}</td>
                                                <td className="p-4 text-sm text-slate-600">
                                                    {format(parseISO(item.tanggal), 'dd MMM yyyy', { locale: idLocale })}
                                                </td>
                                                <td className="p-4 text-sm text-slate-600">{item.durasi_jam} Jam</td>
                                                <td className="p-4 text-sm text-slate-600">{item.keterangan}</td>
                                                <td className="p-4 text-sm">
                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${item.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : item.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm">
                                                    <div className="flex justify-end gap-2">
                                                        {item.status === 'pending' && (
                                                            <>
                                                                <button onClick={() => setActionData({collectionName: 'overtime', id: item.id, status: 'approved'})} className="w-10 h-10 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Check size={18} /></button>
                                                                <button onClick={() => setActionData({collectionName: 'overtime', id: item.id, status: 'rejected'})} className="w-10 h-10 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"><X size={18} /></button>
                                                            </>
                                                        )}
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
            
            <ConfirmDialog
                isOpen={!!actionData}
                title={`Konfirmasi ${actionData?.status === 'approved' ? 'Persetujuan' : 'Penolakan'}`}
                message={`Apakah Anda yakin ingin ${actionData?.status === 'approved' ? 'menyetujui' : 'menolak'} pengajuan ini?`}
                onConfirm={confirmAction}
                onCancel={() => setActionData(null)}
                isDestructive={actionData?.status === 'rejected'}
                confirmText={actionData?.status === 'approved' ? 'Setujui' : 'Tolak'}
            />
        </div>
    );
}
