import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';

export default function PengaturanTab() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        latitude: -6.200000,
        longitude: 106.816666,
        radius: 100
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, 'settings', 'office_location');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setFormData(docSnap.data() as any);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'office_location'), {
                latitude: Number(formData.latitude),
                longitude: Number(formData.longitude),
                radius: Number(formData.radius)
            });
            toast.success('Pengaturan kantor berhasil disimpan');
        } catch (error) {
            console.error(error);
            toast.error('Gagal menyimpan pengaturan');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Loading pengaturan...</div>;

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-bold text-slate-800">Pengaturan Kantor</h3>
            
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-w-2xl">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Latitude</label>
                            <input 
                                type="number" 
                                step="any"
                                required 
                                value={formData.latitude} 
                                onChange={e => setFormData({...formData, latitude: Number(e.target.value)})} 
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Longitude</label>
                            <input 
                                type="number" 
                                step="any"
                                required 
                                value={formData.longitude} 
                                onChange={e => setFormData({...formData, longitude: Number(e.target.value)})} 
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Radius Absensi (Meter)</label>
                        <input 
                            type="number" 
                            required 
                            min={1}
                            value={formData.radius} 
                            onChange={e => setFormData({...formData, radius: Number(e.target.value)})} 
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                        />
                        <p className="text-xs text-slate-500 mt-1">Jarak maksimal karyawan bisa melakukan absensi dari titik koordinat kantor.</p>
                    </div>

                    <div className="pt-4">
                        <button 
                            type="submit" 
                            disabled={saving}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                        </button>
                    </div>
                </form>

                <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">Cara Mendapatkan Titik Koordinat:</h4>
                    <ol className="list-decimal pl-5 text-sm text-blue-700 space-y-1">
                        <li>Buka Google Maps di browser Anda.</li>
                        <li>Cari dan klik kanan pada lokasi kantor Anda.</li>
                        <li>Klik angka koordinat yang muncul (misal: -6.200000, 106.816666) untuk menyalinnya.</li>
                        <li>Paste angka pertama di kolom Latitude dan angka kedua di kolom Longitude.</li>
                    </ol>
                </div>
            </div>
        </div>
    );
}
