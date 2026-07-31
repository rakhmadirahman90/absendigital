import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
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
  Play,
  Database,
  Cpu,
  Server,
  FileSpreadsheet,
  Table,
  CloudDownload,
  FileText
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
  apiMode: 'simulated' | 'fonnte' | 'wavio';
  apiToken: string;
  morningHours: number[];
  eveningHours: number[];
  morningTemplate: string;
  eveningTemplate: string;
  fonnteToken?: string;
  wavioToken?: string;
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

interface SheetsSettings {
  enabled: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  autoSync: boolean;
  lastSyncedAt?: string;
}

export default function PengaturanTab() {
  const [activeTab, setActiveTab] = useState<'office' | 'wa' | 'sheets'>('office');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [offices, setOffices] = useState<OfficeLocation[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  
  // Google Sheets Settings State
  const [sheetsSettings, setSheetsSettings] = useState<SheetsSettings>({
    enabled: true,
    spreadsheetId: '',
    spreadsheetUrl: '',
    autoSync: true,
  });
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [syncingSheet, setSyncingSheet] = useState(false);

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
    fonnteToken: '',
    wavioToken: '',
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
      } catch (error: any) {
        if (error?.message?.includes('Quota') || error?.code === 'resource-exhausted') {
          console.warn('[Office Settings] Firestore quota limit reached, using default office location.');
        } else {
          console.warn('Error fetching office settings:', error);
        }
        setOffices([{
          id: 'default',
          name: 'Kantor Pusat US BILIBILI 162',
          latitude: -5.147665,
          longitude: 119.432732,
          radius: 500
        }]);
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
            fonnteToken: data.fonnteToken || (data.apiMode === 'fonnte' ? data.apiToken : ''),
            wavioToken: data.wavioToken || (data.apiMode === 'wavio' ? data.apiToken : ''),
          }));
        }
      } catch (error: any) {
        console.warn('Could not fetch WA settings:', error?.message || error);
      }
    };

    const fetchSheetsSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'sheets_settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as SheetsSettings;
          setSheetsSettings(prev => ({
            ...prev,
            ...data,
          }));
        }
      } catch (error: any) {
        console.warn('Could not fetch Sheets settings:', error?.message || error);
      }
    };

    const fetchAllData = async () => {
      setLoading(true);
      await Promise.all([fetchOfficeSettings(), fetchWASettings(), fetchSheetsSettings()]);
      setLoading(false);
    };

    fetchAllData();
  }, []);

  // Google Sheets Action Handlers
  const handleCreateSpreadsheet = async () => {
    setCreatingSheet(true);
    const toastId = toast.loading('Membuat Google Spreadsheet Database baru di Google Drive...');
    try {
      const response = await fetch('/api/sheets/create-spreadsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Database US BILIBILI HADIR 162'
        })
      });
      const result = await response.json();
      if (result.success) {
        const newSettings: SheetsSettings = {
          enabled: true,
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.spreadsheetUrl,
          autoSync: true,
          lastSyncedAt: new Date().toISOString()
        };
        setSheetsSettings(newSettings);
        await setDoc(doc(db, 'settings', 'sheets_settings'), newSettings, { merge: true });
        toast.success(result.message || 'Spreadsheet Database berhasil dibuat!', { id: toastId });
        
        // Auto trigger initial data sync
        handleSyncAllData(result.spreadsheetId);
      } else {
        let errorMsg = result.error || 'Gagal membuat spreadsheet';
        if (errorMsg.includes('has not been used') || errorMsg.includes('disabled') || errorMsg.includes('sheets.googleapis.com')) {
          errorMsg = 'Google Sheets API belum diaktifkan di Google Cloud. Silakan aktifkan koneksi Google Workspace terlebih dahulu.';
        }
        throw new Error(errorMsg);
      }
    } catch (err: any) {
      console.error('Error creating spreadsheet:', err);
      toast.error(`${err.message || err}`, { id: toastId, duration: 6000 });
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleSyncAllData = async (targetSheetId?: string) => {
    const sid = targetSheetId || sheetsSettings.spreadsheetId;
    if (!sid) {
      toast.error('Silakan isi atau buat Spreadsheet ID terlebih dahulu.');
      return;
    }

    setSyncingSheet(true);
    const toastId = toast.loading('Mengambil data dari database & menyinkronkan ke Google Sheets...');
    try {
      // 1. Fetch Users
      const empList: any[] = [];
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        usersSnap.forEach(d => empList.push({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn('Could not fetch users for sheets sync:', e);
      }

      // 2. Fetch Attendance
      const attList: any[] = [];
      try {
        const attSnap = await getDocs(query(collection(db, 'attendance'), limit(2000)));
        attSnap.forEach(d => attList.push({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn('Could not fetch attendance for sheets sync:', e);
      }

      // 3. Fetch Submissions (Leave & Overtime)
      const subList: any[] = [];
      try {
        const leaveSnap = await getDocs(query(collection(db, 'leave_requests'), limit(1000)));
        leaveSnap.forEach(d => subList.push({ id: d.id, tipe: 'leave', ...d.data() }));
      } catch (e) {}
      try {
        const overSnap = await getDocs(query(collection(db, 'overtime'), limit(1000)));
        overSnap.forEach(d => subList.push({ id: d.id, tipe: 'overtime', ...d.data() }));
      } catch (e) {}

      // 4. Fetch Payrolls
      const payList: any[] = [];
      try {
        const paySnap = await getDocs(query(collection(db, 'payrolls'), limit(1000)));
        paySnap.forEach(d => payList.push({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn('Could not fetch payrolls for sheets sync:', e);
      }

      // 5. Fetch Settings
      const setList: any[] = [];
      try {
        const officeDoc = await getDoc(doc(db, 'settings', 'office_location'));
        if (officeDoc.exists()) setList.push({ id: 'office_location', category: 'Lokasi Kantor', ...officeDoc.data() });
        const waDoc = await getDoc(doc(db, 'settings', 'wa_settings'));
        if (waDoc.exists()) setList.push({ id: 'wa_settings', category: 'WhatsApp Gateway', ...waDoc.data() });
        const sheetsDoc = await getDoc(doc(db, 'settings', 'sheets_settings'));
        if (sheetsDoc.exists()) setList.push({ id: 'sheets_settings', category: 'Spreadsheet', ...sheetsDoc.data() });
        const payrollDoc = await getDoc(doc(db, 'settings', 'payroll_settings'));
        if (payrollDoc.exists()) setList.push({ id: 'payroll_settings', category: 'Pengaturan Gaji', ...payrollDoc.data() });
      } catch (e) {}

      // 6. Fetch Notifications
      const notifList: any[] = [];
      try {
        const notifSnap = await getDocs(query(collection(db, 'notifications'), limit(1000)));
        notifSnap.forEach(d => notifList.push({ id: d.id, ...d.data() }));
      } catch (e) {}

      // 7. Fetch WhatsApp Logs
      const waLogList: any[] = [];
      try {
        const waLogSnap = await getDocs(query(collection(db, 'wa_logs'), limit(500)));
        waLogSnap.forEach(d => waLogList.push({ id: d.id, ...d.data() }));
      } catch (e) {}

      // 8. Fetch Attendance Adjustments
      const adjList: any[] = [];
      try {
        const adjSnap = await getDocs(query(collection(db, 'attendance_adjustments'), limit(500)));
        adjSnap.forEach(d => adjList.push({ id: d.id, ...d.data() }));
      } catch (e) {}

      // Send complete payload to backend Google Sheets API
      const res = await fetch('/api/sheets/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: sid,
          employees: empList,
          attendance: attList,
          submissions: subList,
          payrolls: payList,
          settings: setList,
          notifications: notifList,
          waLogs: waLogList,
          adjustments: adjList
        })
      });

      const data = await res.json();
      if (data.success) {
        const nowStr = new Date().toISOString();
        const updated = {
          ...sheetsSettings,
          spreadsheetId: sid,
          spreadsheetUrl: sheetsSettings.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${sid}/edit`,
          lastSyncedAt: nowStr
        };
        setSheetsSettings(updated);
        await setDoc(doc(db, 'settings', 'sheets_settings'), updated, { merge: true });

        toast.success(data.message || 'Sinkronisasi Spreadsheet Berhasil!', { id: toastId });
      } else {
        throw new Error(data.error || 'Sinkronisasi gagal');
      }
    } catch (err: any) {
      console.error('Error syncing to sheets:', err);
      toast.error(`Gagal sinkronisasi: ${err.message || err}`, { id: toastId });
    } finally {
      setSyncingSheet(false);
    }
  };

  const handleSaveSheetsSettings = async () => {
    setSaving(true);
    try {
      const url = sheetsSettings.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${sheetsSettings.spreadsheetId}/edit` : '';
      const toSave = {
        ...sheetsSettings,
        spreadsheetUrl: url
      };
      await setDoc(doc(db, 'settings', 'sheets_settings'), toSave, { merge: true });
      setSheetsSettings(toSave);
      toast.success('Pengaturan Database Spreadsheet berhasil disimpan');
    } catch (err: any) {
      toast.error(`Gagal menyimpan: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

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
      }, (error) => {
        if (!error?.message?.includes('Quota') && (error as any)?.code !== 'resource-exhausted') {
          console.warn("[PengaturanTab] Employees sync notice:", error?.message || error);
        }
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
        if (!err?.message?.includes('Quota') && (err as any)?.code !== 'resource-exhausted') {
          console.warn('[PengaturanTab] WA logs sync notice:', err?.message || err);
        }
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
      const activeToken = waSettings.apiMode === 'fonnte' ? (waSettings.fonnteToken || '') : waSettings.apiMode === 'wavio' ? (waSettings.wavioToken || '') : '';
      const settingsToSave = {
        ...waSettings,
        apiToken: activeToken
      };
      await setDoc(docRef, settingsToSave);
      setWaSettings(settingsToSave);
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
        const brand = waSettings.apiMode === 'wavio' ? 'Wavio' : waSettings.apiMode === 'fonnte' ? 'Fonnte' : 'WhatsApp';
        toast.error(`${brand} gagal mengirim: ${status}`, { id: toastId });
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
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
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
          <span>Pengingat WhatsApp</span>
          <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </button>
        <button
          onClick={() => setActiveTab('sheets')}
          className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-bold tracking-wide transition-all relative ${
            activeTab === 'sheets'
              ? 'bg-gradient-to-r from-green-600 to-emerald-700 text-white shadow-md shadow-green-600/10'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet size={14} />
          <span>Database Spreadsheet (Google Sheets)</span>
          {sheetsSettings.spreadsheetId && (
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          )}
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

                  {/* API Gateway Directory & Configuration Manager */}
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">Daftar API Gateway & Kredensial</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Konfigurasikan masing-masing API Gateway di bawah ini. Token yang Anda simpan akan dipertahankan masing-masing secara terpisah, sehingga ketika Anda memilih gateway tertentu, data konfigurasi sebelumnya tetap tersimpan dan dapat langsung diterapkan.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {/* CARD 1: SIMULATED */}
                      <div className={`p-4 rounded-xl border transition-all duration-200 ${
                        waSettings.apiMode === 'simulated'
                          ? 'bg-blue-50/40 border-blue-200 ring-1 ring-blue-100'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg mt-0.5 ${
                              waSettings.apiMode === 'simulated' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                            }`}>
                              <Database size={16} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-700">Simulated Mode (Simulasi Lokal)</span>
                                {waSettings.apiMode === 'simulated' ? (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 font-extrabold text-[9px] rounded-full uppercase tracking-wider">Aktif</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-400 font-bold text-[9px] rounded-full uppercase tracking-wider">Mati</span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 block mt-1 leading-normal">
                                Mencatat simulasi pengiriman pesan ke database log saja tanpa melakukan panggilan API eksternal atau pengiriman pesan WA riil.
                              </span>
                            </div>
                          </div>
                          
                          {waSettings.apiMode !== 'simulated' && (
                            <button
                              type="button"
                              onClick={() => setWaSettings(prev => ({ ...prev, apiMode: 'simulated', apiToken: '' }))}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap self-end sm:self-center"
                            >
                              Terapkan Gateway
                            </button>
                          )}
                        </div>
                      </div>

                      {/* CARD 2: FONNTE */}
                      <div className={`p-4 rounded-xl border transition-all duration-200 ${
                        waSettings.apiMode === 'fonnte'
                          ? 'bg-emerald-50/40 border-emerald-200 ring-1 ring-emerald-100'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}>
                        <div className="flex flex-col gap-3.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg mt-0.5 ${
                                waSettings.apiMode === 'fonnte' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
                              }`}>
                                <Server size={16} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-700">Fonnte API Gateway</span>
                                  {waSettings.apiMode === 'fonnte' ? (
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-extrabold text-[9px] rounded-full uppercase tracking-wider">Aktif</span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-400 font-bold text-[9px] rounded-full uppercase tracking-wider">Mati</span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400 block mt-1 leading-normal">
                                  Layanan API Gateway Fonnte Indonesia untuk mengirim pesan WhatsApp riil. Memerlukan Token API yang valid.
                                </span>
                              </div>
                            </div>
                            
                            {waSettings.apiMode !== 'fonnte' && (
                              <button
                                type="button"
                                onClick={() => setWaSettings(prev => ({ ...prev, apiMode: 'fonnte', apiToken: prev.fonnteToken || '' }))}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap self-end sm:self-center"
                              >
                                Terapkan Gateway
                              </button>
                            )}
                          </div>

                          {/* Fonnte Token Config Block */}
                          <div className="border-t border-slate-100/80 pt-3">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                                Kredensial Token Fonnte (Bisa Diedit & Disimpan)
                              </label>
                              <input
                                type="text"
                                placeholder="Masukkan Token API Fonnte Anda..."
                                value={waSettings.fonnteToken || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setWaSettings(prev => ({
                                    ...prev,
                                    fonnteToken: val,
                                    ...(prev.apiMode === 'fonnte' ? { apiToken: val } : {})
                                  }));
                                }}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs font-mono"
                              />
                              <p className="text-[9px] text-slate-400 mt-0.5">
                                Token ini tersimpan aman di database. Ketik untuk mengedit, lalu tekan tombol <strong>Simpan Pengaturan</strong> di bawah untuk menerapkan perubahan.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* CARD 3: WAVIO */}
                      <div className={`p-4 rounded-xl border transition-all duration-200 ${
                        waSettings.apiMode === 'wavio'
                          ? 'bg-indigo-50/40 border-indigo-200 ring-1 ring-indigo-100'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}>
                        <div className="flex flex-col gap-3.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg mt-0.5 ${
                                waSettings.apiMode === 'wavio' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                              }`}>
                                <Cpu size={16} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-700">Wavio API Gateway</span>
                                  {waSettings.apiMode === 'wavio' ? (
                                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 font-extrabold text-[9px] rounded-full uppercase tracking-wider">Aktif</span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-400 font-bold text-[9px] rounded-full uppercase tracking-wider">Mati</span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400 block mt-1 leading-normal">
                                  Layanan API Gateway Wavio (shboard.wavio.web.id) untuk mengaktifkan interaksi dua arah dan absen via WhatsApp bot.
                                </span>
                              </div>
                            </div>
                            
                            {waSettings.apiMode !== 'wavio' && (
                              <button
                                type="button"
                                onClick={() => setWaSettings(prev => ({ ...prev, apiMode: 'wavio', apiToken: prev.wavioToken || '' }))}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap self-end sm:self-center"
                              >
                                Terapkan Gateway
                              </button>
                            )}
                          </div>

                          {/* Wavio Token Config Block */}
                          <div className="border-t border-slate-100/80 pt-3">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                                Kredensial Token Wavio (Bisa Diedit & Disimpan)
                              </label>
                              <input
                                type="text"
                                placeholder="Masukkan Token API Wavio Anda..."
                                value={waSettings.wavioToken || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setWaSettings(prev => ({
                                    ...prev,
                                    wavioToken: val,
                                    ...(prev.apiMode === 'wavio' ? { apiToken: val } : {})
                                  }));
                                }}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs font-mono"
                              />
                              <p className="text-[9px] text-slate-400 mt-0.5">
                                Token ini tersimpan aman di database. Ketik untuk mengedit, lalu tekan tombol <strong>Simpan Pengaturan</strong> di bawah untuk menerapkan perubahan.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
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
                            log.type === 'incoming' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {log.type === 'auto_pagi' ? 'Auto Pagi' :
                             log.type === 'auto_sore' ? 'Auto Sore' :
                             log.type === 'incoming' ? 'Pesan Masuk' :
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

      {/* ======================= SPREADSHEET DATABASE TAB CONTENT ======================= */}
      {activeTab === 'sheets' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"></div>
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold backdrop-blur-md">
                  <FileSpreadsheet size={13} />
                  <span>Google Sheets & Google Drive Database Integration</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight">Database Spreadsheet Cloud</h3>
                <p className="text-emerald-100/80 text-xs md:text-sm leading-relaxed">
                  Hubungkan aplikasi presensi Anda langsung ke Google Spreadsheet. Seluruh data Karyawan, Presensi Harian, Pengajuan Cuti/Lembur, dan Rekap Gaji tersimpan aman & dapat diakses secara langsung melalui Google Drive.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleCreateSpreadsheet}
                  disabled={creatingSheet}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  <Sparkles size={16} className={creatingSheet ? "animate-spin" : ""} />
                  <span>{creatingSheet ? "Membuat Spreadsheet..." : "Buat Spreadsheet Baru (Auto Drive)"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Config & Status Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Database size={18} className="text-emerald-600" />
                  <span>Konfigurasi Google Spreadsheet</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Masukkan Spreadsheet ID yang sudah ada atau klik tombol di atas untuk membuat Spreadsheet baru secara otomatis.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                  sheetsSettings.spreadsheetId 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${sheetsSettings.spreadsheetId ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                  <span>{sheetsSettings.spreadsheetId ? 'Spreadsheet Terhubung' : 'Belum Dikonfigurasi'}</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Spreadsheet ID / URL</label>
                <div className="relative">
                  <input
                    type="text"
                    value={sheetsSettings.spreadsheetId}
                    onChange={(e) => {
                      let val = e.target.value.trim();
                      if (val.includes('/d/')) {
                        const parts = val.split('/d/');
                        if (parts[1]) {
                          val = parts[1].split('/')[0];
                        }
                      }
                      setSheetsSettings(prev => ({ ...prev, spreadsheetId: val }));
                    }}
                    placeholder="Contoh: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Dapat berupa ID unik spreadsheet atau URL lengkap dari Google Sheets.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Status Sinkronisasi Terakhir</label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Clock size={14} className="text-slate-400" />
                    <span>
                      {sheetsSettings.lastSyncedAt 
                        ? new Date(sheetsSettings.lastSyncedAt).toLocaleString('id-ID', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          }) + ' WITA'
                        : 'Belum pernah disinkronkan'
                      }
                    </span>
                  </div>
                  {sheetsSettings.lastSyncedAt && (
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">Aktif</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Sinkronisasi menyimpan seluruh koleksi Firestore ke dalam sheet tab terpisah.
                </p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSyncAllData()}
                  disabled={syncingSheet || !sheetsSettings.spreadsheetId}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw size={14} className={syncingSheet ? "animate-spin" : ""} />
                  <span>{syncingSheet ? "Menyinkronkan Data..." : "Sinkronkan Semua Data Now"}</span>
                </button>

                {sheetsSettings.spreadsheetId && (
                  <a
                    href={sheetsSettings.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${sheetsSettings.spreadsheetId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <ExternalLink size={14} />
                    <span>Buka Google Sheets</span>
                  </a>
                )}
              </div>

              <button
                onClick={handleSaveSheetsSettings}
                disabled={saving}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                <Check size={14} />
                <span>Simpan Pengaturan</span>
              </button>
            </div>
          </div>

          {/* Sheet Structure Visualizer */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Sheet 1 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:border-emerald-300 transition">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                  #1
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Tab 1</span>
              </div>
              <div>
                <h5 className="font-bold text-slate-800 text-sm">Daftar_Karyawan</h5>
                <p className="text-[11px] text-slate-500 mt-1">
                  Menyimpan data identitas karyawan: No WA, Nama, Divisi, Jabatan, Role, & Status.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                Kolom: A-G
              </div>
            </div>

            {/* Sheet 2 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:border-emerald-300 transition">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-xs">
                  #2
                </div>
                <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Tab 2</span>
              </div>
              <div>
                <h5 className="font-bold text-slate-800 text-sm">Presensi_Harian</h5>
                <p className="text-[11px] text-slate-500 mt-1">
                  Menyimpan log absen harian: ID, Tanggal, Jam Masuk, Jam Pulang, Koordinat GPS, & Alamat.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                Kolom: A-I
              </div>
            </div>

            {/* Sheet 3 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:border-emerald-300 transition">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                  #3
                </div>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Tab 3</span>
              </div>
              <div>
                <h5 className="font-bold text-slate-800 text-sm">Pengajuan_Cuti_Lembur</h5>
                <p className="text-[11px] text-slate-500 mt-1">
                  Menyimpan rekap pengajuan izin, cuti, dan lembur berserta status persetujuan admin.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                Kolom: A-I
              </div>
            </div>

            {/* Sheet 4 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:border-emerald-300 transition">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
                  #4
                </div>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Tab 4</span>
              </div>
              <div>
                <h5 className="font-bold text-slate-800 text-sm">Laporan_Gaji</h5>
                <p className="text-[11px] text-slate-500 mt-1">
                  Rekapitulasi penggajian bulanan, rincian jam reguler, jam lembur, tunjangan, potongan, & gaji bersih.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                Kolom: A-M
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
