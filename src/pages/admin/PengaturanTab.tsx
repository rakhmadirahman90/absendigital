import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { Building, Plus, MapPin, Compass, Trash2, Edit3, Check, X, ExternalLink, Globe } from 'lucide-react';

interface OfficeLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
}

export default function PengaturanTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [offices, setOffices] = useState<OfficeLocation[]>([]);
  
  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOfficeId, setEditingOfficeId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formLat, setFormLat] = useState<number | ''>('');
  const [formLng, setFormLng] = useState<number | ''>('');
  const [formRadius, setFormRadius] = useState<number>(100);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'office_location');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          let officesList: OfficeLocation[] = [];
          
          if (data.offices && Array.isArray(data.offices)) {
            officesList = data.offices;
          } else if (data.latitude && data.longitude) {
            // Migrasi dari data lama
            officesList = [{
              id: 'default_office',
              name: data.name || 'Kantor Pusat',
              latitude: Number(data.latitude),
              longitude: Number(data.longitude),
              radius: Number(data.radius || 100)
            }];
          }
          setOffices(officesList);
        }
      } catch (error) {
        console.error('Error fetching office settings:', error);
        toast.error('Gagal mengambil data pengaturan kantor');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const saveToFirestore = async (updatedOffices: OfficeLocation[]) => {
    setSaving(true);
    try {
      const docRef = doc(db, 'settings', 'office_location');
      
      // Ambil kantor pertama sebagai acuan backward compatibility
      const firstOffice = updatedOffices[0] || {
        name: 'Kantor Pusat',
        latitude: -6.200000,
        longitude: 106.816666,
        radius: 100
      };

      await setDoc(docRef, {
        offices: updatedOffices,
        // Backward-compatibility properties
        name: firstOffice.name,
        latitude: Number(firstOffice.latitude),
        longitude: Number(firstOffice.longitude),
        radius: Number(firstOffice.radius)
      });
      
      setOffices(updatedOffices);
      toast.success('Pengaturan lokasi kantor berhasil disimpan');
    } catch (error) {
      console.error('Error saving to Firestore:', error);
      toast.error('Gagal menyimpan ke database');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingOfficeId(null);
    setFormName('');
    setFormLat('');
    setFormLng('');
    setFormRadius(100);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (office: OfficeLocation) => {
    setEditingOfficeId(office.id);
    setFormName(office.name);
    setFormLat(office.latitude);
    setFormLng(office.longitude);
    setFormRadius(office.radius);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (offices.length <= 1) {
      toast.error('Harus ada minimal satu lokasi kantor yang aktif.');
      return;
    }

    if (window.confirm('Apakah Anda yakin ingin menghapus lokasi kantor ini?')) {
      const filtered = offices.filter(o => o.id !== id);
      await saveToFirestore(filtered);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || formLat === '' || formLng === '') {
      toast.error('Mohon lengkapi semua kolom formulir');
      return;
    }

    let updatedList: OfficeLocation[] = [];

    if (editingOfficeId) {
      // Edit mode
      updatedList = offices.map(office => {
        if (office.id === editingOfficeId) {
          return {
            id: office.id,
            name: formName,
            latitude: Number(formLat),
            longitude: Number(formLng),
            radius: Number(formRadius)
          };
        }
        return office;
      });
    } else {
      // Add mode
      const newOffice: OfficeLocation = {
        id: 'office_' + Date.now(),
        name: formName,
        latitude: Number(formLat),
        longitude: Number(formLng),
        radius: Number(formRadius)
      };
      updatedList = [...offices, newOffice];
    }

    await saveToFirestore(updatedList);
    setIsFormOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500 flex items-center gap-2">
          <Compass className="animate-spin text-blue-600" size={20} />
          <span>Memuat data lokasi kantor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Daftar Lokasi Kantor</h3>
          <p className="text-xs text-slate-500 mt-1">Kelola beberapa cabang atau titik koordinat kantor yang diizinkan untuk absensi.</p>
        </div>
        
        {!isFormOpen && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition shadow-sm"
          >
            <Plus size={14} />
            <span>Tambah Lokasi Baru</span>
          </button>
        )}
      </div>

      {/* Expandable Add/Edit Form Card */}
      {isFormOpen && (
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm max-w-2xl space-y-4 animate-in slide-in-from-top-3 duration-200">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <Building size={16} className="text-blue-600" />
              <span>{editingOfficeId ? 'Edit Lokasi Kantor' : 'Tambah Lokasi Kantor Baru'}</span>
            </h4>
            <button 
              onClick={() => setIsFormOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/50 transition"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Nama Lokasi / Kantor Cabang</label>
              <input 
                type="text" 
                required 
                placeholder="Contoh: Kantor Cabang Bandung"
                value={formName} 
                onChange={e => setFormName(e.target.value)} 
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm" 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Latitude</label>
                <input 
                  type="number" 
                  step="any"
                  required 
                  placeholder="Contoh: -6.917464"
                  value={formLat} 
                  onChange={e => setFormLat(e.target.value === '' ? '' : Number(e.target.value))} 
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-mono" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Longitude</label>
                <input 
                  type="number" 
                  step="any"
                  required 
                  placeholder="Contoh: 107.619122"
                  value={formLng} 
                  onChange={e => setFormLng(e.target.value === '' ? '' : Number(e.target.value))} 
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-mono" 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Radius Absensi (Meter)</label>
              <input 
                type="number" 
                required 
                min={1}
                value={formRadius} 
                onChange={e => setFormRadius(Number(e.target.value))} 
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm" 
              />
              <p className="text-[11px] text-slate-400 mt-1">Jarak radius maksimum (dalam meter) karyawan diizinkan untuk melakukan absen dari titik koordinat ini.</p>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-200/60 justify-end">
              <button 
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition"
              >
                Batal
              </button>
              <button 
                type="submit" 
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1"
              >
                {saving ? 'Menyimpan...' : (
                  <>
                    <Check size={14} />
                    <span>{editingOfficeId ? 'Simpan Perubahan' : 'Tambahkan Lokasi'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid of Office Locations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {offices.map((office, idx) => (
          <div key={office.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-slate-300 transition flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <Building size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{office.name}</h4>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Lokasi #{idx + 1}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(office)}
                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    title="Edit Lokasi"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(office.id)}
                    disabled={offices.length <= 1}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-30"
                    title="Hapus Lokasi"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono text-xs text-slate-600">
                <div className="flex items-center gap-1.5">
                  <MapPin size={12} className="text-slate-400 shrink-0" />
                  <span>Lat: {office.latitude.toFixed(6)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin size={12} className="text-slate-400 shrink-0" />
                  <span>Lng: {office.longitude.toFixed(6)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Compass size={12} className="text-slate-400 shrink-0" />
                  <span>Radius: {office.radius} meter</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${office.latitude},${office.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-semibold"
              >
                <Globe size={12} />
                <span>Lihat di Google Maps</span>
                <ExternalLink size={10} />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Guide Card */}
      <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3 max-w-2xl">
        <Compass size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-blue-700">
          <h4 className="font-bold">Cara Mendapatkan Koordinat Kantor yang Akurat:</h4>
          <ol className="list-decimal pl-4 space-y-1 mt-1 text-[11px] text-blue-600">
            <li>Buka Google Maps di web browser Anda.</li>
            <li>Cari lokasi fisik kantor, lalu klik kanan tepat pada titik bangunan tersebut.</li>
            <li>Klik angka koordinat yang tertera di menu klik-kanan untuk menyalinnya ke clipboard (Contoh: <code className="bg-blue-100 font-bold px-1 py-0.5 rounded">-6.175392, 106.827153</code>).</li>
            <li>Masukkan angka pertama ke bidang <strong>Latitude</strong> dan angka kedua ke bidang <strong>Longitude</strong> di atas.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
