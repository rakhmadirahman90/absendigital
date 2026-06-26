import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from 'react-hot-toast';

export default function KaryawanTab() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState<any>({ waNumber: '', nama: '', role: 'karyawan', divisi: '', jabatan: '', password: '' });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
            const data: any[] = [];
            snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
            setUsers(data);
            setLoading(false);
        }, (error) => {
            console.error(error);
            setLoading(false);
        });
        return () => unsubUsers();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const cleanWaNumber = formData.waNumber.replace(/\D/g, '');
            const userId = editingId || `wa-${cleanWaNumber}`;
            
            const payload = { ...formData, waNumber: cleanWaNumber };
            if (!editingId && !payload.password) payload.password = '123456'; // Default password

            await setDoc(doc(db, 'users', userId), payload, { merge: true });
            toast.success('Berhasil menyimpan data karyawan');
            setShowForm(false);
            setEditingId(null);
            setFormData({ waNumber: '', nama: '', role: 'karyawan', divisi: '', jabatan: '', password: '' });
        } catch (error) {
            console.error(error);
            toast.error('Gagal menyimpan');
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await deleteDoc(doc(db, 'users', deleteId));
            toast.success('Karyawan berhasil dihapus');
        } catch (error) {
            console.error(error);
            toast.error('Gagal menghapus karyawan');
        } finally {
            setDeleteId(null);
        }
    };

    const handleEdit = (user: any) => {
        setFormData(user);
        setEditingId(user.id);
        setShowForm(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Manajemen Karyawan</h3>
                <button 
                    onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ waNumber: '', nama: '', role: 'karyawan', divisi: '', jabatan: '', password: '' }); }}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                    <Plus size={16} />
                    <span>Tambah Karyawan</span>
                </button>
            </div>

            {showForm && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                    <h4 className="font-bold text-lg mb-4">{editingId ? 'Edit Karyawan' : 'Tambah Karyawan'}</h4>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap</label>
                            <input required type="text" value={formData.nama} onChange={e => setFormData({...formData, nama: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">No. WhatsApp</label>
                            <input required disabled={!!editingId} type="text" value={formData.waNumber} onChange={e => setFormData({...formData, waNumber: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                            <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                                <option value="karyawan">Karyawan</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Divisi</label>
                            <input type="text" value={formData.divisi} onChange={e => setFormData({...formData, divisi: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Jabatan</label>
                            <input type="text" value={formData.jabatan} onChange={e => setFormData({...formData, jabatan: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Password (Kosongkan jika tidak diubah)</label>
                            <input type={editingId ? 'password' : 'text'} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder={editingId ? '***' : '123456'} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                        </div>
                        <div className="md:col-span-2 flex justify-end space-x-3 mt-4">
                            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 border border-slate-300 rounded-lg font-medium">Batal</button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Simpan</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-4 text-sm font-medium text-slate-500 min-w-[120px]">Nama</th>
                                <th className="p-4 text-sm font-medium text-slate-500 min-w-[120px]">No. WA</th>
                                <th className="p-4 text-sm font-medium text-slate-500">Divisi</th>
                                <th className="p-4 text-sm font-medium text-slate-500">Jabatan</th>
                                <th className="p-4 text-sm font-medium text-slate-500">Role</th>
                                <th className="p-4 text-sm font-medium text-slate-500 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="p-4 text-center text-slate-500">Loading...</td></tr>
                            ) : users.length === 0 ? (
                                <tr><td colSpan={6} className="p-4 text-center text-slate-500">Tidak ada data karyawan.</td></tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                        <td className="p-4 text-sm font-medium text-slate-800">{user.nama}</td>
                                        <td className="p-4 text-sm text-slate-600">{user.waNumber}</td>
                                        <td className="p-4 text-sm text-slate-600">{user.divisi || '-'}</td>
                                        <td className="p-4 text-sm text-slate-600">{user.jabatan || '-'}</td>
                                        <td className="p-4 text-sm text-slate-600">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => handleEdit(user)} className="w-10 h-10 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={18} /></button>
                                                <button onClick={() => setDeleteId(user.id)} className="w-10 h-10 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <ConfirmDialog
                isOpen={!!deleteId}
                title="Hapus Karyawan"
                message="Apakah Anda yakin ingin menghapus data karyawan ini? Tindakan ini tidak dapat dibatalkan."
                onConfirm={confirmDelete}
                onCancel={() => setDeleteId(null)}
                isDestructive={true}
                confirmText="Hapus"
            />
        </div>
    );
}
