import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { MapPin, Image as ImageIcon, Edit2, Trash2, X } from 'lucide-react';
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
    
    const [editingRecord, setEditingRecord] = useState<any>(null);
    const [editForm, setEditForm] = useState({ jam_masuk: '', jam_pulang: '', status: '' });
    
    const [deleteId, setDeleteId] = useState<string | null>(null);

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
            toast.success('Data berhasil dihapus');
        } catch (error) {
            console.error('Error deleting attendance:', error);
            toast.error('Gagal menghapus data');
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
            toast.success('Data berhasil diupdate');
            setEditingRecord(null);
        } catch (error) {
            console.error('Error updating attendance:', error);
            toast.error('Gagal mengupdate data');
        }
    };

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-bold text-slate-800">Monitor Absensi</h3>
            
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal</label>
                    <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Divisi</label>
                    <select value={filterDivisi} onChange={e => setFilterDivisi(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                        <option value="">Semua Divisi</option>
                        {divisiList.map(div => <option key={div} value={div}>{div}</option>)}
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-4 text-sm font-medium text-slate-500 min-w-[120px]">Karyawan</th>
                                <th className="p-4 text-sm font-medium text-slate-500 min-w-[100px]">Divisi</th>
                                <th className="p-4 text-sm font-medium text-slate-500">Masuk</th>
                                <th className="p-4 text-sm font-medium text-slate-500">Pulang</th>
                                <th className="p-4 text-sm font-medium text-slate-500 text-center">Lokasi</th>
                                <th className="p-4 text-sm font-medium text-slate-500 text-center">Selfie</th>
                                <th className="p-4 text-sm font-medium text-slate-500">Status</th>
                                <th className="p-4 text-sm font-medium text-slate-500 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="p-4 text-center text-slate-500">Loading...</td></tr>
                            ) : attendance.length === 0 ? (
                                <tr><td colSpan={8} className="p-4 text-center text-slate-500">Tidak ada data absensi pada tanggal ini.</td></tr>
                            ) : (
                                attendance.map(item => {
                                    const user = usersMap[item.user_id] || {};
                                    return (
                                        <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                            <td className="p-4 text-sm font-medium text-slate-800">{user.nama || 'Unknown'}</td>
                                            <td className="p-4 text-sm text-slate-600">{user.divisi || '-'}</td>
                                            <td className="p-4 text-sm font-mono text-slate-600">{item.jam_masuk || '-'}</td>
                                            <td className="p-4 text-sm font-mono text-slate-600">{item.jam_pulang || '-'}</td>
                                            <td className="p-4 text-sm text-center">
                                                <div className="flex justify-center space-x-2">
                                                    {item.latitude_masuk && (
                                                        <button onClick={() => handleOpenMap(item.latitude_masuk, item.longitude_masuk)} className="w-10 h-10 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Lokasi Masuk">
                                                            <MapPin size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm text-center">
                                                {item.selfie_masuk && (
                                                    <a href={item.selfie_masuk} target="_blank" rel="noreferrer" className="w-10 h-10 inline-flex items-center justify-center text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Lihat Selfie">
                                                        <ImageIcon size={18} />
                                                    </a>
                                                )}
                                            </td>
                                            <td className="p-4 text-sm">
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${item.status === 'Terlambat' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {item.status || 'Hadir'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-sm">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => handleEdit(item)} className="w-10 h-10 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={18} /></button>
                                                    <button onClick={() => setDeleteId(item.id)} className="w-10 h-10 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
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

            {editingRecord && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Edit Absensi</h3>
                            <button onClick={() => setEditingRecord(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Jam Masuk</label>
                                <input 
                                    type="time" 
                                    step="1"
                                    value={editForm.jam_masuk}
                                    onChange={(e) => setEditForm({...editForm, jam_masuk: e.target.value})}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Jam Pulang</label>
                                <input 
                                    type="time" 
                                    step="1"
                                    value={editForm.jam_pulang}
                                    onChange={(e) => setEditForm({...editForm, jam_pulang: e.target.value})}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                <select 
                                    value={editForm.status}
                                    onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                >
                                    <option value="Hadir">Hadir</option>
                                    <option value="Terlambat">Terlambat</option>
                                    <option value="Izin">Izin</option>
                                    <option value="Sakit">Sakit</option>
                                    <option value="Alpa">Alpa</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end space-x-3 bg-slate-50">
                            <button onClick={() => setEditingRecord(null)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors border border-slate-300">Batal</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-lg transition-colors">Simpan Perubahan</button>
                        </div>
                    </div>
                </div>
            )}
            
            <ConfirmDialog
                isOpen={!!deleteId}
                title="Hapus Data Absensi"
                message="Apakah Anda yakin ingin menghapus data absensi ini? Tindakan ini tidak dapat dibatalkan."
                onConfirm={confirmDelete}
                onCancel={() => setDeleteId(null)}
                isDestructive={true}
                confirmText="Hapus Data"
            />
        </div>
    );
}
