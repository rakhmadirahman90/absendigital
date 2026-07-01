import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Plus, Edit2, Trash2, Building, UserPlus, Upload, Download, Sparkles } from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from 'react-hot-toast';

export default function KaryawanTab() {
    const [users, setUsers] = useState<any[]>([]);
    const [offices, setOffices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState<any>({ waNumber: '', nama: '', role: 'karyawan', divisi: '', jabatan: '', password: '', assignedOfficeId: 'all' });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);

    const handleAIPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsExtracting(true);
        const toastId = toast.loading('AI sedang memindai foto & memproses daftar karyawan...');

        try {
            const base64Image = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            });

            const response = await fetch('/api/extract-employees', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ image: base64Image })
            });

            const responseText = await response.text();
            let data: any = {};
            try {
                data = responseText ? JSON.parse(responseText) : {};
            } catch (parseErr) {
                throw new Error('Respon server tidak valid (bukan JSON).');
            }

            if (!response.ok) {
                throw new Error(data.error || 'Gagal berkomunikasi dengan layanan AI');
            }
            if (!data.success || !data.employees || data.employees.length === 0) {
                throw new Error('AI tidak menemukan data karyawan dalam gambar tersebut. Pastikan teks atau tabel terlihat jelas.');
            }

            let importCount = 0;
            for (const emp of data.employees) {
                const waNumber = emp.waNumber ? emp.waNumber.replace(/\D/g, '') : '';
                if (!waNumber || !emp.nama) continue;

                const userId = `wa-${waNumber}`;
                const payload = {
                    waNumber,
                    nama: emp.nama.toUpperCase(),
                    divisi: emp.divisi || '162',
                    jabatan: emp.jabatan || 'OPERATOR',
                    role: emp.role === 'admin' ? 'admin' : 'karyawan',
                    password: emp.password || '123456',
                    assignedOfficeId: emp.assignedOfficeId || 'all'
                };

                await setDoc(doc(db, 'users', userId), payload, { merge: true });
                importCount++;
            }

            toast.success(`AI Berhasil! Mengimpor ${importCount} karyawan dari foto.`, { id: toastId });
        } catch (error: any) {
            console.error("Gagal melakukan ekstraksi data via AI:", error);
            toast.error(error.message || 'Gagal memproses gambar menggunakan AI', { id: toastId });
        } finally {
            setIsExtracting(false);
            e.target.value = '';
        }
    };

    const handleDownloadTemplate = () => {
        const headers = ['waNumber', 'nama', 'divisi', 'jabatan', 'password', 'role', 'assignedOfficeId'];
        const sampleRows = [
            ['0816200001', 'ASMA', '162', 'ADMIN', '123456', 'karyawan', 'all'],
            ['0816200002', 'JUNET', '162', 'OPERATOR', '123456', 'karyawan', 'all'],
            ['0816200003', 'ABI', '162', 'OPERATOR', '123456', 'karyawan', 'all'],
            ['0816200004', 'JUMA', '162', 'PENGAWAS GUD', '123456', 'karyawan', 'all'],
            ['0816200005', 'PUNDU', '162', 'OPERATOR', '123456', 'karyawan', 'all']
        ];
        const csvContent = "\uFEFF" + [headers.join(','), ...sampleRows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "Format_Import_Karyawan.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Template CSV berhasil diunduh');
    };

    const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target?.result as string;
            if (!text) {
                toast.error("File CSV kosong atau tidak valid");
                return;
            }

            try {
                const lines = text.split(/\r?\n/);
                if (lines.length < 2) {
                    toast.error("File CSV harus memiliki baris header dan minimal 1 baris data");
                    return;
                }

                // Parse header line to find column indices
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                
                // Map common column names to keys
                const getIndex = (aliases: string[]) => {
                    return headers.findIndex(h => aliases.some(alias => h.includes(alias)));
                };

                const waIdx = getIndex(['wanumber', 'wa', 'phone', 'telepon', 'whatsapp', 'number']);
                const nameIdx = getIndex(['nama', 'name', 'lengkap']);
                const divIdx = getIndex(['divisi', 'division', 'dept', 'departemen']);
                const jabIdx = getIndex(['jabatan', 'role', 'position', 'title']);
                const roleIdx = getIndex(['role', 'akses', 'hak']);
                const passIdx = getIndex(['pass', 'password', 'sandi']);
                const officeIdx = getIndex(['office', 'kantor', 'lokasi', 'assignedofficeid']);

                if (waIdx === -1 || nameIdx === -1) {
                    toast.error("Format CSV tidak dikenal. Harus memiliki minimal kolom 'waNumber' dan 'nama'.");
                    return;
                }

                let importCount = 0;
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    // Parse line split by comma
                    const cols = line.split(',').map(c => {
                        let val = c.trim();
                        if (val.startsWith('"') && val.endsWith('"')) {
                            val = val.substring(1, val.length - 1);
                        }
                        return val;
                    });

                    const waNumberRaw = cols[waIdx];
                    if (!waNumberRaw) continue;
                    const waNumber = waNumberRaw.replace(/\D/g, '');
                    const nama = cols[nameIdx];

                    if (!waNumber || !nama) continue;

                    const emp = {
                        waNumber,
                        nama,
                        divisi: divIdx !== -1 ? cols[divIdx] || '' : '',
                        jabatan: jabIdx !== -1 ? cols[jabIdx] || '' : '',
                        role: roleIdx !== -1 ? (cols[roleIdx]?.toLowerCase() === 'admin' ? 'admin' : 'karyawan') : 'karyawan',
                        password: passIdx !== -1 ? cols[passIdx] || '123456' : '123456',
                        assignedOfficeId: officeIdx !== -1 ? cols[officeIdx] || 'all' : 'all'
                    };

                    const userId = `wa-${waNumber}`;
                    await setDoc(doc(db, 'users', userId), emp, { merge: true });
                    importCount++;
                }

                toast.success(`Berhasil mengimpor ${importCount} data karyawan dari CSV`);
                e.target.value = '';
            } catch (error) {
                console.error("Gagal memproses file CSV:", error);
                toast.error("Gagal memproses file CSV. Pastikan format pemisah koma valid.");
            }
        };
        reader.readAsText(file);
    };

    useEffect(() => {
        const fetchOffices = async () => {
            try {
                const officeDocRef = doc(db, 'settings', 'office_location');
                const officeSnap = await getDoc(officeDocRef);
                if (officeSnap.exists()) {
                    const data = officeSnap.data();
                    let officesList: any[] = [];
                    if (data.offices && Array.isArray(data.offices)) {
                        officesList = data.offices;
                    } else if (data.latitude && data.longitude) {
                        officesList = [{
                            id: 'default',
                            name: data.name || 'Kantor Pusat',
                            latitude: Number(data.latitude),
                            longitude: Number(data.longitude),
                            radius: Number(data.radius || 100)
                        }];
                    }
                    setOffices(officesList);
                }
            } catch (error) {
                console.error("Gagal memuat pengaturan lokasi kantor:", error);
            }
        };
        fetchOffices();
    }, []);

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
            
            // Periksa jika nomor WA sudah digunakan oleh karyawan lain
            const duplicateUser = users.find(u => u.waNumber === cleanWaNumber && u.id !== editingId);
            if (duplicateUser) {
                toast.error(`Nomor WhatsApp ${cleanWaNumber} sudah terdaftar untuk karyawan lain (${duplicateUser.nama})!`);
                return;
            }

            const userId = editingId || `wa-${cleanWaNumber}`;
            
            const payload = { ...formData, waNumber: cleanWaNumber };
            if (!editingId && !payload.password) payload.password = '123456'; // Default password

            await setDoc(doc(db, 'users', userId), payload, { merge: true });
            toast.success('Berhasil menyimpan data karyawan');
            setShowForm(false);
            setEditingId(null);
            setFormData({ waNumber: '', nama: '', role: 'karyawan', divisi: '', jabatan: '', password: '', assignedOfficeId: 'all' });
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
        let officeId = user.assignedOfficeId || 'all';
        if (officeId === 'default_office') {
            officeId = 'default';
        }
        setFormData({
            waNumber: user.waNumber || '',
            nama: user.nama || '',
            role: user.role || 'karyawan',
            divisi: user.divisi || '',
            jabatan: user.jabatan || '',
            password: user.password || '',
            assignedOfficeId: officeId
        });
        setEditingId(user.id);
        setShowForm(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 font-sans">Manajemen Karyawan</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Kelola data profil, jabatan, divisi, dan hak akses karyawan.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button 
                        onClick={handleDownloadTemplate}
                        className="flex items-center space-x-2 px-3 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 active:scale-95 transition-all shadow-sm cursor-pointer"
                        title="Unduh contoh format CSV untuk pengisian data massal"
                    >
                        <Download size={14} />
                        <span>Unduh Template CSV</span>
                    </button>
                    <label 
                        className="flex items-center space-x-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 active:scale-95 transition-all shadow-sm shadow-emerald-500/15 cursor-pointer"
                        title="Unggah berkas CSV untuk mengimpor data karyawan"
                    >
                        <Upload size={14} />
                        <span>Impor CSV</span>
                        <input 
                            type="file" 
                            accept=".csv" 
                            onChange={handleCSVUpload} 
                            className="hidden" 
                        />
                    </label>
                    <label 
                        className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg text-xs font-semibold hover:from-violet-700 hover:to-indigo-700 active:scale-95 transition-all shadow-sm shadow-violet-500/20 cursor-pointer"
                        title="Unggah foto atau screenshot daftar karyawan untuk diimpor otomatis oleh AI"
                    >
                        <Sparkles size={14} className={isExtracting ? "animate-spin" : ""} />
                        <span>{isExtracting ? "Memproses AI..." : "Impor via Foto (AI)"}</span>
                        <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleAIPhotoUpload} 
                            disabled={isExtracting}
                            className="hidden" 
                        />
                    </label>
                    <button 
                        onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ waNumber: '', nama: '', role: 'karyawan', divisi: '', jabatan: '', password: '', assignedOfficeId: 'all' }); }}
                        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-500/15 cursor-pointer"
                    >
                        <Plus size={16} />
                        <span>Tambah Karyawan</span>
                    </button>
                </div>
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
                            <input required type="text" value={formData.waNumber} onChange={e => setFormData({...formData, waNumber: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
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
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Lokasi Kantor Absensi</label>
                            <select 
                                value={formData.assignedOfficeId || 'all'} 
                                onChange={e => setFormData({...formData, assignedOfficeId: e.target.value})} 
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                                <option value="all">Semua Lokasi (Bebas Cabang)</option>
                                {offices.map(office => (
                                    <option key={office.id} value={office.id}>{office.name}</option>
                                ))}
                            </select>
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
                                <th className="p-4 text-sm font-medium text-slate-500">Lokasi Kantor</th>
                                <th className="p-4 text-sm font-medium text-slate-500">Role</th>
                                <th className="p-4 text-sm font-medium text-slate-500 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} className="p-4 text-center text-slate-500">Loading...</td></tr>
                            ) : users.length === 0 ? (
                                <tr><td colSpan={7} className="p-4 text-center text-slate-500">Tidak ada data karyawan.</td></tr>
                            ) : (
                                users.map(user => {
                                    const assignedOffice = offices.find(o => o.id === user.assignedOfficeId || (o.id === 'default' && user.assignedOfficeId === 'default_office'));
                                    const officeLabel = user.assignedOfficeId === 'all' || !user.assignedOfficeId 
                                        ? 'Semua Lokasi' 
                                        : (assignedOffice ? assignedOffice.name : 'Lokasi Khusus (Dihapus)');
                                    return (
                                        <tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                            <td className="p-4 text-sm font-medium text-slate-800">{user.nama}</td>
                                            <td className="p-4 text-sm text-slate-600">{user.waNumber}</td>
                                            <td className="p-4 text-sm text-slate-600">{user.divisi || '-'}</td>
                                            <td className="p-4 text-sm text-slate-600">{user.jabatan || '-'}</td>
                                            <td className="p-4 text-sm text-slate-600">
                                                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                                                    <Building size={12} className="text-slate-400 shrink-0" />
                                                    <span>{officeLabel}</span>
                                                </span>
                                            </td>
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
                                    );
                                })
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
