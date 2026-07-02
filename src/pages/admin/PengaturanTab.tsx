import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  addDoc, 
  limit, 
  orderBy, 
  onSnapshot, 
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { 
  Building, 
  Plus, 
  MapPin, 
  Compass, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  ExternalLink, 
  Globe, 
  Sparkles, 
  MessageSquare, 
  Send, 
  Bell, 
  History, 
  CheckCircle, 
  RefreshCw, 
  AlertCircle, 
  Clock, 
  Info,
  Smartphone,
  CheckCircle2,
  Sliders,
  Play
} from 'lucide-react';

interface OfficeLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
}

interface WASettings {
  enabled: boolean;
  apiMode: 'simulated' | 'fonnte';
  apiToken: string;
  morningHours: number[];
  eveningHours: number[];
  morningTemplate: string;
  eveningTemplate: string;
}

interface WALog {
  id: string;
  waNumber: string;
  nama: string;
  message: string;
  type: string;
  triggerTime: string;
  status: string;
  timestamp: string;
}

export default function PengaturanTab() {
  const [activeTab, setActiveTab] = useState<'office' | 'wa'>('office');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [offices, setOffices] = useState<OfficeLocation[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  
  // Office Location Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOfficeId, setEditingOfficeId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formLat, setFormLat] = useState<number | ''>('');
  const [formLng, setFormLng] = useState<number | ''>('');
  const [formRadius, setFormRadius] = useState<number>(100);

  // WhatsApp Reminder Settings State
  const [waSettings, setWaSettings] = useState<WASettings>({
    enabled: true,
    apiMode: 'simulated',
    apiToken: '',
    morningHours: [5, 6, 7, 8, 9],
    eveningHours: [17, 18, 19, 20, 21, 22],
    morningTemplate: 'Halo *{nama}*, jangan lupa untuk melakukan presensi MASUK hari ini pada jam {jam} WITA melalui aplikasi US BILIBILI HADIR 162. Tetap semangat kerja! 💪',
    eveningTemplate: 'Halo *{nama}*, jangan lupa untuk melakukan presensi PULANG hari ini pada jam {jam} WITA melalui aplikasi US BILIBILI HADIR 162. Selamat istirahat dan hati-hati di jalan! 🏠🚗'
  });

  // WhatsApp Manual Sender State
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [sendingManual, setSendingManual] = useState(false);

  // WhatsApp Logs State
  const [waLogs, setWaLogs] = useState<WALog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);

  // Load All Settings
  useEffect(() => {
    const fetchOfficeSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'office_location');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          let officesList: OfficeLocation[] = [];
          
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
        console.error('Error fetching office settings:', error);
      }
    };

    const fetchWASettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'wa_reminder_settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as WASettings;
          setWaSettings(prev => ({
            ...prev,
            ...data,
            morningHours: data.morningHours || [5, 6, 7, 8, 9],
            eveningHours: data.eveningHours || [17, 18, 19, 20, 21, 22],
          }));
        }
      } catch (error) {
        console.error('Error fetching WA settings:', error);
      }
    };

    const fetchAllData = async () => {
      setLoading(true);
      await Promise.all([fetchOfficeSettings(), fetchWASettings()]);
      setLoading(false);
    };

    fetchAllData();
  }, []);

  // Subscribe to Employees list for Manual WA
  useEffect(() => {
    if (activeTab === 'wa') {
      const q = query(collection(db, 'users'), where('role', '==', 'karyawan'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setEmployees(list);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  // Subscribe to WhatsApp Logs
  useEffect(() => {
    if (activeTab === 'wa') {
      setLogsLoading(true);
      const q = query(collection(db, 'wa_logs'), orderBy('timestamp', 'desc'), limit(50));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logs: WALog[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          logs.push({
            id: docSnap.id,
            waNumber: d.waNumber || '',
            nama: d.nama || '',
            message: d.message || '',
            type: d.type || 'manual',
            triggerTime: d.triggerTime || '-',
            status: d.status || 'Sukses',
            timestamp: d.timestamp || ''
          });
        });
        setWaLogs(logs);
        setLogsLoading(false);
      }, (err) => {
        console.error('Error loading WA logs:', err);
        setLogsLoading(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  // AI Extract Location
  const handleAIOfficeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    const toastId = toast.loading('AI sedang memindai gambar & mengekstrak koordinat lokasi...');

    try {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      });

      const response = await fetch('/api/extract-office', {
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
        throw new Error('AI tidak berhasil mengekstrak data lokasi dari dokumen/screenshot ini.');
      }

      const extracted = resData.data;

      setFormName(extracted.name || 'Cabang Baru');
      setFormLat(extracted.latitude);
      setFormLng(extracted.longitude);
      setFormRadius(extracted.radius || 100);
      setEditingOfficeId(null);
      setIsFormOpen(true);

      toast.success(`AI Berhasil! Menemukan lokasi "${extracted.name}" dengan koordinat (${extracted.latitude}, ${extracted.longitude}).`, { id: toastId });

    } catch (error: any) {
      console.error("Gagal melakukan ekstraksi koordinat via AI:", error);
      toast.error(error.message || 'Gagal memproses gambar menggunakan AI', { id: toastId });
    } finally {
      setIsExtracting(false);
      e.target.value = '';
    }
  };

  const saveOfficeToFirestore = async (updatedOffices: OfficeLocation[]) => {
    setSaving(true);
    try {
      const docRef = doc(db, 'settings', 'office_location');
      const firstOffice = updatedOffices[0] || {
        name: 'Kantor Pusat',
        latitude: -6.200000,
        longitude: 106.816666,
        radius: 100
      };

      await setDoc(docRef, {
        offices: updatedOffices,
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

  const handleDeleteOffice = async (id: string) => {
    if (offices.length <= 1) {
      toast.error('Harus ada minimal satu lokasi kantor yang aktif.');
      return;
    }

    if (window.confirm('Apakah Anda yakin ingin menghapus lokasi kantor ini?')) {
      const filtered = offices.filter(o => o.id !== id);
      await saveOfficeToFirestore(filtered);
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
      const newOffice: OfficeLocation = {
        id: 'office_' + Date.now(),
        name: formName,
        latitude: Number(formLat),
        longitude: Number(formLng),
        radius: Number(formRadius)
      };
      updatedList = [...offices, newOffice];
    }

    await saveOfficeToFirestore(updatedList);
    setIsFormOpen(false);
  };

  // WhatsApp Settings Save Handler
  const handleSaveWASettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const docRef = doc(db, 'settings', 'wa_reminder_settings');
      await setDoc(docRef, waSettings);
      toast.success('Pengaturan Pengingat WhatsApp berhasil diperbarui');
    } catch (error) {
      console.error('Error saving WA settings:', error);
      toast.error('Gagal menyimpan pengaturan WhatsApp');
    } finally {
      setSaving(false);
    }
  };

  // Core WhatsApp Sender function
  const sendWhatsAppMessage = async (waNumber: string, message: string, settings: WASettings) => {
    try {
      const response = await fetch('/api/send-wa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          waNumber,
          message,
          apiMode: settings.apiMode,
          apiToken: settings.apiToken
        })
      });
      const data = await response.json();
      return data.status || 'Gagal';
    } catch (e: any) {
      console.error('Fonnte send error:', e);
      return `Gagal (Koneksi: ${e.message || 'Error'})`;
    }
  };

  // Manual WhatsApp Send Handler
  const handleSendManualWA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId || !manualMessage.trim()) {
      toast.error('Silakan pilih karyawan dan isi pesan WhatsApp');
      return;
    }

    const emp = employees.find(e => e.id === selectedEmployeeId);
    if (!emp) {
      toast.error('Karyawan tidak valid');
      return;
    }

    setSendingManual(true);
    const toastId = toast.loading(`Mengirim WhatsApp manual ke ${emp.nama}...`);

    try {
      const cleanWa = emp.waNumber.replace(/\D/g, '');
      const status = await sendWhatsAppMessage(cleanWa, manualMessage, waSettings);

      // Save to logs
      await addDoc(collection(db, 'wa_logs'), {
        waNumber: cleanWa,
        nama: emp.nama,
        message: manualMessage,
        type: 'manual',
        triggerTime: 'Manual',
        status: status,
        timestamp: new Date().toISOString()
      });

      if (status === 'Sukses' || status === 'Sukses (Simulasi)') {
        setManualMessage('');
        setSelectedEmployeeId('');
        toast.success(`WhatsApp berhasil dikirim ke ${emp.nama}!`, { id: toastId });
      } else {
        toast.error(`Fonnte gagal mengirim: ${status}`, { id: toastId });
      }
    } catch (error: any) {
      console.error('Error sending manual WA:', error);
      toast.error(`Gagal mengirim WhatsApp: ${error.message || error}`, { id: toastId });
    } finally {
      setSendingManual(false);
    }
  };

  // Manual Template Filler for Manual Sender
  const handleUseTemplate = (type: 'morning' | 'evening') => {
    if (!selectedEmployeeId) {
      toast.error('Pilih karyawan terlebih dahulu agar nama terisi otomatis');
      return;
    }
    const emp = employees.find(e => e.id === selectedEmployeeId);
    if (!emp) return;

    const template = type === 'morning' ? waSettings.morningTemplate : waSettings.eveningTemplate;
    const timeStr = type === 'morning' ? '07:00' : '17:00';
    const filled = template
      .replace(/{nama}/g, emp.nama)
      .replace(/{jam}/g, timeStr)
      .replace(/{jenis}/g, type === 'morning' ? 'MASUK' : 'PULANG');

    setManualMessage(filled);
  };

  // Auto/Scheduled Reminder Simulator Trigger
  const triggerReminderSimulation = async (type: 'morning' | 'evening', selectedHour: number) => {
    if (employees.length === 0) {
      // Lazy load employees if not already loaded
      const q = query(collection(db, 'users'), where('role', '==', 'karyawan'));
      const snapshot = await getDocs(q);
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      if (list.length === 0) {
        toast.error('Tidak ada karyawan terdaftar dalam sistem.');
        return;
      }
    }

    setIsSimulating(true);
    const displayHour = `${selectedHour.toString().padStart(2, '0')}:00`;
    const toastId = toast.loading(`Menjalankan simulasi pengingat WA harian (${displayHour})...`);

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      
      // 1. Fetch Today's Attendance
      const attSnap = await getDocs(query(collection(db, 'attendance'), where('tanggal', '==', todayStr)));
      const attMap: Record<string, any> = {};
      attSnap.forEach(docSnap => {
        const d = docSnap.data();
        attMap[d.user_id] = d;
      });

      // 2. Fetch Active Leave Requests for Today
      const leaveSnap = await getDocs(query(collection(db, 'leave_requests'), where('tanggal_mulai', '<=', todayStr)));
      const onLeaveSet = new Set<string>();
      leaveSnap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.status === 'approved' && d.tanggal_akhir >= todayStr) {
          onLeaveSet.add(d.user_id);
        }
      });

      const activeEmployees = employees.length > 0 ? employees : await (async () => {
        const q = query(collection(db, 'users'), where('role', '==', 'karyawan'));
        const snap = await getDocs(q);
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        return list;
      })();

      let countDispatched = 0;
      const batchPromises = [];

      for (const emp of activeEmployees) {
        // Skip employees who are approved for Izin/Sakit/Cuti
        if (onLeaveSet.has(emp.id)) continue;

        const att = attMap[emp.id];
        let shouldRemind = false;
        let template = '';

        if (type === 'morning') {
          // Check-in check: employee hasn't clocked in
          if (!att || !att.jam_masuk) {
            shouldRemind = true;
            template = waSettings.morningTemplate;
          }
        } else {
          // Check-out check: employee clocked in but hasn't clocked out yet
          if (att && att.jam_masuk && !att.jam_pulang) {
            shouldRemind = true;
            template = waSettings.eveningTemplate;
          }
        }

        if (shouldRemind) {
          const cleanWa = emp.waNumber.replace(/\D/g, '');
          const formattedMsg = template
            .replace(/{nama}/g, emp.nama)
            .replace(/{jam}/g, displayHour)
            .replace(/{jenis}/g, type === 'morning' ? 'MASUK' : 'PULANG');

          // Dispatch message (Simulated or Fonnte API)
          const status = await sendWhatsAppMessage(cleanWa, formattedMsg, waSettings);

          // Append log to firestore
          batchPromises.push(
            addDoc(collection(db, 'wa_logs'), {
              waNumber: cleanWa,
              nama: emp.nama,
              message: formattedMsg,
              type: type === 'morning' ? 'auto_pagi' : 'auto_sore',
              triggerTime: displayHour,
              status: status,
              timestamp: new Date().toISOString()
            })
          );
          countDispatched++;
        }
      }

      if (batchPromises.length > 0) {
        await Promise.all(batchPromises);
      }

      toast.success(
        `Sukses! Memindai ${activeEmployees.length} karyawan. Mengirim ${countDispatched} WhatsApp Pengingat (${type === 'morning' ? 'Masuk Pagi' : 'Pulang Sore'}) untuk jam ${displayHour}.`,
        { id: toastId, duration: 5000 }
      );
    } catch (err: any) {
      console.error('Simulation error:', err);
      toast.error(`Gagal menjalankan simulasi: ${err.message || err}`, { id: toastId });
    } finally {
      setIsSimulating(false);
    }
  };

  // Clear All WA Logs
  const handleClearLogs = async () => {
    if (!confirmClearLogs) {
      setConfirmClearLogs(true);
      toast('Klik tombol "Kosongkan Log" sekali lagi untuk mengonfirmasi penghapusan seluruh log.', { 
        icon: '⚠️',
        duration: 4000
      });
      setTimeout(() => {
        setConfirmClearLogs(false);
      }, 5000);
      return;
    }

    setConfirmClearLogs(false);
    const toastId = toast.loading('Menghapus seluruh log WhatsApp...');
    try {
      let totalDeleted = 0;
      let hasMore = true;
      while (hasMore) {
        const q = query(collection(db, 'wa_logs'), limit(200));
        const snap = await getDocs(q);
        if (snap.empty) {
          hasMore = false;
          break;
        }

        const batchPromises: any[] = [];
        snap.forEach((docSnap) => {
          batchPromises.push(deleteDoc(doc(db, 'wa_logs', docSnap.id)));
        });
        await Promise.all(batchPromises);
        totalDeleted += snap.size;

        if (snap.size < 200 || totalDeleted >= 1000) {
          hasMore = false;
        }
      }
      toast.success('Seluruh log berhasil dikosongkan!', { id: toastId });
    } catch (err: any) {
      console.error('Error clearing logs:', err);
      toast.error(`Gagal menghapus log: ${err.message}`, { id: toastId });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500 flex items-center gap-2">
          <Compass className="animate-spin text-blue-600" size={20} />
          <span>Memuat data pengaturan...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Modern High-End Tab Switcher */}
      <div className="flex border-b border-slate-200 gap-1 bg-white p-1 rounded-2xl border">
        <button
          onClick={() => setActiveTab('office')}
          className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-bold tracking-wide transition-all ${
            activeTab === 'office'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Building size={14} />
          <span>Lokasi Kantor</span>
        </button>
        <button
          onClick={() => setActiveTab('wa')}
          className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-bold tracking-wide transition-all relative ${
            activeTab === 'wa'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/10'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <MessageSquare size={14} />
          <span>Pengingat WhatsApp (Otomatis & Manual)</span>
          <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </button>
      </div>

      {/* ======================= OFFICE TAB CONTENT ======================= */}
      {activeTab === 'office' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-800">Daftar Lokasi Kantor</h3>
              <p className="text-xs text-slate-500 mt-1">Kelola beberapa cabang atau titik koordinat kantor yang diizinkan untuk absensi.</p>
            </div>
            
            {!isFormOpen && (
              <div className="flex flex-wrap items-center gap-2">
                <label 
                  className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer"
                  title="Unggah screenshot Google Maps atau teks alamat untuk diekstrak koordinat GPS-nya otomatis oleh AI"
                >
                  <Sparkles size={13} className={isExtracting ? "animate-spin" : ""} />
                  <span>{isExtracting ? "Memproses AI..." : "Impor Koordinat (AI)"}</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleAIOfficeUpload} 
                    disabled={isExtracting}
                    className="hidden" 
                  />
                </label>
                <button
                  onClick={handleOpenAdd}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition shadow-sm cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Tambah Lokasi Baru</span>
                </button>
              </div>
            )}
          </div>

          {/* Office Location Form Card */}
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
                        onClick={() => handleDeleteOffice(office.id)}
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
      )}

      {/* ======================= WHATSAPP TAB CONTENT ======================= */}
      {activeTab === 'wa' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header Description */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1">
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare className="text-emerald-500" size={18} />
                <span>Modul WhatsApp Gateway & Pengingat Otomatis</span>
              </h4>
              <p className="text-xs text-slate-400">
                Kirim pesan pengingat absen otomatis ke nomor WhatsApp karyawan agar presensi masuk & pulang terisi tepat waktu setiap hari.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-bold border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span>Mesin Reminder Aktif</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Column 1 & 2: Main Settings & Templates */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Settings Configuration Form */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                  <Sliders size={16} className="text-blue-500" />
                  <span>Konfigurasi WhatsApp</span>
                </h4>

                <form onSubmit={handleSaveWASettings} className="space-y-5">
                  <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Status Pengingat Otomatis</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">Aktifkan atau matikan semua mesin scheduler WhatsApp harian.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWaSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
                      className={`w-12 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                        waSettings.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`absolute top-0.5 bg-white w-5 h-5 rounded-full shadow-md transition-transform duration-200 ${
                        waSettings.enabled ? 'left-[25px]' : 'left-[3px]'
                      }`}></span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Metode Pengiriman</label>
                      <select
                        value={waSettings.apiMode}
                        onChange={e => setWaSettings(prev => ({ ...prev, apiMode: e.target.value as any }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs font-bold"
                      >
                        <option value="simulated">Simulated Mode (Simulasi Log database saja)</option>
                        <option value="fonnte">Fonnte API Gateway (Pengiriman WA Riil)</option>
                      </select>
                    </div>

                    {waSettings.apiMode === 'fonnte' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Fonnte API Token</label>
                        <input
                          type="text"
                          placeholder="Masukkan token Fonnte Anda"
                          value={waSettings.apiToken}
                          onChange={e => setWaSettings(prev => ({ ...prev, apiToken: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {/* Mandatory WhatsApp Schedule Indicator Card */}
                  <div className="bg-gradient-to-br from-indigo-50/70 to-blue-50/50 p-4 rounded-xl border border-blue-100/60 text-xs">
                    <h5 className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock size={14} className="text-blue-600" />
                      <span>Jadwal Pengingat Terjadwal (Senin - Minggu)</span>
                    </h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">Karyawan yang belum absen akan otomatis diingatkan pada jam-jam berikut:</p>
                    
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/50">
                        <span className="text-[10px] uppercase font-bold text-indigo-600 block mb-1">Presensi Masuk (Pagi)</span>
                        <div className="flex flex-wrap gap-1">
                          {[5, 6, 7, 8, 9].map(h => (
                            <span key={h} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-mono font-extrabold text-[10px] border border-indigo-100">
                              {h.toString().padStart(2, '0')}:00
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/50">
                        <span className="text-[10px] uppercase font-bold text-teal-600 block mb-1">Presensi Pulang (Sore)</span>
                        <div className="flex flex-wrap gap-1">
                          {[17, 18, 19, 20, 21, 22].map(h => (
                            <span key={h} className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full font-mono font-extrabold text-[10px] border border-teal-100">
                              {h}:00
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Message Templates */}
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Template Pengingat Pagi (Masuk)</span>
                        <span className="text-[10px] font-mono text-slate-400 font-normal lowercase">Placeholder: &#123;nama&#125;, &#123;jam&#125;</span>
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={waSettings.morningTemplate}
                        onChange={e => setWaSettings(prev => ({ ...prev, morningTemplate: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs font-medium leading-relaxed"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Template Pengingat Sore (Pulang)</span>
                        <span className="text-[10px] font-mono text-slate-400 font-normal lowercase">Placeholder: &#123;nama&#125;, &#123;jam&#125;</span>
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={waSettings.eveningTemplate}
                        onChange={e => setWaSettings(prev => ({ ...prev, eveningTemplate: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs font-medium leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end border-t border-slate-100 pt-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-500/15"
                    >
                      <Check size={14} />
                      <span>{saving ? 'Menyimpan...' : 'Simpan Konfigurasi WA'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Automatic Trigger Simulator Control */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
                
                <h4 className="text-sm font-extrabold flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                  <Play size={14} className="text-sky-400" />
                  <span>Simulator Trigger Otomatis</span>
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-5">
                  Gunakan tombol di bawah ini untuk mensimulasikan kejadian pemicu (event-trigger) secara instan. Sistem akan menyaring semua karyawan yang belum absensi hari ini, merancang pesan personal, dan memasukkannya ke database log!
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-sky-400 block mb-1">Simulasi Sesi Pagi</span>
                      <p className="text-[10px] text-slate-400">Trigger pengingat presensi MASUK untuk karyawan yang belum clock-in hari ini.</p>
                    </div>
                    
                    <div className="flex items-center gap-1.5 mt-4">
                      {[7, 8].map(h => (
                        <button
                          key={h}
                          disabled={isSimulating}
                          onClick={() => triggerReminderSimulation('morning', h)}
                          className="flex-1 px-2 py-1.5 bg-slate-800 hover:bg-blue-600/90 hover:text-white rounded-lg text-[10px] font-bold transition-all border border-slate-700/60 cursor-pointer text-slate-300"
                        >
                          {h.toString().padStart(2, '0')}:00 WITA
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-emerald-400 block mb-1">Simulasi Sesi Sore</span>
                      <p className="text-[10px] text-slate-400">Trigger pengingat presensi PULANG untuk karyawan yang sudah clock-in tapi belum clock-out.</p>
                    </div>

                    <div className="flex items-center gap-1.5 mt-4">
                      {[17, 18].map(h => (
                        <button
                          key={h}
                          disabled={isSimulating}
                          onClick={() => triggerReminderSimulation('evening', h)}
                          className="flex-1 px-2 py-1.5 bg-slate-800 hover:bg-emerald-600/90 hover:text-white rounded-lg text-[10px] font-bold transition-all border border-slate-700/60 cursor-pointer text-slate-300"
                        >
                          {h}:00 WITA
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Column 3: Manual Sender & Manual Logs Overview */}
            <div className="space-y-6">
              
              {/* WhatsApp Manual Sender */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                    <Send size={15} className="text-emerald-500" />
                    <span>Kirim WA Manual</span>
                  </h4>

                  <form onSubmit={handleSendManualWA} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pilih Karyawan</label>
                      <select
                        required
                        value={selectedEmployeeId}
                        onChange={e => setSelectedEmployeeId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs"
                      >
                        <option value="">-- Pilih Penerima --</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.nama} ({emp.waNumber})</option>
                        ))}
                      </select>
                    </div>

                    {selectedEmployeeId && (
                      <div className="flex gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleUseTemplate('morning')}
                          className="flex-1 py-1 px-2 bg-white hover:bg-slate-100 rounded text-[9px] font-bold border border-slate-200 transition text-slate-600 cursor-pointer"
                        >
                          Template Pagi
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUseTemplate('evening')}
                          className="flex-1 py-1 px-2 bg-white hover:bg-slate-100 rounded text-[9px] font-bold border border-slate-200 transition text-slate-600 cursor-pointer"
                        >
                          Template Sore
                        </button>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pesan WhatsApp</label>
                      <textarea
                        rows={5}
                        required
                        placeholder="Ketik isi pesan WhatsApp di sini..."
                        value={manualMessage}
                        onChange={e => setManualMessage(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={sendingManual}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Send size={12} />
                      <span>{sendingManual ? 'Mengirim...' : 'Kirim Sekarang'}</span>
                    </button>
                  </form>
                </div>
              </div>

              {/* Variable Helper Card */}
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-2.5">
                <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-[11px] text-amber-800 leading-normal">
                  <span className="font-bold">Panduan Variabel Pesan:</span>
                  <p>Anda dapat memasukkan tag berikut agar pesan terisi otomatis:</p>
                  <ul className="list-disc pl-4 space-y-0.5 mt-1 font-mono text-[10px]">
                    <li><code className="bg-amber-100 px-1 py-0.2 rounded font-bold">&#123;nama&#125;</code>: Nama karyawan</li>
                    <li><code className="bg-amber-100 px-1 py-0.2 rounded font-bold">&#123;jam&#125;</code>: Jam reminder (misal: 07:00)</li>
                  </ul>
                </div>
              </div>

            </div>
          </div>

          {/* WhatsApp Reminder Delivery Logs List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <History className="text-slate-500" size={16} />
                <h4 className="font-bold text-slate-800 text-sm">Rekap Log Pengiriman WhatsApp (50 Terakhir)</h4>
              </div>
              
              {waLogs.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded border transition flex items-center gap-1 cursor-pointer ${
                    confirmClearLogs 
                      ? 'text-white bg-rose-600 hover:bg-rose-700 border-rose-600 animate-pulse' 
                      : 'text-rose-600 bg-rose-50 hover:bg-rose-100 border-rose-100'
                  }`}
                >
                  <Trash2 size={11} />
                  <span>{confirmClearLogs ? 'Klik Sekali Lagi untuk Menghapus' : 'Kosongkan Log'}</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              {logsLoading ? (
                <div className="p-8 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-slate-500">Memuat log pengiriman...</span>
                  </div>
                </div>
              ) : waLogs.length === 0 ? (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center space-y-2">
                  <MessageSquare className="text-slate-300" size={32} />
                  <p className="font-bold text-slate-700 text-xs">Belum ada rekap log WhatsApp</p>
                  <p className="text-[10px] text-slate-400 max-w-xs leading-normal">Pesan pengingat otomatis atau manual yang terkirim akan terdata rapi pada bagian ini.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="p-4">Waktu</th>
                      <th className="p-4">Karyawan</th>
                      <th className="p-4">Jenis Trigger</th>
                      <th className="p-4">Pesan</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {waLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition">
                        <td className="p-4 text-slate-400 font-mono whitespace-nowrap text-[10px]">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          }) : '-'}
                        </td>
                        <td className="p-4">
                          <span className="font-bold text-slate-800 block leading-tight">{log.nama}</span>
                          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{log.waNumber}</span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            log.type === 'auto_pagi' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                            log.type === 'auto_sore' ? 'bg-teal-50 text-teal-700 border border-teal-100' :
                            'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {log.type === 'auto_pagi' ? 'Auto Pagi' :
                             log.type === 'auto_sore' ? 'Auto Sore' :
                             'Manual'} ({log.triggerTime})
                          </span>
                        </td>
                        <td className="p-4 max-w-xs text-[11px] text-slate-600 leading-normal truncate" title={log.message}>
                          {log.message}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[9px] border ${
                            log.status.includes('Sukses') || log.status.includes('Terkirim')
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : 'bg-rose-50 text-rose-700 border-rose-100'
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${
                              log.status.includes('Sukses') || log.status.includes('Terkirim') ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}></span>
                            <span>{log.status}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
