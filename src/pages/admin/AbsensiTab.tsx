import React, { useEffect, useState, useRef } from 'react';
import { db } from '../../lib/firebase';
import { calculateAutoBreakHours } from '../../lib/utils';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { MapPin, Image as ImageIcon, Edit2, Trash2, X, Users, CheckCircle2, Clock, AlertTriangle, Search, Filter, Printer, Download, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from 'react-hot-toast';
import { DEFAULT_USERS, DEFAULT_ATTENDANCE, DEFAULT_PAYROLLS } from '../../data/defaultData';

export default function AbsensiTab() {
    const [attendance, setAttendance] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [filterDateMode, setFilterDateMode] = useState<'single' | 'all'>('single');
    const [filterDivisi, setFilterDivisi] = useState('');
    const [usersMap, setUsersMap] = useState<Record<string, any>>({});
    const [divisiList, setDivisiList] = useState<string[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    
    // Additional filters for interactive UX
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'Hadir' | 'Terlambat' | 'absen'>('all');

    const getUserFromRecord = (item: any, uMap: Record<string, any> = usersMap) => {
        if (!item) return { nama: 'Karyawan', divisi: '-' };
        const u = (item.user_id && uMap[item.user_id]) ||
                  (item.user_id && uMap[item.user_id.toLowerCase()]) ||
                  (item.user_id && uMap[item.user_id.replace(/\D/g, '')]) ||
                  (item.nama && uMap[item.nama.toLowerCase().trim()]) ||
                  {};
        return {
            nama: u.nama || item.nama || 'Karyawan',
            divisi: u.divisi || item.divisi || '-',
            waNumber: u.waNumber || item.waNumber || '',
            role: u.role || 'karyawan',
            ...u
        };
    };
    
    // Subtab states for Monthly AI reports
    const [activeSubTab, setActiveSubTab] = useState<'harian' | 'bulanan' | 'gaji'>('harian');
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`; // "YYYY-MM"
    });
    const [selectedMonthDivisi, setSelectedMonthDivisi] = useState('');
    const [monthlyRecords, setMonthlyRecords] = useState<any[]>([]);
    const [monthlyLoading, setMonthlyLoading] = useState(false);
    const [monthlyReportData, setMonthlyReportData] = useState<any>(null);
    const [isGeneratingMonthly, setIsGeneratingMonthly] = useState(false);
    
    // Monthly payroll adjustments state
    const [payrollsMap, setPayrollsMap] = useState<Record<string, any>>({});
    const [savingAdjustments, setSavingAdjustments] = useState(false);
    const [adjustmentsForm, setAdjustmentsForm] = useState({
        tunjangan_makan: 0,
        tunjangan_jabatan: 0,
        tunjangan_transport: 0,
        potongan_kasbon: 0,
        potongan_bpjs: 0,
        potongan_lain: 0,
        catatan: '',
        status: 'draft'
    });
    
    const [payrollSearch, setPayrollSearch] = useState('');
    const [selectedEmpPayrollDetail, setSelectedEmpPayrollDetail] = useState<any>(null);
    const [time, setTime] = useState(new Date());

    // Pagination states
    const [pageHarian, setPageHarian] = useState(1);
    const [limitHarian, setLimitHarian] = useState(10);
    const [pageGaji, setPageGaji] = useState(1);
    const [limitGaji, setLimitGaji] = useState(10);

    // Reset pagination on filter changes
    useEffect(() => {
        setPageHarian(1);
    }, [filterDate, filterDateMode, filterDivisi, searchQuery, statusFilter]);

    useEffect(() => {
        setPageGaji(1);
    }, [selectedMonth, selectedMonthDivisi, payrollSearch]);

    useEffect(() => {
        const interval = setInterval(() => {
            setTime(new Date());
        }, 10000); // Update every 10 seconds for real-time calculations
        return () => clearInterval(interval);
    }, []);
    
    const formatRupiah = (val: string | number) => {
        if (val === undefined || val === null || val === '') return '';
        const clean = String(val).replace(/[^0-9]/g, '');
        if (!clean) return '';
        return Number(clean).toLocaleString('id-ID');
    };

    const parseRupiah = (formattedVal: string | number) => {
        if (typeof formattedVal === 'number') return formattedVal;
        const clean = String(formattedVal).replace(/[^0-9]/g, '');
        return clean ? Number(clean) : 0;
    };

    // Checkout is valid only when the system has a real checkout proof.
    // This prevents fallback/demo data or stale jam_pulang values from appearing as a real checkout.
    const hasVerifiedCheckout = (item: any) => Boolean(
        item?.jam_pulang && (
            item?.checkout_status === 'success' ||
            item?.checkout_at ||
            item?.method_pulang ||
            item?.selfie_pulang ||
            item?.latitude_pulang !== undefined ||
            item?.longitude_pulang !== undefined
        )
    );

    const getEffectiveCheckoutTime = (item: any) =>
        hasVerifiedCheckout(item) ? item.jam_pulang : '';

    const [editingRecord, setEditingRecord] = useState<any>(null);
    const [editForm, setEditForm] = useState({ 
        jam_masuk: '', 
        jam_pulang: '', 
        status: '', 
        istirahat: 1, 
        is_lembur: false, 
        dryer_menyala: false 
    });
    
    // Payroll editing and deleting states
    const [editingPayrollUser, setEditingPayrollUser] = useState<any>(null);
    const [payrollForm, setPayrollForm] = useState({
        gaji_type: 'per_jam',
        gaji_per_jam: 14000,
        gaji_bulanan: 0,
        gaji_lembur_per_jam: 14000,
        bonus_dryer_1: false
    });
    const [deletingPayrollUser, setDeletingPayrollUser] = useState<any>(null);
    
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [viewPhoto, setViewPhoto] = useState<string | null>(null);

    const [showAIReportModal, setShowAIReportModal] = useState(false);
    const [showPayrollAIModal, setShowPayrollAIModal] = useState(false);
    const [isGeneratingPayrollAI, setIsGeneratingPayrollAI] = useState(false);
    const [payrollAIReport, setPayrollAIReport] = useState<any>(null);
    const [reportRange, setReportRange] = useState<'weekly' | 'monthly' | 'custom'>('weekly');
    const [reportStartDate, setReportStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return format(d, 'yyyy-MM-dd');
    });
    const [reportEndDate, setReportEndDate] = useState(() => {
        return format(new Date(), 'yyyy-MM-dd');
    });
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [generatedReport, setGeneratedReport] = useState<any>(null);

    const handleRangePresetChange = (preset: 'weekly' | 'monthly' | 'custom') => {
        setReportRange(preset);
        const end = new Date();
        const start = new Date();
        if (preset === 'weekly') {
            start.setDate(end.getDate() - 7);
            setReportStartDate(format(start, 'yyyy-MM-dd'));
            setReportEndDate(format(end, 'yyyy-MM-dd'));
        } else if (preset === 'monthly') {
            start.setDate(end.getDate() - 30);
            setReportStartDate(format(start, 'yyyy-MM-dd'));
            setReportEndDate(format(end, 'yyyy-MM-dd'));
        }
    };

    const handleGenerateAIReport = async () => {
        setIsGeneratingReport(true);
        const toastId = toast.loading('Mengambil data absensi & menganalisis dengan AI...');
        try {
            const { getDocs } = await import('firebase/firestore');
            const snap = await getDocs(collection(db, 'attendance'));
            const allRecords: any[] = [];
            snap.forEach(doc => {
                const data = doc.data();
                allRecords.push({ id: doc.id, ...data });
            });

            const filtered = allRecords.filter(r => r.tanggal >= reportStartDate && r.tanggal <= reportEndDate);
            
            if (filtered.length === 0) {
                throw new Error(`Tidak ditemukan data absensi untuk rentang tanggal ${reportStartDate} hingga ${reportEndDate}`);
            }

            const response = await fetch('/api/generate-ai-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    records: filtered,
                    users: usersMap,
                    startDate: reportStartDate,
                    endDate: reportEndDate,
                    reportType: reportRange
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
                throw new Error(data.error || 'Gagal berkomunikasi dengan server AI');
            }

            if (!data.success) {
                throw new Error('Gagal menghasilkan analisis laporan.');
            }

            setGeneratedReport(data);
            toast.success('Laporan AI Berhasil Dihasilkan!', { id: toastId });
        } catch (error: any) {
            console.error('Error generating AI report:', error);
            toast.error(error.message || 'Gagal menghasilkan laporan AI', { id: toastId });
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const handlePrintAIHTMLReport = () => {
        if (!generatedReport || !generatedReport.htmlReport) return;
        
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.bottom = '0';
        iframe.style.right = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
        
        const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
        if (iframeDoc) {
            iframeDoc.open();
            iframeDoc.write(`
                <html>
                <head>
                    <title>Laporan Absensi AI</title>
                    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
                    <style>
                        body { font-family: 'Inter', sans-serif; padding: 20px; }
                        @media print {
                            .no-print { display: none; }
                            body { padding: 0; }
                        }
                    </style>
                </head>
                <body>
                    <div class="max-w-4xl mx-auto">
                        ${generatedReport.htmlReport}
                    </div>
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(function() {
                                window.parent.document.body.removeChild(window.frameElement);
                            }, 500);
                        }
                    </script>
                </body>
                </html>
            `);
            iframeDoc.close();
        }
    };

    const handleDownloadAICsvReport = () => {
        if (!generatedReport || !generatedReport.csvReport) return;
        const blob = new Blob(["\uFEFF" + generatedReport.csvReport], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Laporan_Absensi_AI_${reportStartDate}_sd_${reportEndDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('File CSV Laporan berhasil diunduh.');
    };

    const handleAIAttendanceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsExtracting(true);
        const toastId = toast.loading('AI sedang memindai foto & memproses log kehadiran...');

        try {
            const base64Image = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            });

            const response = await fetch('/api/extract-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image, currentDate: filterDate })
            });

            const responseText = await response.text();
            let data: any = {};
            try {
                data = responseText ? JSON.parse(responseText) : {};
            } catch (parseErr) {
                throw new Error('Respon server tidak valid (bukan JSON).');
            }

            if (!response.ok) {
                throw new Error(data.error || data.message || 'Gagal berkomunikasi dengan AI');
            }

            if (!data.success || !data.records || data.records.length === 0) {
                throw new Error('AI tidak menemukan data absensi dalam gambar tersebut. Pastikan teks terlihat jelas.');
            }

            let importCount = 0;
            for (const record of data.records) {
                const waNumber = record.waNumber ? record.waNumber.replace(/\D/g, '') : '';
                if (!waNumber) continue;

                const userId = `wa-${waNumber}`;
                const attId = `${userId}-${record.tanggal}`;
                const payload: any = {
                    user_id: userId,
                    tanggal: record.tanggal,
                    jam_masuk: record.jam_masuk,
                    checkin_status: 'success',
                    checkin_at: new Date().toISOString(),
                    status: record.status,
                    method_masuk: 'Foto AI',
                    created_at: new Date().toISOString()
                };
                if (record.jam_pulang) {
                    payload.jam_pulang = record.jam_pulang;
                    payload.checkout_status = 'success';
                    payload.checkout_at = new Date().toISOString();
                    payload.method_pulang = 'Foto AI';
                }

                await setDoc(doc(db, 'attendance', attId), payload, { merge: true });
                importCount++;
            }

            toast.success(`AI Berhasil! Mengimpor ${importCount} catatan absensi dari foto ke tanggal ${filterDate}.`, { id: toastId });
        } catch (error: any) {
            console.error("Gagal melakukan ekstraksi data via AI:", error);
            toast.error(error.message || 'Gagal memproses gambar menggunakan AI', { id: toastId });
        } finally {
            setIsExtracting(false);
            e.target.value = '';
        }
    };

    useEffect(() => {
        const applyUserFallback = () => {
            const map: Record<string, any> = {};
            const divisiSet = new Set<string>();
            DEFAULT_USERS.forEach(data => {
                map[data.id] = data;
                if (data.waNumber) map[data.waNumber] = data;
                if (data.nama) map[data.nama.toLowerCase().trim()] = data;
                if (data.divisi) divisiSet.add(data.divisi);
            });
            setUsersMap(map);
            setDivisiList(Array.from(divisiSet));
        };

        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
            if (snap.empty) {
                applyUserFallback();
                return;
            }
            const map: Record<string, any> = {};
            const divisiSet = new Set<string>();
            snap.forEach(doc => {
                const data = doc.data();
                const userData = { id: doc.id, ...data };
                map[doc.id] = userData;
                if (data.id) map[data.id] = userData;
                if (data.uid) map[data.uid] = userData;
                if (data.user_id) map[data.user_id] = userData;
                if (data.waNumber) {
                    const rawWa = String(data.waNumber);
                    const cleanWa = rawWa.replace(/\D/g, '');
                    map[rawWa] = userData;
                    map[`wa-${rawWa}`] = userData;
                    if (cleanWa) {
                        map[cleanWa] = userData;
                        map[`wa-${cleanWa}`] = userData;
                        if (cleanWa.startsWith('62')) {
                            const wa08 = '0' + cleanWa.slice(2);
                            map[wa08] = userData;
                            map[`wa-${wa08}`] = userData;
                        } else if (cleanWa.startsWith('0')) {
                            const wa62 = '62' + cleanWa.slice(1);
                            map[wa62] = userData;
                            map[`wa-${wa62}`] = userData;
                        }
                    }
                }
                if (data.nama) {
                    map[data.nama.toLowerCase().trim()] = userData;
                }
                if (data.divisi) divisiSet.add(data.divisi);
            });
            setUsersMap(map);
            setDivisiList(Array.from(divisiSet));
        }, (error) => {
            applyUserFallback();
            console.warn("[AbsensiTab] Users sync notice:", error?.message || error);
        });
        return () => unsubUsers();
    }, []);

    useEffect(() => {
        setLoading(true);

        const normalizeDate = (value: any) => {
            if (!value) return '';
            if (typeof value === 'string') {
                const match = value.match(/(\d{4}-\d{2}-\d{2})/);
                return match ? match[1] : value.slice(0, 10);
            }
            if (value?.toDate) {
                try { return format(value.toDate(), 'yyyy-MM-dd'); } catch (_) {}
            }
            if (value instanceof Date) return format(value, 'yyyy-MM-dd');
            return '';
        };

        const buildData = (snap: any, forceDateFilter = false) => {
            let data: any[] = [];
            snap.forEach((docSnap: any) => data.push({ id: docSnap.id, ...docSnap.data() }));

            if (filterDateMode !== 'all' && forceDateFilter) {
                data = data.filter(item => normalizeDate(item.tanggal) === filterDate);
            }

            data.sort((a, b) => {
                const dateComp = String(b.tanggal || '').localeCompare(String(a.tanggal || ''));
                if (dateComp !== 0) return dateComp;
                return String(b.jam_masuk || '').localeCompare(String(a.jam_masuk || ''));
            });

            if (filterDivisi) {
                data = data.filter(item => {
                    const user = getUserFromRecord(item, usersMap);
                    return user.divisi === filterDivisi || item.divisi === filterDivisi;
                });
            }
            return data;
        };

        // Normal daily mode: query only the selected date. This keeps Firestore
        // reads small and prevents the daily page from exhausting the quota.
        const q = filterDateMode === 'all'
            ? query(collection(db, 'attendance'))
            : query(collection(db, 'attendance'), where('tanggal', '==', filterDate));

        const unsubAttendance = onSnapshot(q, async (snap) => {
            let data = buildData(snap);

            // Primary exact-date query is efficient. If it returns zero rows,
            // perform one compatibility read so legacy date formats cannot hide
            // valid attendance records from the admin.
            if (filterDateMode !== 'all' && snap.empty) {
                try {
                    const { getDocs } = await import('firebase/firestore');
                    const allSnap = await getDocs(collection(db, 'attendance'));
                    data = buildData(allSnap, true);
                } catch (fallbackError: any) {
                    console.warn('[AbsensiTab] Compatibility attendance read notice:', fallbackError?.message || fallbackError);
                }
            }

            setAttendance(data);
            setLoading(false);
        }, (error) => {
            console.error('[AbsensiTab] Attendance sync error:', error?.message || error);
            setAttendance([]);
            setLoading(false);
            const code = error?.code || '';
            const message = String(error?.message || '');
            if (code === 'resource-exhausted' || /quota|resource.?exhausted|too many/i.test(message)) {
                toast.error('Kuota pembacaan Firestore sedang penuh. Data tidak dihapus; coba kembali setelah kuota pulih.');
            } else {
                toast.error('Gagal memuat data absensi dari server. Silakan coba lagi.');
            }
        });

        return () => unsubAttendance();
    }, [filterDate, filterDateMode, filterDivisi, usersMap]);

    useEffect(() => {
        if (activeSubTab !== 'bulanan' && activeSubTab !== 'gaji') return;

        setMonthlyLoading(true);
        const start = `${selectedMonth}-01`;
        const end = `${selectedMonth}-31`;
        const q = query(
            collection(db, 'attendance'),
            where('tanggal', '>=', start),
            where('tanggal', '<=', end)
        );

        const unsubMonthly = onSnapshot(q, (snap) => {
            const records: any[] = [];
            snap.forEach(doc => {
                records.push({ id: doc.id, ...doc.data() });
            });
            setMonthlyRecords(records);
            setMonthlyLoading(false);
        }, (error) => {
            console.warn('[AbsensiTab] Monthly records sync notice, using fallbacks:', error?.message || error);
            setMonthlyRecords([]);
            setMonthlyLoading(false);
        });

        // Listen to payroll adjustments for this month
        const qPayrolls = query(
            collection(db, 'payrolls'),
            where('bulan', '==', selectedMonth)
        );
        const unsubPayrolls = onSnapshot(qPayrolls, (snap) => {
            const map: Record<string, any> = {};
            snap.forEach(doc => {
                const data = doc.data();
                map[data.user_id] = { id: doc.id, ...data };
            });
            if (snap.empty) {
                DEFAULT_PAYROLLS.forEach(p => { map[p.user_id] = p; });
            }
            setPayrollsMap(map);
        }, (error) => {
            console.warn('[AbsensiTab] Payrolls sync notice, using fallbacks:', error?.message || error);
            const map: Record<string, any> = {};
            DEFAULT_PAYROLLS.forEach(p => { map[p.user_id] = p; });
            setPayrollsMap(map);
        });

        return () => {
            unsubMonthly();
            unsubPayrolls();
        };
    }, [selectedMonth, activeSubTab, usersMap]);

    const lastOpenedIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (selectedEmpPayrollDetail) {
            const currentId = `${selectedEmpPayrollDetail.employee.id}-${selectedMonth}`;
            if (lastOpenedIdRef.current !== currentId) {
                lastOpenedIdRef.current = currentId;
                setAdjustmentsForm({
                    tunjangan_makan: selectedEmpPayrollDetail.tunjangan_makan || 0,
                    tunjangan_jabatan: selectedEmpPayrollDetail.tunjangan_jabatan || 0,
                    tunjangan_transport: selectedEmpPayrollDetail.tunjangan_transport || 0,
                    potongan_kasbon: selectedEmpPayrollDetail.potongan_kasbon || 0,
                    potongan_bpjs: selectedEmpPayrollDetail.potongan_bpjs || 0,
                    potongan_lain: selectedEmpPayrollDetail.potongan_lain || 0,
                    catatan: selectedEmpPayrollDetail.catatan || '',
                    status: selectedEmpPayrollDetail.status || 'draft'
                });
            }
        } else {
            lastOpenedIdRef.current = null;
        }
    }, [selectedEmpPayrollDetail, selectedMonth]);

    const handleSaveAdjustments = async () => {
        if (!selectedEmpPayrollDetail) return;
        setSavingAdjustments(true);
        const toastId = toast.loading('Menyimpan penyesuaian gaji...');
        try {
            const empId = selectedEmpPayrollDetail.employee.id;
            const docId = `${empId}-${selectedMonth}`;
            
            const payload = {
                user_id: empId,
                bulan: selectedMonth,
                tunjangan_makan: parseRupiah(adjustmentsForm.tunjangan_makan),
                tunjangan_jabatan: parseRupiah(adjustmentsForm.tunjangan_jabatan),
                tunjangan_transport: parseRupiah(adjustmentsForm.tunjangan_transport),
                potongan_kasbon: parseRupiah(adjustmentsForm.potongan_kasbon),
                potongan_bpjs: parseRupiah(adjustmentsForm.potongan_bpjs),
                potongan_lain: parseRupiah(adjustmentsForm.potongan_lain),
                catatan: adjustmentsForm.catatan || '',
                status: adjustmentsForm.status || 'draft',
                
                // Frozen calculations snapshots for secure historical slip display
                daysPresent: selectedEmpPayrollDetail.daysPresent || 0,
                totalRegularHours: selectedEmpPayrollDetail.totalRegularHours || 0,
                totalLemburHours: selectedEmpPayrollDetail.totalLemburHours || 0,
                totalDryerBonus: selectedEmpPayrollDetail.totalDryerBonus || 0,
                totalRegPay: selectedEmpPayrollDetail.totalRegPay || 0,
                totalLemburPay: selectedEmpPayrollDetail.totalLemburPay || 0,
                basePay: selectedEmpPayrollDetail.basePay || 0,
                
                // Frozen employee info snapshot
                employee_nama: selectedEmpPayrollDetail.employee.nama || '',
                employee_jabatan: selectedEmpPayrollDetail.employee.jabatan || '',
                employee_divisi: selectedEmpPayrollDetail.employee.divisi || '',
                employee_gaji_type: selectedEmpPayrollDetail.employee.gaji_type || 'per_jam',
                employee_gaji_per_jam: selectedEmpPayrollDetail.employee.gaji_per_jam || 14000,
                employee_gaji_lembur_per_jam: selectedEmpPayrollDetail.employee.gaji_lembur_per_jam || 14000,
                employee_bonus_dryer_1: !!selectedEmpPayrollDetail.employee.bonus_dryer_1,
                
                updated_at: new Date().toISOString()
            };

            await setDoc(doc(db, 'payrolls', docId), payload, { merge: true });
            
            const updatedSalary = (selectedEmpPayrollDetail.basePay + 
                selectedEmpPayrollDetail.totalRegPay + 
                selectedEmpPayrollDetail.totalLemburPay + 
                selectedEmpPayrollDetail.totalDryerBonus +
                (payload.tunjangan_makan + payload.tunjangan_jabatan + payload.tunjangan_transport) -
                (payload.potongan_kasbon + payload.potongan_bpjs + payload.potongan_lain));

            setSelectedEmpPayrollDetail((prev: any) => {
                if (!prev) return null;
                return {
                    ...prev,
                    ...payload,
                    totalTunjangan: payload.tunjangan_makan + payload.tunjangan_jabatan + payload.tunjangan_transport,
                    totalPotongan: payload.potongan_kasbon + payload.potongan_bpjs + payload.potongan_lain,
                    grandTotalSalary: updatedSalary
                };
            });

            toast.success('Penyesuaian Gaji & Status Pembayaran berhasil disimpan!', { id: toastId });
        } catch (error: any) {
            console.error('Error saving adjustments:', error);
            toast.error(error.message || 'Gagal menyimpan penyesuaian gaji', { id: toastId });
        } finally {
            setSavingAdjustments(false);
        }
    };

    const filteredMonthlyRecords = monthlyRecords.filter(r => {
        if (!selectedMonthDivisi) return true;
        return usersMap[r.user_id]?.divisi === selectedMonthDivisi;
    });

    const handleGenerateMonthlyAIReport = async () => {
        if (filteredMonthlyRecords.length === 0) {
            toast.error('Tidak ada data absensi untuk rentang bulan dan divisi terpilih.');
            return;
        }
        setIsGeneratingMonthly(true);
        const toastId = toast.loading('Mengambil data absensi & menganalisis dengan AI...');
        try {
            const start = `${selectedMonth}-01`;
            const end = `${selectedMonth}-31`;
            const response = await fetch('/api/generate-ai-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    records: filteredMonthlyRecords,
                    users: usersMap,
                    startDate: start,
                    endDate: end,
                    reportType: 'monthly'
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
                throw new Error(data.error || 'Gagal berkomunikasi dengan server AI');
            }

            if (!data.success) {
                throw new Error('Gagal menghasilkan analisis laporan.');
            }

            setMonthlyReportData(data);
            toast.success('Laporan & Ringkasan Eksekutif AI Berhasil Dihasilkan!', { id: toastId });
        } catch (error: any) {
            console.error('Error generating AI monthly report:', error);
            toast.error(error.message || 'Gagal menghasilkan laporan AI', { id: toastId });
        } finally {
            setIsGeneratingMonthly(false);
        }
    };

    const handleGeneratePayrollAIReport = async () => {
        setIsGeneratingPayrollAI(true);
        setShowPayrollAIModal(true);
        setPayrollAIReport(null);
        const toastId = toast.loading('Memulai audit & analisis upah cerdas AI...');
        try {
            const payrolls = getPayrollData();
            const response = await fetch('/api/generate-payroll-ai-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    payrolls,
                    month: selectedMonth,
                    division: selectedMonthDivisi
                })
            });

            const responseText = await response.text();
            let data: any = {};
            try {
                data = responseText ? JSON.parse(responseText) : {};
            } catch (parseErr) {
                throw new Error('Respon server tidak valid (bukan JSON).');
            }

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Gagal berkomunikasi dengan server AI');
            }

            setPayrollAIReport(data);
            toast.success('Analisis & Audit Gaji AI Berhasil!', { id: toastId });
        } catch (error: any) {
            console.error('Error generating payroll AI report:', error);
            toast.error(error.message || 'Gagal menghasilkan laporan AI', { id: toastId });
            setShowPayrollAIModal(false);
        } finally {
            setIsGeneratingPayrollAI(false);
        }
    };

    const handlePrintMonthlyReport = () => {
        if (!monthlyReportData || !monthlyReportData.htmlReport) return;
        
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.bottom = '0';
        iframe.style.right = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
        
        const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
        if (iframeDoc) {
            iframeDoc.open();
            iframeDoc.write(`
                <html>
                <head>
                    <title>Laporan Absensi AI Bulanan</title>
                    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
                    <style>
                        body { font-family: 'Inter', sans-serif; padding: 20px; }
                        @media print {
                            .no-print { display: none; }
                            body { padding: 0; }
                        }
                    </style>
                </head>
                <body>
                    <div class="max-w-4xl mx-auto">
                        ${monthlyReportData.htmlReport}
                    </div>
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(function() {
                                window.parent.document.body.removeChild(window.frameElement);
                            }, 500);
                        }
                    </script>
                </body>
                </html>
            `);
            iframeDoc.close();
        }
    };

    const handleDownloadMonthlyCSV = () => {
        if (!monthlyReportData || !monthlyReportData.csvReport) return;
        const blob = new Blob(["\uFEFF" + monthlyReportData.csvReport], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Laporan_Absensi_AI_${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('File CSV Laporan Bulanan berhasil diunduh.');
    };

    const handleExportMonthlyCSV = () => {
        if (filteredMonthlyRecords.length === 0) {
            toast.error('Tidak ada data bulanan untuk diekspor.');
            return;
        }
        const headers = ['No', 'Nama Karyawan', 'Divisi', 'Jabatan', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status'];
        const rows = filteredMonthlyRecords.map((item, idx) => {
            const u = usersMap[item.user_id] || {};
            return [
                idx + 1,
                `"${(u.nama || 'Tidak Dikenal').replace(/"/g, '""')}"`,
                `"${(u.divisi || '-').replace(/"/g, '""')}"`,
                `"${(u.jabatan || '-').replace(/"/g, '""')}"`,
                item.tanggal,
                item.jam_masuk || '-',
                getEffectiveCheckoutTime(item) || '-',
                item.status || 'Hadir'
            ];
        });

        const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Rekap_Presensi_Bulanan_${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Rekap data bulanan berhasil diekspor ke CSV.');
    };

    const handleOpenMap = (lat: number, lng: number) => {
        window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await deleteDoc(doc(db, 'attendance', deleteId));
            toast.success('Data absensi berhasil dihapus');
        } catch (error) {
            console.error('Error deleting attendance:', error);
            toast.error('Gagal menghapus data absensi');
        } finally {
            setDeleteId(null);
        }
    };

    const handleEdit = (item: any) => {
        setEditingRecord(item);
        setEditForm({
            jam_masuk: item.jam_masuk || '',
            jam_pulang: getEffectiveCheckoutTime(item),
            status: item.status || 'Hadir',
            istirahat: calculateAutoBreakHours(item.jam_masuk, item.jam_pulang, item.istirahat),
            is_lembur: !!item.is_lembur,
            dryer_menyala: !!item.dryer_menyala
        });
    };

    const handleSaveEdit = async () => {
        if (!editingRecord) return;
        try {
            await updateDoc(doc(db, 'attendance', editingRecord.id), {
                jam_masuk: editForm.jam_masuk,
                jam_pulang: editForm.jam_pulang || '',
                checkout_status: editForm.jam_pulang ? 'success' : '',
                checkout_at: editForm.jam_pulang ? new Date().toISOString() : '',
                method_pulang: editForm.jam_pulang ? 'Admin Manual' : '',
                status: editForm.status,
                istirahat: Number(editForm.istirahat) || 0,
                is_lembur: !!editForm.is_lembur,
                dryer_menyala: !!editForm.dryer_menyala
            });
            toast.success('Data absensi berhasil diperbarui');
            setEditingRecord(null);
        } catch (error) {
            console.error('Error updating attendance:', error);
            toast.error('Gagal memperbarui data absensi');
        }
    };

    const handleEditPayroll = (payroll: any) => {
        const emp = payroll.employee;
        setEditingPayrollUser(emp);
        setPayrollForm({
            gaji_type: emp.gaji_type || 'per_jam',
            gaji_per_jam: emp.gaji_per_jam !== undefined ? Number(emp.gaji_per_jam) : 14000,
            gaji_bulanan: emp.gaji_bulanan !== undefined ? Number(emp.gaji_bulanan) : 0,
            gaji_lembur_per_jam: emp.gaji_lembur_per_jam !== undefined ? Number(emp.gaji_lembur_per_jam) : 14000,
            bonus_dryer_1: !!emp.bonus_dryer_1
        });
    };

    const handleSavePayrollEdit = async () => {
        if (!editingPayrollUser) return;
        try {
            await setDoc(doc(db, 'users', editingPayrollUser.id), {
                gaji_type: payrollForm.gaji_type,
                gaji_per_jam: parseRupiah(payrollForm.gaji_per_jam),
                gaji_bulanan: parseRupiah(payrollForm.gaji_bulanan),
                gaji_lembur_per_jam: parseRupiah(payrollForm.gaji_lembur_per_jam),
                bonus_dryer_1: payrollForm.bonus_dryer_1
            }, { merge: true });
            
            toast.success(`Konfigurasi gaji untuk ${editingPayrollUser.nama} berhasil diperbarui.`);
            setEditingPayrollUser(null);
        } catch (error) {
            console.error('Error updating payroll settings:', error);
            toast.error('Gagal memperbarui konfigurasi gaji.');
        }
    };

    const handleDeletePayroll = (payroll: any) => {
        setDeletingPayrollUser(payroll.employee);
    };

    const handleConfirmDeletePayroll = async () => {
        if (!deletingPayrollUser) return;
        try {
            await setDoc(doc(db, 'users', deletingPayrollUser.id), {
                gaji_type: 'per_jam',
                gaji_per_jam: 0,
                gaji_bulanan: 0,
                gaji_lembur_per_jam: 0,
                bonus_dryer_1: false
            }, { merge: true });

            toast.success(`Konfigurasi gaji untuk ${deletingPayrollUser.nama} berhasil direset/dihapus.`);
            setDeletingPayrollUser(null);
        } catch (error) {
            console.error('Error resetting payroll settings:', error);
            toast.error('Gagal mereset konfigurasi gaji.');
        }
    };

    const handleExportAdminCSV = () => {
        if (displayedAttendance.length === 0) {
            toast.error('Tidak ada data untuk diekspor.');
            return;
        }
        const headers = ['No', 'Nama Karyawan', 'Divisi', 'Jam Masuk', 'Jam Pulang', 'Status', 'Alamat Masuk', 'Latitude', 'Longitude'];
        const rows = displayedAttendance.map((item, idx) => {
            const u = getUserFromRecord(item, usersMap);
            return [
                idx + 1,
                `"${(u.nama || item.nama || 'Karyawan').replace(/"/g, '""')}"`,
                `"${(u.divisi || item.divisi || '-').replace(/"/g, '""')}"`,
                item.jam_masuk || '-',
                getEffectiveCheckoutTime(item) || '-',
                item.status || 'Hadir',
                item.alamat_masuk ? `"${item.alamat_masuk.replace(/"/g, '""')}"` : '-',
                item.latitude_masuk || '-',
                item.longitude_masuk || '-'
            ];
        });

        const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Laporan_Absensi_Harian_${filterDate}_${filterDivisi || 'Semua_Divisi'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Laporan harian berhasil diekspor.');
    };

    const handlePrintDaily = () => {
        window.print();
    };

    // Derived statistics over unfiltered attendance
    const totalCount = attendance.length;
    const hadirCount = attendance.filter(item => item.status === 'Hadir').length;
    const terlambatCount = attendance.filter(item => item.status === 'Terlambat').length;
    const absenCount = attendance.filter(item => ['Izin', 'Sakit', 'Alpa'].includes(item.status)).length;

    // Filter displayed list
    const displayedAttendance = attendance.filter(item => {
        const user = getUserFromRecord(item, usersMap);
        const employeeName = (user.nama || item.nama || '').toLowerCase();
        const matchesSearch = employeeName.includes(searchQuery.toLowerCase());
        
        if (!matchesSearch) return false;
        
        if (statusFilter === 'all') return true;
        if (statusFilter === 'Hadir') return item.status === 'Hadir';
        if (statusFilter === 'Terlambat') return item.status === 'Terlambat';
        if (statusFilter === 'absen') return ['Izin', 'Sakit', 'Alpa'].includes(item.status);
        
        return true;
    });

    const getPayrollData = () => {
        // Collect unique employee objects keyed by user ID / document ID
        const employeeMap = new Map<string, any>();
        Object.values(usersMap).forEach((u: any) => {
            if (u && u.role !== 'admin') {
                const uniqueId = u.id || u.waNumber || u.nama;
                if (uniqueId && !employeeMap.has(uniqueId)) {
                    employeeMap.set(uniqueId, u);
                }
            }
        });
        const employees = Array.from(employeeMap.values());

        const results = employees.map(emp => {
            const empRecords = monthlyRecords.filter(r => {
                const user = getUserFromRecord(r, usersMap);
                return user?.id === emp.id || r.user_id === emp.id || r.user_id === emp.waNumber;
            });
            let totalRegularHours = 0;
            let totalLemburHours = 0;
            let totalDryerBonus = 0;
            const presentDates = new Set<string>();
            let salaryBreakdown: any[] = [];

            empRecords.forEach(rec => {
                if (!['Hadir', 'Terlambat'].includes(rec.status)) {
                    salaryBreakdown.push({
                        tanggal: rec.tanggal,
                        status: rec.status,
                        jam_masuk: '-',
                        jam_pulang: '-',
                        istirahat: 0,
                        jam_kerja: 0,
                        lembur: 0,
                        gaji_hari_ini: 0,
                        dryer_aktif: false,
                        dryer_bonus: 0,
                        keterangan: rec.status
                    });
                    return;
                }

                presentDates.add(rec.tanggal);
                const inVal = rec.jam_masuk || '';
                const outVal = getEffectiveCheckoutTime(rec);
                
                if (!inVal || !outVal) {
                    salaryBreakdown.push({
                        tanggal: rec.tanggal,
                        status: rec.status,
                        jam_masuk: inVal || '-',
                        jam_pulang: outVal || '-',
                        istirahat: 0,
                        jam_kerja: 0,
                        lembur: 0,
                        gaji_hari_ini: 0,
                        dryer_aktif: false,
                        dryer_bonus: 0,
                        keterangan: !inVal ? 'Belum Absen Masuk' : 'Belum Absen Pulang'
                    });
                    return;
                }
                
                let inTime = 0;
                let outTime = 0;
                
                if (inVal.includes(':')) {
                    const [h, m] = inVal.split(':').map(Number);
                    inTime = (h || 0) + (m || 0) / 60;
                } else {
                    inTime = Number(inVal) || 0;
                }
                
                if (outVal.includes(':')) {
                    const [h, m] = outVal.split(':').map(Number);
                    outTime = (h || 0) + (m || 0) / 60;
                } else {
                    outTime = Number(outVal) || 0;
                }

                const breakHours = calculateAutoBreakHours(inVal, outVal, rec.istirahat);
                const rawHours = Math.max(0, outTime - inTime);
                const netHours = Math.max(0, rawHours - breakHours);

                let regularHours = 0;
                let lemburHours = 0;
                let isLemburShift = !!rec.is_lembur;

                const isJuned = emp?.nama?.toLowerCase().includes('juned') || false;
                const isAsma = emp?.nama?.toLowerCase().includes('asma') || false;

                if (isLemburShift) {
                    lemburHours = netHours;
                } else {
                    if (isJuned) {
                        if (outTime > 17) {
                            const ovt = Math.max(0, outTime - 17);
                            lemburHours = Math.min(netHours, ovt);
                            regularHours = Math.max(0, netHours - lemburHours);
                        } else {
                            regularHours = netHours;
                            lemburHours = 0;
                        }
                    } else if (isAsma) {
                        if (outTime > 18) {
                            const ovt = Math.max(0, outTime - 18);
                            lemburHours = Math.min(netHours, ovt);
                            regularHours = Math.max(0, netHours - lemburHours);
                        } else {
                            regularHours = netHours;
                            lemburHours = 0;
                        }
                    } else {
                        regularHours = netHours;
                        lemburHours = 0;
                    }
                }

                totalRegularHours += regularHours;
                totalLemburHours += lemburHours;

                const regRate = emp.gaji_type === 'per_bulan' ? 0 : (emp.gaji_per_jam !== undefined ? Number(emp.gaji_per_jam) : 14000);
                let lemburRate = emp.gaji_lembur_per_jam !== undefined ? Number(emp.gaji_lembur_per_jam) : 14000;
                if (isJuned) lemburRate = 15000;
                if (isAsma) lemburRate = 16000;

                const regPay = regularHours * regRate;
                const lemburPay = lemburHours * lemburRate;

                let dryerBonus = 0;
                if (rec.dryer_menyala && emp.bonus_dryer_1) {
                    dryerBonus = 10000;
                    totalDryerBonus += dryerBonus;
                }

                const dayTotal = regPay + lemburPay + dryerBonus;

                salaryBreakdown.push({
                    tanggal: rec.tanggal,
                    status: rec.status,
                    jam_masuk: inVal || '-',
                    jam_pulang: outVal || '-',
                    istirahat: breakHours,
                    jam_kerja: regularHours,
                    lembur: lemburHours,
                    gaji_hari_ini: dayTotal,
                    dryer_aktif: !!rec.dryer_menyala,
                    dryer_bonus: dryerBonus,
                    keterangan: isLemburShift ? 'Lembur' : 'Biasa'
                });
            });

            const basePay = emp.gaji_type === 'per_bulan' ? (Number(emp.gaji_bulanan) || 0) : 0;
            const regRate = emp.gaji_type === 'per_bulan' ? 0 : (emp.gaji_per_jam !== undefined ? Number(emp.gaji_per_jam) : 14000);
            const isJuned = emp?.nama?.toLowerCase().includes('juned') || false;
            const isAsma = emp?.nama?.toLowerCase().includes('asma') || false;
            let lemburRate = emp.gaji_lembur_per_jam !== undefined ? Number(emp.gaji_lembur_per_jam) : 14000;
            if (isJuned) lemburRate = 15000;
            if (isAsma) lemburRate = 16000;

            const totalRegPay = totalRegularHours * regRate;
            const totalLemburPay = totalLemburHours * lemburRate;

            // Get monthly adjustments
            const adj = payrollsMap[emp.id] || {};
            const tunMakan = Number(adj.tunjangan_makan) || 0;
            const tunJabatan = Number(adj.tunjangan_jabatan) || 0;
            const tunTransport = Number(adj.tunjangan_transport) || 0;
            const potKasbon = Number(adj.potongan_kasbon) || 0;
            const potBpjs = Number(adj.potongan_bpjs) || 0;
            const potLain = Number(adj.potongan_lain) || 0;
            const totalTunjangan = tunMakan + tunJabatan + tunTransport;
            const totalPotongan = potKasbon + potBpjs + potLain;

            const grandTotalSalary = basePay + totalRegPay + totalLemburPay + totalDryerBonus + totalTunjangan - totalPotongan;

            return {
                employee: emp,
                totalRegularHours,
                totalLemburHours,
                totalDryerBonus,
                totalRegPay,
                totalLemburPay,
                basePay,
                daysPresent: presentDates.size,
                grandTotalSalary,
                tunjangan_makan: tunMakan,
                tunjangan_jabatan: tunJabatan,
                tunjangan_transport: tunTransport,
                totalTunjangan,
                potongan_kasbon: potKasbon,
                potongan_bpjs: potBpjs,
                potongan_lain: potLain,
                totalPotongan,
                catatan: adj.catatan || '',
                status: adj.status || 'draft',
                salaryBreakdown: salaryBreakdown.sort((a, b) => a.tanggal.localeCompare(b.tanggal))
            };
        });

        // Apply division and search query filters
        return results.filter(item => {
            const matchesDivisi = !selectedMonthDivisi || item.employee.divisi === selectedMonthDivisi;
            const matchesSearch = !payrollSearch || 
                item.employee.nama?.toLowerCase().includes(payrollSearch.toLowerCase()) ||
                item.employee.jabatan?.toLowerCase().includes(payrollSearch.toLowerCase());
            return matchesDivisi && matchesSearch;
        });
    };

    const renderPaginationBar = (
        currentPage: number,
        totalPages: number,
        totalItems: number,
        limit: number,
        onPageChange: (p: number) => void,
        onLimitChange: (l: number) => void,
        itemLabel: string = "Data"
    ) => {
        if (totalItems === 0) return null;

        const startItem = (currentPage - 1) * limit + 1;
        const endItem = Math.min(currentPage * limit, totalItems);

        const getPageNumbers = () => {
            const pages: (number | string)[] = [];
            if (totalPages <= 5) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                if (currentPage > 3) pages.push('...');
                
                const start = Math.max(2, currentPage - 1);
                const end = Math.min(totalPages - 1, currentPage + 1);
                
                for (let i = start; i <= end; i++) {
                    if (!pages.includes(i)) pages.push(i);
                }
                
                if (currentPage < totalPages - 2) pages.push('...');
                if (!pages.includes(totalPages)) pages.push(totalPages);
            }
            return pages;
        };

        return (
            <div className="bg-slate-50 border-t border-slate-200 px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-sans">
                <div className="flex flex-wrap items-center justify-between sm:justify-start w-full sm:w-auto gap-3 text-slate-500 font-medium">
                    <div>
                        Menampilkan <span className="font-bold text-slate-800">{startItem}</span> - <span className="font-bold text-slate-800">{endItem}</span> dari <span className="font-bold text-slate-800">{totalItems}</span> {itemLabel}
                    </div>
                    <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                        <span className="text-[11px] text-slate-400">Baris:</span>
                        <select
                            value={limit}
                            onChange={(e) => {
                                onLimitChange(Number(e.target.value));
                                onPageChange(1);
                            }}
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 font-bold outline-none focus:ring-2 focus:ring-blue-500/20 text-xs shadow-xs cursor-pointer"
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                        </select>
                    </div>
                </div>

                <div className="flex items-center justify-center gap-1.5 w-full sm:w-auto">
                    <button
                        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-semibold flex items-center gap-1 shadow-xs active:scale-95 cursor-pointer"
                        title="Halaman Sebelumnya"
                    >
                        <ChevronLeft size={15} />
                        <span className="hidden sm:inline text-xs">Sebelumnya</span>
                    </button>

                    <div className="flex items-center gap-1">
                        {getPageNumbers().map((p, idx) => {
                            if (typeof p === 'string') {
                                return (
                                    <span key={idx} className="px-1.5 text-slate-400 text-xs font-bold">
                                        ...
                                    </span>
                                );
                            }
                            const isCurrent = p === currentPage;
                            return (
                                <button
                                    key={idx}
                                    onClick={() => onPageChange(p)}
                                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                                        isCurrent
                                            ? 'bg-blue-600 text-white shadow-sm scale-105 font-black'
                                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                    }`}
                                >
                                    {p}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage >= totalPages}
                        className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-semibold flex items-center gap-1 shadow-xs active:scale-95 cursor-pointer"
                        title="Halaman Selanjutnya"
                    >
                        <span className="hidden sm:inline text-xs">Selanjutnya</span>
                        <ChevronRight size={15} />
                    </button>
                </div>
            </div>
        );
    };

    const handleDownloadAllPayrollCSV = () => {
        const data = getPayrollData();
        if (data.length === 0) {
            toast.error('Tidak ada data payroll untuk diekspor.');
            return;
        }

        let csvContent = "ID Karyawan,Nama Karyawan,Jabatan,Divisi,Tipe Gaji,Gaji Pokok/Jam,Gaji Pokok Bulanan,Hari Hadir,Total Jam Kerja,Total Jam Lembur,Total Gaji Pokok,Total Gaji Lembur,Total Bonus Dryer 1,Total Gaji Bersih\n";
        
        data.forEach(item => {
            const emp = item.employee;
            csvContent += `"${emp.id}","${emp.nama}","${emp.jabatan || '-'}","${emp.divisi || '-'}","${emp.gaji_type === 'per_bulan' ? 'Bulanan' : 'Per Jam'}",${emp.gaji_per_jam || 0},${emp.gaji_bulanan || 0},${item.daysPresent},${item.totalRegularHours.toFixed(1)},${item.totalLemburHours.toFixed(1)},${item.totalRegPay.toFixed(0)},${item.totalLemburPay.toFixed(0)},${item.totalDryerBonus},${item.grandTotalSalary}\n`;
        });

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Master_Payroll_Hadir162_${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('File CSV master payroll berhasil diunduh.');
    };

    const handleSeedExcelData = async () => {
        const toastId = toast.loading('Sedang menginisialisasi data karyawan & log absensi dari Excel...');
        try {
            // 1. Seed Users
            const sampleUsers = [
                {
                    id: 'wa-0816200001',
                    payload: {
                        waNumber: '0816200001',
                        nama: 'ASMA',
                        divisi: '162',
                        jabatan: 'ADMIN',
                        role: 'karyawan',
                        password: '123456',
                        assignedOfficeId: 'all',
                        gaji_type: 'per_bulan',
                        gaji_bulanan: 3000000,
                        gaji_per_jam: 0,
                        gaji_lembur_per_jam: 16000,
                        bonus_dryer_1: false
                    }
                },
                {
                    id: 'wa-0816200002',
                    payload: {
                        waNumber: '0816200002',
                        nama: 'JUNED',
                        divisi: '162',
                        jabatan: 'OPERATOR',
                        role: 'karyawan',
                        password: '123456',
                        assignedOfficeId: 'all',
                        gaji_type: 'per_bulan',
                        gaji_bulanan: 2800000,
                        gaji_per_jam: 0,
                        gaji_lembur_per_jam: 15000,
                        bonus_dryer_1: false
                    }
                },
                {
                    id: 'wa-0816200003',
                    payload: {
                        waNumber: '0816200003',
                        nama: 'ABI',
                        divisi: '162',
                        jabatan: 'OPERATOR',
                        role: 'karyawan',
                        password: '123456',
                        assignedOfficeId: 'all',
                        gaji_type: 'per_jam',
                        gaji_bulanan: 0,
                        gaji_per_jam: 13000,
                        gaji_lembur_per_jam: 14000,
                        bonus_dryer_1: true
                    }
                },
                {
                    id: 'wa-0816200004',
                    payload: {
                        waNumber: '0816200004',
                        nama: 'JUMA',
                        divisi: '162',
                        jabatan: 'PENGAWAS GUD',
                        role: 'karyawan',
                        password: '123456',
                        assignedOfficeId: 'all',
                        gaji_type: 'per_jam',
                        gaji_bulanan: 0,
                        gaji_per_jam: 14000,
                        gaji_lembur_per_jam: 14000,
                        bonus_dryer_1: false
                    }
                },
                {
                    id: 'wa-0816200005',
                    payload: {
                        waNumber: '0816200005',
                        nama: 'PUNDU',
                        divisi: '162',
                        jabatan: 'OPERATOR',
                        role: 'karyawan',
                        password: '123456',
                        assignedOfficeId: 'all',
                        gaji_type: 'per_jam',
                        gaji_bulanan: 0,
                        gaji_per_jam: 10000,
                        gaji_lembur_per_jam: 14000,
                        bonus_dryer_1: false
                    }
                }
            ];

            for (const u of sampleUsers) {
                await setDoc(doc(db, 'users', u.id), u.payload, { merge: true });
            }

            // 2. Seed Attendance Records
            const sampleAttendance = [
                // Juma (2026-06-29) - Regular Shift
                {
                    id: 'seed-juma-reg-29',
                    payload: {
                        user_id: 'wa-0816200004',
                        tanggal: '2026-06-29',
                        jam_masuk: '08:00',
                        jam_pulang: '18:00',
                        istirahat: 1,
                        status: 'Hadir',
                        is_lembur: false,
                        dryer_menyala: false,
                        alamat_masuk: 'US Bilibili 162 Head Office',
                        latitude_masuk: -6.200000,
                        longitude_masuk: 106.816666
                    }
                },
                // Juma (2026-06-29) - Lembur Shift
                {
                    id: 'seed-juma-lembur-29',
                    payload: {
                        user_id: 'wa-0816200004',
                        tanggal: '2026-06-29',
                        jam_masuk: '18:00',
                        jam_pulang: '23:00',
                        istirahat: 2,
                        status: 'Hadir',
                        is_lembur: true,
                        dryer_menyala: false,
                        alamat_masuk: 'US Bilibili 162 Head Office',
                        latitude_masuk: -6.200000,
                        longitude_masuk: 106.816666
                    }
                },
                // Abi (2026-07-01) - Regular Shift
                {
                    id: 'seed-abi-reg-01',
                    payload: {
                        user_id: 'wa-0816200003',
                        tanggal: '2026-07-01',
                        jam_masuk: '07:00',
                        jam_pulang: '18:00',
                        istirahat: 1,
                        status: 'Hadir',
                        is_lembur: false,
                        dryer_menyala: true,
                        alamat_masuk: 'US Bilibili 162 Head Office',
                        latitude_masuk: -6.200000,
                        longitude_masuk: 106.816666
                    }
                },
                // Abi (2026-07-01) - Lembur Shift
                {
                    id: 'seed-abi-lembur-01',
                    payload: {
                        user_id: 'wa-0816200003',
                        tanggal: '2026-07-01',
                        jam_masuk: '18:00',
                        jam_pulang: '23:00',
                        istirahat: 2,
                        status: 'Hadir',
                        is_lembur: true,
                        dryer_menyala: false,
                        alamat_masuk: 'US Bilibili 162 Head Office',
                        latitude_masuk: -6.200000,
                        longitude_masuk: 106.816666
                    }
                },
                // Pundu (2026-07-01) - Regular Shift
                {
                    id: 'seed-pundu-reg-01',
                    payload: {
                        user_id: 'wa-0816200005',
                        tanggal: '2026-07-01',
                        jam_masuk: '08:00',
                        jam_pulang: '17:00',
                        istirahat: 1,
                        status: 'Hadir',
                        is_lembur: false,
                        dryer_menyala: false,
                        alamat_masuk: 'US Bilibili 162 Head Office',
                        latitude_masuk: -6.200000,
                        longitude_masuk: 106.816666
                    }
                },
                // Asma (2026-07-01) - Lembur Shift
                {
                    id: 'seed-asma-lembur-01',
                    payload: {
                        user_id: 'wa-0816200001',
                        tanggal: '2026-07-01',
                        jam_masuk: '18:00',
                        jam_pulang: '22:00',
                        istirahat: 0,
                        status: 'Hadir',
                        is_lembur: true,
                        dryer_menyala: false,
                        alamat_masuk: 'US Bilibili 162 Head Office',
                        latitude_masuk: -6.200000,
                        longitude_masuk: 106.816666
                    }
                },
                // Juned (2026-07-01) - Lembur Shift
                {
                    id: 'seed-juned-lembur-01',
                    payload: {
                        user_id: 'wa-0816200002',
                        tanggal: '2026-07-01',
                        jam_masuk: '17:00',
                        jam_pulang: '24:00',
                        istirahat: 0,
                        status: 'Hadir',
                        is_lembur: true,
                        dryer_menyala: false,
                        alamat_masuk: 'US Bilibili 162 Head Office',
                        latitude_masuk: -6.200000,
                        longitude_masuk: 106.816666
                    }
                }
            ];

            for (const att of sampleAttendance) {
                await setDoc(doc(db, 'attendance', att.id), att.payload, { merge: true });
            }

            toast.success('Inisialisasi Data Excel Berhasil! 5 Karyawan dan 7 Log Absensi berhasil ditambahkan.', { id: toastId });
        } catch (error: any) {
            console.error('Error seeding data:', error);
            toast.error(error.message || 'Gagal menginisialisasi data Excel', { id: toastId });
        }
    };

    const handlePrintSingleSlip = (payroll: any) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('Gagal membuka jendela cetak. Pastikan pop-up diperbolehkan.');
            return;
        }

        const emp = payroll.employee;
        const currentMonthName = format(new Date(selectedMonth + "-02"), 'MMMM yyyy', { locale: id });
        
        const isJunedPrint = emp.nama?.toLowerCase().includes('juned') || false;
        const isAsmaPrint = emp.nama?.toLowerCase().includes('asma') || false;
        const printLemburRate = isJunedPrint ? 15000 : (isAsmaPrint ? 16000 : (emp.gaji_lembur_per_jam || 14000));

        printWindow.document.write(`
            <html>
            <head>
                <title>Slip Gaji - ${emp.nama}</title>
                <style>
                    body {
                        font-family: 'Courier New', Courier, monospace;
                        padding: 40px;
                        color: #000;
                        background: #fff;
                        max-width: 800px;
                        margin: auto;
                    }
                    .header {
                        text-align: center;
                        border-bottom: 2px dashed #000;
                        padding-bottom: 20px;
                        margin-bottom: 25px;
                    }
                    .company-name {
                        font-size: 20px;
                        font-weight: bold;
                    }
                    .title {
                        font-size: 16px;
                        margin-top: 5px;
                    }
                    .meta-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        margin-bottom: 20px;
                        font-size: 13px;
                    }
                    .table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 15px;
                        margin-bottom: 25px;
                    }
                    .table th, .table td {
                        padding: 8px;
                        text-align: left;
                        border-bottom: 1px dashed #000;
                        font-size: 13px;
                    }
                    .table th {
                        font-weight: bold;
                    }
                    .total-box {
                        border-top: 2px dashed #000;
                        border-bottom: 2px dashed #000;
                        padding: 15px 10px;
                        font-size: 15px;
                        font-weight: bold;
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 30px;
                    }
                    .footer-sig {
                        display: flex;
                        justify-content: space-between;
                        margin-top: 50px;
                        font-size: 13px;
                    }
                    .sig-space {
                        height: 70px;
                    }
                    @media print {
                        body { padding: 10px; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-name">HADIR 162 - LAUNDRY & DRYING SERVICES</div>
                    <div class="title">SLIP GAJI RESMI KARYAWAN</div>
                    <div style="font-size: 12px; margin-top: 4px;">Periode Pembayaran: \${currentMonthName}</div>
                </div>

                <div class="meta-grid">
                    <div>
                        <strong>Nama Karyawan :</strong> \${emp.nama}<br>
                        <strong>Jabatan       :</strong> \${emp.jabatan || '-'}<br>
                        <strong>Divisi        :</strong> \${emp.divisi || '-'}
                    </div>
                    <div style="text-align: right;">
                        <strong>Sistem Gaji   :</strong> \${emp.gaji_type === 'per_bulan' ? 'Bulanan' : 'Per Jam'}<br>
                        <strong>Hari Hadir    :</strong> \${payroll.daysPresent} Hari<br>
                        <strong>Status Gaji   :</strong> <span style="font-weight: bold; text-transform: uppercase; color: \${payroll.status === 'paid' ? '#059669' : payroll.status === 'approved' ? '#2563eb' : '#6b7280'}">\${payroll.status || 'draft'}</span><br>
                        <strong>Tanggal Cetak :</strong> \${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}
                    </div>
                </div>

                <h3>Rincian Perhitungan Upah</h3>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Komponen Gaji</th>
                            <th>Kuantitas / Tarif</th>
                            <th style="text-align: right;">Jumlah</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${emp.gaji_type === 'per_bulan' ? \`
                            <tr>
                                <td>Gaji Pokok Bulanan</td>
                                <td>Fixed (1 Bulan)</td>
                                <td style="text-align: right;">Rp \${emp.gaji_bulanan.toLocaleString('id-ID')}</td>
                            </tr>
                        \` : \`
                            <tr>
                                <td>Gaji Kerja Reguler</td>
                                <td>\${payroll.totalRegularHours.toFixed(1)} Jam × Rp \${(emp.gaji_per_jam || 14000).toLocaleString('id-ID')}/jam</td>
                                <td style="text-align: right;">Rp \${payroll.totalRegPay.toLocaleString('id-ID')}</td>
                            </tr>
                        \`}
                        <tr>
                            <td>Uang Lembur (Overtime)</td>
                            <td>\${payroll.totalLemburHours.toFixed(1)} Jam × Rp \${printLemburRate.toLocaleString('id-ID')}/jam</td>
                            <td style="text-align: right;">Rp \${payroll.totalLemburPay.toLocaleString('id-ID')}</td>
                        </tr>
                        \${emp.bonus_dryer_1 ? \`
                            <tr>
                                <td>Insentif Bonus Dryer 1 Aktif</td>
                                <td>Hadir Dryer 1 Menyala</td>
                                <td style="text-align: right;">Rp \${payroll.totalDryerBonus.toLocaleString('id-ID')}</td>
                            </tr>
                        \` : ''}
                        \${payroll.tunjangan_makan ? \`
                            <tr>
                                <td>Tunjangan Makan</td>
                                <td>Penyesuaian Bulanan</td>
                                <td style="text-align: right; color: #059669;">+Rp \${payroll.tunjangan_makan.toLocaleString('id-ID')}</td>
                            </tr>
                        \` : ''}
                        \${payroll.tunjangan_jabatan ? \`
                            <tr>
                                <td>Tunjangan Jabatan</td>
                                <td>Penyesuaian Bulanan</td>
                                <td style="text-align: right; color: #059669;">+Rp \${payroll.tunjangan_jabatan.toLocaleString('id-ID')}</td>
                            </tr>
                        \` : ''}
                        \${payroll.tunjangan_transport ? \`
                            <tr>
                                <td>Tunjangan Transport</td>
                                <td>Penyesuaian Bulanan</td>
                                <td style="text-align: right; color: #059669;">+Rp \${payroll.tunjangan_transport.toLocaleString('id-ID')}</td>
                            </tr>
                        \` : ''}
                        \${payroll.potongan_kasbon ? \`
                            <tr>
                                <td>Potongan Kasbon / Pinjaman</td>
                                <td>Penyesuaian Bulanan</td>
                                <td style="text-align: right; color: #dc2626;">-Rp \${payroll.potongan_kasbon.toLocaleString('id-ID')}</td>
                            </tr>
                        \` : ''}
                        \${payroll.potongan_bpjs ? \`
                            <tr>
                                <td>Potongan BPJS</td>
                                <td>Penyesuaian Bulanan</td>
                                <td style="text-align: right; color: #dc2626;">-Rp \${payroll.potongan_bpjs.toLocaleString('id-ID')}</td>
                            </tr>
                        \` : ''}
                        \${payroll.potongan_lain ? \`
                            <tr>
                                <td>Potongan Lain-lain</td>
                                <td>Penyesuaian Bulanan</td>
                                <td style="text-align: right; color: #dc2626;">-Rp \${payroll.potongan_lain.toLocaleString('id-ID')}</td>
                            </tr>
                        \` : ''}
                    </tbody>
                </table>

                <div class="total-box">
                    <span>TOTAL GAJI DITERIMA (TAKE HOME PAY)</span>
                    <span>Rp \${payroll.grandTotalSalary.toLocaleString('id-ID')}</span>
                </div>

                \${payroll.catatan ? \`
                    <div style="font-size: 11px; margin-top: 15px; margin-bottom: 25px; border: 1px dashed #000; padding: 10px; background: #fafafa; border-radius: 4px;">
                        <strong>Catatan Slip:</strong> \${payroll.catatan}
                    </div>
                \` : ''}

                <div class="footer-sig">
                    <div style="text-align: center; width: 200px;">
                        Penerima,<br><br>
                        <div class="sig-space"></div>
                        ( ____________________ )<br>
                        \${emp.nama}
                    </div>
                    <div style="text-align: center; width: 200px;">
                        Mengetahui,<br>
                        Manajer Keuangan / Admin<br>
                        <div class="sig-space"></div>
                        ( ____________________ )<br>
                        Hadir 162 Admin
                    </div>
                </div>

                <script>
                    window.onload = function() {
                        window.print();
                    }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="space-y-6">
            <style>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #print-daily-area, #print-daily-area * {
                        visibility: visible;
                    }
                    #print-daily-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        background: white !important;
                        color: black !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>

            {/* Subtab Selector */}
            <div className="flex border-b border-slate-200 no-print">
                <button
                    onClick={() => setActiveSubTab('harian')}
                    className={`px-5 py-3 border-b-2 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                        activeSubTab === 'harian'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <Users size={15} />
                    <span>Presensi Harian</span>
                </button>
                <button
                    onClick={() => setActiveSubTab('bulanan')}
                    className={`px-5 py-3 border-b-2 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                        activeSubTab === 'bulanan'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <Sparkles size={15} />
                    <span>Laporan & Ringkasan AI Bulanan</span>
                </button>
                <button
                    onClick={() => setActiveSubTab('gaji')}
                    className={`px-5 py-3 border-b-2 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                        activeSubTab === 'gaji'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <span className="text-xs">💰</span>
                    <span>Payroll & Gaji</span>
                </button>
            </div>

            {activeSubTab === 'harian' ? (
                <>
                    <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 no-print">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800">Monitor Absensi</h3>
                            <p className="text-xs text-slate-500 mt-1">Kelola dan pantau ketepatan waktu, foto selfie, serta lokasi absen harian karyawan.</p>
                        </div>
                
                {/* Admin Export Actions */}
                <div className="flex flex-wrap gap-2">
                    <label 
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all text-xs cursor-pointer"
                        title="Unggah foto lembar presensi, logbook, atau tabel kehadiran untuk diimpor otomatis oleh AI"
                    >
                        <Sparkles size={14} className={isExtracting ? "animate-spin" : ""} />
                        <span>{isExtracting ? "Memproses AI..." : "Impor Absen (AI)"}</span>
                        <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleAIAttendanceUpload} 
                            disabled={isExtracting}
                            className="hidden" 
                        />
                    </label>
                    <button
                        onClick={handlePrintDaily}
                        disabled={displayedAttendance.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl border border-slate-200 shadow-sm transition-all text-xs disabled:opacity-50 cursor-pointer"
                    >
                        <Printer size={14} />
                        <span>Cetak Harian</span>
                    </button>
                    <button
                        onClick={handleExportAdminCSV}
                        disabled={displayedAttendance.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all text-xs disabled:opacity-50 cursor-pointer"
                    >
                        <Download size={14} />
                        <span>Ekspor CSV</span>
                    </button>
                    <button
                        onClick={() => { setShowAIReportModal(true); setGeneratedReport(null); }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all text-xs cursor-pointer font-bold"
                        title="Hasilkan Laporan Absensi Mingguan/Bulanan terformat rapi dengan dukungan AI"
                    >
                        <Sparkles size={14} className="text-white" />
                        <span>Laporan AI (PDF/Excel)</span>
                    </button>
                </div>
            </div>

            {/* Interactive Statistics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card Total */}
                <button
                    onClick={() => setStatusFilter('all')}
                    className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
                        statusFilter === 'all'
                            ? 'bg-blue-50/60 border-blue-200 ring-2 ring-blue-500/20 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Absen</span>
                        <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg">
                            <Users size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-slate-800">{totalCount}</span>
                        <span className="text-[10px] text-slate-400 font-medium">Orang</span>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                        <span>Klik untuk melihat semua</span>
                    </div>
                </button>

                {/* Card Hadir */}
                <button
                    onClick={() => setStatusFilter(statusFilter === 'Hadir' ? 'all' : 'Hadir')}
                    className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
                        statusFilter === 'Hadir'
                            ? 'bg-emerald-50/60 border-emerald-200 ring-2 ring-emerald-500/20 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Tepat Waktu</span>
                        <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                            <CheckCircle2 size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-emerald-700">{hadirCount}</span>
                        <span className="text-[10px] text-emerald-500 font-medium">Hadir</span>
                    </div>
                    <div className="mt-2 text-[10px] text-emerald-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>{statusFilter === 'Hadir' ? 'Filter Aktif' : 'Klik untuk memfilter'}</span>
                    </div>
                </button>

                {/* Card Terlambat */}
                <button
                    onClick={() => setStatusFilter(statusFilter === 'Terlambat' ? 'all' : 'Terlambat')}
                    className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
                        statusFilter === 'Terlambat'
                            ? 'bg-rose-50/60 border-rose-200 ring-2 ring-rose-500/20 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Terlambat</span>
                        <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                            <Clock size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-rose-700">{terlambatCount}</span>
                        <span className="text-[10px] text-rose-500 font-medium">Orang</span>
                    </div>
                    <div className="mt-2 text-[10px] text-rose-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        <span>{statusFilter === 'Terlambat' ? 'Filter Aktif' : 'Klik untuk memfilter'}</span>
                    </div>
                </button>

                {/* Card Izin/Sakit/Alpa */}
                <button
                    onClick={() => setStatusFilter(statusFilter === 'absen' ? 'all' : 'absen')}
                    className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
                        statusFilter === 'absen'
                            ? 'bg-amber-50/60 border-amber-200 ring-2 ring-amber-500/20 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Izin / Sakit / Alpa</span>
                        <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                            <AlertTriangle size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-amber-700">{absenCount}</span>
                        <span className="text-[10px] text-amber-500 font-medium">Ketidakhadiran</span>
                    </div>
                    <div className="mt-2 text-[10px] text-amber-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        <span>{statusFilter === 'absen' ? 'Filter Aktif' : 'Klik untuk memfilter'}</span>
                    </div>
                </button>
            </div>
            
            {/* Filter and Search Bar */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Search Field */}
                    <div className="relative">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Cari Karyawan</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Masukkan nama karyawan..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                            />
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Date Selector */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Tanggal Absensi</label>
                            <div className="flex items-center gap-1 text-[11px]">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFilterDate(format(new Date(), 'yyyy-MM-dd'));
                                        setFilterDateMode('single');
                                    }}
                                    className={`px-2 py-0.5 rounded-md text-xs transition-colors ${
                                        filterDateMode === 'single' && filterDate === format(new Date(), 'yyyy-MM-dd')
                                            ? 'bg-blue-600 text-white font-medium'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    Hari Ini
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const y = new Date();
                                        y.setDate(y.getDate() - 1);
                                        setFilterDate(format(y, 'yyyy-MM-dd'));
                                        setFilterDateMode('single');
                                    }}
                                    className={`px-2 py-0.5 rounded-md text-xs transition-colors ${
                                        filterDateMode === 'single' && filterDate === format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')
                                            ? 'bg-blue-600 text-white font-medium'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    Kemarin
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFilterDateMode('all')}
                                    className={`px-2 py-0.5 rounded-md text-xs transition-colors ${
                                        filterDateMode === 'all'
                                            ? 'bg-blue-600 text-white font-medium'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    Semua Tanggal
                                </button>
                            </div>
                        </div>
                        {filterDateMode === 'all' ? (
                            <div className="w-full px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm font-semibold text-blue-700 flex items-center justify-between">
                                <span>Menampilkan Semua Tanggal Presensi</span>
                                <button 
                                    onClick={() => setFilterDateMode('single')} 
                                    className="text-xs text-blue-600 underline font-normal hover:text-blue-800"
                                >
                                    Pilih Tanggal Spesifik
                                </button>
                            </div>
                        ) : (
                            <input 
                                type="date" 
                                value={filterDate} 
                                onChange={e => {
                                    setFilterDate(e.target.value);
                                    setFilterDateMode('single');
                                }} 
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700" 
                            />
                        )}
                    </div>

                    {/* Division Selector */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Divisi</label>
                        <select 
                            value={filterDivisi} 
                            onChange={e => setFilterDivisi(e.target.value)} 
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 bg-white"
                        >
                            <option value="">Semua Divisi</option>
                            {divisiList.map(div => <option key={div} value={div}>{div}</option>)}
                        </select>
                    </div>
                </div>

                {/* Filter badges indicator */}
                {(statusFilter !== 'all' || searchQuery || filterDivisi) && (
                    <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-slate-100">
                        <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
                            <Filter size={12} />
                            Filter Aktif:
                        </span>
                        
                        {searchQuery && (
                            <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-slate-200">
                                Nama: &quot;{searchQuery}&quot;
                                <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                            </span>
                        )}

                        {statusFilter !== 'all' && (
                            <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-blue-200 font-medium">
                                Status: {statusFilter === 'absen' ? 'Izin / Sakit / Alpa' : statusFilter}
                                <button onClick={() => setStatusFilter('all')} className="text-blue-400 hover:text-blue-600"><X size={12} /></button>
                            </span>
                        )}

                        {filterDivisi && (
                            <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-indigo-200 font-medium">
                                Divisi: {filterDivisi}
                                <button onClick={() => setFilterDivisi('')} className="text-indigo-400 hover:text-indigo-600"><X size={12} /></button>
                            </span>
                        )}

                        <button 
                            onClick={() => { setSearchQuery(''); setStatusFilter('all'); setFilterDivisi(''); }}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline ml-auto font-medium"
                        >
                            Reset Semua Filter
                        </button>
                    </div>
                )}
            </div>

            {/* Attendance Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px]">Karyawan</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[110px]">Divisi</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Jam Masuk</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Jam Pulang</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Lokasi Presensi</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Foto Selfie</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center space-y-2">
                                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-sm font-medium">Memuat data absensi...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : displayedAttendance.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-slate-500">
                                        <div className="max-w-md mx-auto space-y-2">
                                            <p className="font-bold text-slate-700">Tidak ada data absensi</p>
                                            <p className="text-xs text-slate-400">
                                                {attendance.length === 0 
                                                    ? 'Belum ada data presensi yang masuk pada tanggal terpilih.' 
                                                    : 'Tidak ada data presensi yang cocok dengan filter aktif Anda.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                displayedAttendance
                                    .slice((pageHarian - 1) * limitHarian, pageHarian * limitHarian)
                                    .map(item => {
                                    const user = usersMap[item.user_id] || {};
                                    
                                    // Beautiful status colors
                                    const getStatusStyles = (status: string) => {
                                        switch (status) {
                                            case 'Hadir':
                                                return 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                            case 'Terlambat':
                                                return 'bg-rose-50 text-rose-700 border-rose-100';
                                            case 'Izin':
                                                return 'bg-amber-50 text-amber-700 border-amber-100';
                                            case 'Sakit':
                                                return 'bg-sky-50 text-sky-700 border-sky-100';
                                            case 'Alpa':
                                                return 'bg-slate-100 text-slate-700 border-slate-200';
                                            default:
                                                return 'bg-slate-50 text-slate-600 border-slate-100';
                                        }
                                    };

                                    return (
                                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-semibold text-slate-800 text-sm">{user.nama || item.nama || 'Karyawan'}</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">UID: {item.user_id?.substring(0, 8)}...</div>
                                            </td>
                                            <td className="p-4 text-sm">
                                                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                                                    {user.divisi || item.divisi || '-'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-sm font-mono font-medium text-slate-600">
                                                {item.jam_masuk ? (
                                                    <span className="text-slate-700">{item.jam_masuk}</span>
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-sm font-mono font-medium text-slate-600">
                                                {hasVerifiedCheckout(item) ? (
                                                    <span className="text-slate-700">{item.jam_pulang}</span>
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex flex-col items-center justify-center gap-1">
                                                    {item.latitude_masuk ? (
                                                        <button 
                                                            onClick={() => handleOpenMap(item.latitude_masuk, item.longitude_masuk)} 
                                                            className="w-9 h-9 flex items-center justify-center text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded-xl border border-slate-100 shadow-sm transition-all" 
                                                            title={item.alamat_masuk || "Buka Lokasi di Google Maps"}
                                                        >
                                                            <MapPin size={16} />
                                                        </button>
                                                    ) : (
                                                        <span className="text-slate-300 text-xs">-</span>
                                                    )}
                                                    {item.alamat_masuk && (
                                                        <span 
                                                            className="text-[9px] text-slate-400 max-w-[120px] truncate block hover:text-slate-600" 
                                                            title={item.alamat_masuk}
                                                        >
                                                            {item.alamat_masuk}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center gap-1.5">
                                                    {item.selfie_masuk ? (
                                                        <button 
                                                            onClick={() => setViewPhoto(item.selfie_masuk)} 
                                                            className="w-9 h-9 inline-flex items-center justify-center text-indigo-600 hover:bg-indigo-50 rounded-xl border border-slate-100 shadow-sm transition-all" 
                                                            title="Selfie Masuk"
                                                        >
                                                            <ImageIcon size={15} />
                                                        </button>
                                                    ) : null}
                                                    {item.selfie_pulang ? (
                                                        <button 
                                                            onClick={() => setViewPhoto(item.selfie_pulang)} 
                                                            className="w-9 h-9 inline-flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-xl border border-slate-100 shadow-sm transition-all" 
                                                            title="Selfie Pulang"
                                                        >
                                                            <ImageIcon size={15} />
                                                        </button>
                                                    ) : null}
                                                    {!item.selfie_masuk && !item.selfie_pulang && (
                                                        <span className="text-slate-300 text-xs">-</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm">
                                                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${getStatusStyles(item.status || 'Hadir')}`}>
                                                    {item.status || 'Hadir'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex justify-end gap-1.5">
                                                    <button 
                                                        onClick={() => handleEdit(item)} 
                                                        className="w-9 h-9 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                        title="Edit Absensi"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button 
                                                        onClick={() => setDeleteId(item.id)} 
                                                        className="w-9 h-9 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg border border-slate-100 shadow-sm transition-colors"
                                                        title="Hapus Absensi"
                                                    >
                                                        <Trash2 size={14} />
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

                {/* Mobile & Tablet Card View */}
                <div className="block md:hidden divide-y divide-slate-100">
                    {loading ? (
                        <div className="p-6 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center space-y-2">
                                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-xs font-medium text-slate-500">Memuat data absensi...</span>
                            </div>
                        </div>
                    ) : displayedAttendance.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                            <div className="max-w-md mx-auto space-y-2">
                                <p className="font-bold text-slate-700">Tidak ada data absensi</p>
                                <p className="text-xs text-slate-400">
                                    {attendance.length === 0 
                                        ? 'Belum ada data presensi yang masuk pada tanggal terpilih.' 
                                        : 'Tidak ada data presensi yang cocok dengan filter aktif Anda.'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        displayedAttendance
                            .slice((pageHarian - 1) * limitHarian, pageHarian * limitHarian)
                            .map(item => {
                            const user = usersMap[item.user_id] || {};
                            
                            const getStatusStyles = (status: string) => {
                                switch (status) {
                                    case 'Hadir':
                                        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                    case 'Terlambat':
                                        return 'bg-rose-50 text-rose-700 border-rose-100';
                                    case 'Izin':
                                        return 'bg-amber-50 text-amber-700 border-amber-100';
                                    case 'Sakit':
                                        return 'bg-sky-50 text-sky-700 border-sky-100';
                                    case 'Alpa':
                                        return 'bg-slate-100 text-slate-700 border-slate-200';
                                    default:
                                        return 'bg-slate-50 text-slate-600 border-slate-100';
                                }
                            };

                            return (
                                <div key={item.id} className="p-4 flex flex-col space-y-3 hover:bg-slate-50/50 transition-all">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-sm">{user.nama || item.nama || 'Karyawan'}</h4>
                                            <span className="text-[10px] text-slate-400">UID: {item.user_id?.substring(0, 10)}</span>
                                        </div>
                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${getStatusStyles(item.status || 'Hadir')}`}>
                                            {item.status || 'Hadir'}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100/70 text-xs">
                                        <div>
                                            <span className="text-[9px] text-slate-400 block font-semibold uppercase tracking-wider">Divisi</span>
                                            <span className="font-semibold text-slate-700 mt-0.5 block">{user.divisi || '-'}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] text-slate-400 block font-semibold uppercase tracking-wider">Jam Masuk</span>
                                            <span className="font-mono font-bold text-slate-700 mt-0.5 block">{item.jam_masuk || '-'}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] text-slate-400 block font-semibold uppercase tracking-wider">Jam Pulang</span>
                                            <span className="font-mono font-bold text-slate-700 mt-0.5 block">{getEffectiveCheckoutTime(item) || '-'}</span>
                                        </div>
                                    </div>

                                    {item.alamat_masuk && (
                                        <div className="flex items-start gap-1.5 text-xs text-slate-500 bg-blue-50/40 p-2 rounded-lg border border-blue-100/30">
                                            <MapPin size={13} className="text-blue-500 shrink-0 mt-0.5" />
                                            <span className="leading-normal">{item.alamat_masuk}</span>
                                        </div>
                                    )}

                                    <div className="flex justify-between items-center text-xs pt-1">
                                        <div className="flex items-center gap-1.5">
                                            {item.selfie_masuk && (
                                                <button onClick={() => setViewPhoto(item.selfie_masuk)} className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded border border-indigo-100 text-[10px] font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1">
                                                    <ImageIcon size={10} />
                                                    <span>Selfie Masuk</span>
                                                </button>
                                            )}
                                            {item.selfie_pulang && (
                                                <button onClick={() => setViewPhoto(item.selfie_pulang)} className="px-2 py-1 bg-teal-50 text-teal-600 rounded border border-teal-100 text-[10px] font-bold hover:bg-teal-100 transition-colors flex items-center gap-1">
                                                    <ImageIcon size={10} />
                                                    <span>Selfie Pulang</span>
                                                </button>
                                            )}
                                            {item.latitude_masuk && !item.alamat_masuk && (
                                                <button onClick={() => handleOpenMap(item.latitude_masuk, item.longitude_masuk)} className="px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-100 text-[10px] font-bold hover:bg-blue-100 transition-colors flex items-center gap-1">
                                                    <MapPin size={10} />
                                                    <span>Buka Peta</span>
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleEdit(item)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" title="Edit"><Edit2 size={13} /></button>
                                            <button onClick={() => setDeleteId(item.id)} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors" title="Hapus"><Trash2 size={13} /></button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Pagination Footer */}
                {renderPaginationBar(
                    pageHarian,
                    Math.ceil(displayedAttendance.length / limitHarian) || 1,
                    displayedAttendance.length,
                    limitHarian,
                    setPageHarian,
                    setLimitHarian,
                    "Presensi"
                )}
            </div>
            </>
            ) : activeSubTab === 'bulanan' ? (
                <div className="space-y-6 no-print">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm">
                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                            <div>
                                <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Hadir 162 • Sistem Laporan AI</span>
                                <h3 className="text-2xl font-black text-slate-800 mt-1 font-sans">Laporan Bulanan & Ringkasan Eksekutif AI</h3>
                                <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                                    Unduh rekap bulanan dalam format CSV, cetak lembar laporan PDF, dan hasilkan ringkasan eksekutif natural language bertenaga AI secara otomatis dari data log kehadiran.
                                </p>
                            </div>
                        </div>

                        {/* Control Filters */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pilih Bulan & Tahun</label>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => {
                                        setSelectedMonth(e.target.value);
                                        setMonthlyReportData(null); // Reset when month changes
                                    }}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Saring Divisi</label>
                                <select
                                    value={selectedMonthDivisi}
                                    onChange={(e) => {
                                        setSelectedMonthDivisi(e.target.value);
                                        setMonthlyReportData(null); // Reset when division changes
                                    }}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 bg-white"
                                >
                                    <option value="">Semua Divisi</option>
                                    {divisiList.map(div => <option key={div} value={div}>{div}</option>)}
                                </select>
                            </div>
                            <div className="flex items-end">
                                <button
                                    onClick={handleGenerateMonthlyAIReport}
                                    disabled={monthlyLoading || isGeneratingMonthly || filteredMonthlyRecords.length === 0}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg active:scale-98 transition-all text-xs disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                                >
                                    <Sparkles size={15} className={isGeneratingMonthly ? "animate-spin" : ""} />
                                    <span>{isGeneratingMonthly ? "Menganalisis..." : "Hasilkan Ringkasan Eksekutif AI"}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Statistics Cards for Selected Month */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Card Total */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Kehadiran</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-slate-800">{filteredMonthlyRecords.length}</span>
                                <span className="text-[10px] text-slate-400 font-bold">LOGS</span>
                            </div>
                        </div>
                        {/* Card On-Time */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block mb-1">Tepat Waktu</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-emerald-600">
                                    {filteredMonthlyRecords.filter(r => r.status === 'Hadir').length}
                                </span>
                                <span className="text-[10px] text-emerald-400 font-bold">KALI</span>
                            </div>
                        </div>
                        {/* Card Late */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block mb-1">Terlambat</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-rose-600">
                                    {filteredMonthlyRecords.filter(r => r.status === 'Terlambat').length}
                                </span>
                                <span className="text-[10px] text-rose-400 font-bold">KALI</span>
                            </div>
                        </div>
                        {/* Card Sick/Leave */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block mb-1">Izin / Sakit / Alpa</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-amber-600">
                                    {filteredMonthlyRecords.filter(r => ['Izin', 'Sakit', 'Alpa'].includes(r.status)).length}
                                </span>
                                <span className="text-[10px] text-amber-400 font-bold">KALI</span>
                            </div>
                        </div>
                    </div>

                    {/* Main Content Pane */}
                    {monthlyLoading ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                            <div className="flex flex-col items-center justify-center space-y-3">
                                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-sm font-semibold text-slate-500">Memuat rekap data kehadiran bulan ini...</p>
                            </div>
                        </div>
                    ) : filteredMonthlyRecords.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                            <p className="font-bold text-slate-700 text-base">Tidak ada data kehadiran</p>
                            <p className="text-xs text-slate-400 mt-1">Belum ada log kehadiran terekam untuk rentang saringan di bulan ini.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Executive Summary Column */}
                            <div className="lg:col-span-7 space-y-6">
                                <div className="bg-gradient-to-br from-slate-900 to-slate-850 text-white rounded-2xl p-6 shadow-md border border-slate-800 relative overflow-hidden flex flex-col justify-between min-h-[400px]">
                                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                                        <Sparkles size={160} />
                                    </div>
                                    
                                    <div>
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
                                                <Sparkles size={16} />
                                            </div>
                                            <span className="text-xs font-extrabold text-blue-400 uppercase tracking-widest">Ringkasan Eksekutif AI</span>
                                        </div>

                                        {monthlyReportData ? (
                                            <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                                                <div className="bg-white/5 rounded-xl p-4 border border-white/10 mb-4 flex items-center justify-between">
                                                    <div>
                                                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">Kepatuhan Bulanan</span>
                                                        <span className="text-lg font-black text-emerald-400">{monthlyReportData.summary?.complianceRate || "0%"}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">Tepat Waktu vs Terlambat</span>
                                                        <span className="text-sm font-bold text-white">
                                                            {monthlyReportData.summary?.totalOnTime || 0} / {monthlyReportData.summary?.totalLate || 0}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="prose prose-invert max-w-none text-slate-200">
                                                    {(monthlyReportData.summary?.summaryComments || "")
                                                        .split('\n')
                                                        .map((line: string, i: number) => {
                                                            if (!line.trim()) return <div key={i} className="h-2"></div>;
                                                            return <p key={i} className="mb-2 text-xs md:text-sm">{line}</p>;
                                                        })
                                                    }
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="py-12 text-center text-slate-400 space-y-4">
                                                <p className="text-sm">Ringkasan Eksekutif AI belum dihasilkan untuk kriteria saringan di bulan ini.</p>
                                                <p className="text-xs text-slate-500">Klik tombol &quot;Hasilkan Ringkasan Eksekutif AI&quot; di atas untuk memulai analisis cerdas.</p>
                                            </div>
                                        )}
                                    </div>

                                    {monthlyReportData && (
                                        <div className="border-t border-white/10 pt-4 mt-6 flex flex-wrap gap-2 justify-end">
                                            <button
                                                onClick={handlePrintMonthlyReport}
                                                className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
                                            >
                                                <Printer size={13} />
                                                <span>Cetak Laporan (PDF)</span>
                                            </button>
                                            <button
                                                onClick={handleDownloadMonthlyCSV}
                                                className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-blue-500/20"
                                            >
                                                <Download size={13} />
                                                <span>Ekspor Laporan (CSV)</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Printable preview Column */}
                            <div className="lg:col-span-5">
                                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                                            <Printer size={13} className="text-slate-400" /> Pratinjau Cetak Laporan
                                        </h4>
                                        <button 
                                            onClick={handleExportMonthlyCSV}
                                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-all cursor-pointer"
                                        >
                                            Ekspor CSV Mentah
                                        </button>
                                    </div>
                                    
                                    {monthlyReportData && monthlyReportData.htmlReport ? (
                                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 shadow-inner max-h-[500px] overflow-y-auto">
                                            <div className="p-4 bg-white scale-95 origin-top transform">
                                                <div 
                                                    className="text-xs text-slate-800 pointer-events-none"
                                                    dangerouslySetInnerHTML={{ __html: monthlyReportData.htmlReport }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400">
                                            <p className="text-xs font-semibold">Pratinjau lembar cetak siap-pakai akan muncul di sini setelah AI menyelesaikan penyusunan analisis.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* activeSubTab === 'gaji' */
                <div className="space-y-6 no-print">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm">
                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                            <div className="space-y-3">
                                <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Hadir 162 • Sistem Payroll & Penggajian</span>
                                <h3 className="text-2xl font-black text-slate-800 mt-1 font-sans">Kalkulator & Payroll Gaji Karyawan</h3>
                                <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                                    Hitung upah kerja reguler, uang lembur, dan insentif bonus dryer secara otomatis berdasarkan log kehadiran, lama istirahat, dan pengaturan gaji karyawan.
                                </p>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-800 max-w-2xl">
                                    <span className="font-extrabold shrink-0 bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider">Note</span>
                                    <p className="font-semibold leading-relaxed">
                                        JAM MASUK OPERATOR TIDAK MENENTU TERGANTUNG MESIN YANG HARUS DIOPERASIKAN
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 self-stretch md:self-auto flex-wrap">
                                <button
                                    onClick={handleGeneratePayrollAIReport}
                                    disabled={monthlyLoading || getPayrollData().length === 0}
                                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    <Sparkles size={14} />
                                    <span>Analisis & Audit Gaji (AI)</span>
                                </button>
                                <button
                                    onClick={handleSeedExcelData}
                                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                                >
                                    <span>Inisialisasi Data Excel</span>
                                </button>
                                <button
                                    onClick={handleDownloadAllPayrollCSV}
                                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                                >
                                    <span>Ekspor Semua Gaji (CSV)</span>
                                </button>
                            </div>
                        </div>

                        {/* Filters and Search */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pilih Bulan & Tahun</label>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Saring Divisi</label>
                                <select
                                    value={selectedMonthDivisi}
                                    onChange={(e) => setSelectedMonthDivisi(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 bg-white"
                                >
                                    <option value="">Semua Divisi</option>
                                    {divisiList.map(div => <option key={div} value={div}>{div}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cari Nama / Jabatan</label>
                                <input
                                    type="text"
                                    placeholder="Cari karyawan..."
                                    value={payrollSearch}
                                    onChange={(e) => setPayrollSearch(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Payroll Overview Metric Cards */}
                    {monthlyLoading ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                            <div className="flex flex-col items-center justify-center space-y-3">
                                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-sm font-semibold text-slate-500">Memuat data payroll...</p>
                            </div>
                        </div>
                    ) : (
                        (() => {
                            const allPayrollData = getPayrollData();
                            const totalPagesGaji = Math.ceil(allPayrollData.length / limitGaji) || 1;
                            const paginatedPayrollData = allPayrollData.slice((pageGaji - 1) * limitGaji, pageGaji * limitGaji);

                            return (
                                <>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Pengeluaran Gaji</span>
                                            <span className="text-xl font-black text-slate-800">
                                                Rp {allPayrollData.reduce((acc, curr) => acc + curr.grandTotalSalary, 0).toLocaleString('id-ID')}
                                            </span>
                                        </div>
                                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Jam Kerja Biasa</span>
                                            <span className="text-xl font-black text-slate-800">
                                                {allPayrollData.reduce((acc, curr) => acc + curr.totalRegularHours, 0).toFixed(1)} Jam
                                            </span>
                                        </div>
                                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Jam Lembur</span>
                                            <span className="text-xl font-black text-slate-800">
                                                {allPayrollData.reduce((acc, curr) => acc + curr.totalLemburHours, 0).toFixed(1)} Jam
                                            </span>
                                        </div>
                                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Bonus Dryer 1</span>
                                            <span className="text-xl font-black text-slate-800">
                                                Rp {allPayrollData.reduce((acc, curr) => acc + curr.totalDryerBonus, 0).toLocaleString('id-ID')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Main Payroll Table Card */}
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Daftar Gaji Karyawan ({allPayrollData.length})</span>
                                        </div>

                                        {/* Desktop Table View */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                                                        <th className="p-4">Karyawan</th>
                                                        <th className="p-4">Sistem Kerja</th>
                                                        <th className="p-4 text-center">Kehadiran</th>
                                                        <th className="p-4 text-center">Regular (Jam)</th>
                                                        <th className="p-4 text-center">Lembur (Jam)</th>
                                                        <th className="p-4 text-right">Estimasi Gaji Bersih</th>
                                                        <th className="p-4 text-center">Aksi</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                                    {allPayrollData.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={7} className="p-12 text-center text-slate-400 font-medium">Tidak ada karyawan yang sesuai dengan saringan.</td>
                                                        </tr>
                                                    ) : (
                                                        paginatedPayrollData.map((payroll, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                                <td className="p-4">
                                                                    <div>
                                                                        <span className="font-bold text-slate-800 block">{payroll.employee.nama}</span>
                                                                        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block mt-0.5">
                                                                            {payroll.employee.jabatan || 'Karyawan'} • {payroll.employee.divisi || '-'}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="p-4">
                                                                    {payroll.employee.gaji_type === 'per_bulan' ? (
                                                                        <div>
                                                                            <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-100 font-bold rounded-full text-[10px] uppercase">Bulanan</span>
                                                                            <span className="text-[10px] text-slate-400 block mt-1">Rp {(payroll.employee.gaji_bulanan || 0).toLocaleString('id-ID')}/bln</span>
                                                                        </div>
                                                                    ) : (
                                                                        <div>
                                                                            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 font-bold rounded-full text-[10px] uppercase">Per Jam</span>
                                                                            <span className="text-[10px] text-slate-400 block mt-1">Rp {(payroll.employee.gaji_per_jam || 14000).toLocaleString('id-ID')}/jam</span>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="p-4 text-center font-bold text-slate-700">{payroll.daysPresent} Hari</td>
                                                                <td className="p-4 text-center font-semibold text-slate-600">{payroll.totalRegularHours.toFixed(1)}</td>
                                                                <td className="p-4 text-center font-semibold text-slate-600">{payroll.totalLemburHours.toFixed(1)}</td>
                                                                <td className="p-4 text-right">
                                                                    <span className="font-black text-slate-900 text-sm block">Rp {payroll.grandTotalSalary.toLocaleString('id-ID')}</span>
                                                                    <div className="flex flex-col items-end gap-0.5 mt-1">
                                                                        {payroll.status === 'paid' ? (
                                                                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 font-extrabold rounded-full text-[9px] uppercase">Dibayar</span>
                                                                        ) : payroll.status === 'approved' ? (
                                                                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 font-extrabold rounded-full text-[9px] uppercase">Disetujui</span>
                                                                        ) : (
                                                                            <span className="px-1.5 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 font-extrabold rounded-full text-[9px] uppercase">Draft</span>
                                                                        )}
                                                                        {payroll.totalTunjangan > 0 && (
                                                                            <span className="text-[9px] font-bold text-emerald-600 block">+Rp {payroll.totalTunjangan.toLocaleString('id-ID')}</span>
                                                                        )}
                                                                        {payroll.totalPotongan > 0 && (
                                                                            <span className="text-[9px] font-bold text-rose-600 block">-Rp {payroll.totalPotongan.toLocaleString('id-ID')}</span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="p-4 text-center">
                                                                    <div className="flex justify-center items-center gap-1.5 flex-wrap">
                                                                        <button
                                                                            onClick={() => setSelectedEmpPayrollDetail(payroll)}
                                                                            className="px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
                                                                        >
                                                                            Rincian
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handlePrintSingleSlip(payroll)}
                                                                            className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
                                                                        >
                                                                            Cetak Slip
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleEditPayroll(payroll)}
                                                                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-lg transition-colors cursor-pointer"
                                                                            title="Edit Gaji Karyawan"
                                                                        >
                                                                            <Edit2 size={13} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeletePayroll(payroll)}
                                                                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg transition-colors cursor-pointer"
                                                                            title="Hapus / Reset Gaji"
                                                                        >
                                                                            <Trash2 size={13} />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Mobile & Tablet Card View for Payroll */}
                                        <div className="block md:hidden divide-y divide-slate-100">
                                            {allPayrollData.length === 0 ? (
                                                <div className="p-8 text-center text-slate-400 font-medium text-xs">
                                                    Tidak ada karyawan yang sesuai dengan saringan.
                                                </div>
                                            ) : (
                                                paginatedPayrollData.map((payroll, idx) => (
                                                    <div key={idx} className="p-4 space-y-3 hover:bg-slate-50/60 transition-colors">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div>
                                                                <span className="font-bold text-slate-800 text-sm block">{payroll.employee.nama}</span>
                                                                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mt-0.5">
                                                                    {payroll.employee.jabatan || 'Karyawan'} • {payroll.employee.divisi || '-'}
                                                                </span>
                                                            </div>
                                                            {payroll.employee.gaji_type === 'per_bulan' ? (
                                                                <span className="px-2.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 font-bold rounded-full text-[10px] uppercase shrink-0">Bulanan</span>
                                                            ) : (
                                                                <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 font-bold rounded-full text-[10px] uppercase shrink-0">Per Jam</span>
                                                            )}
                                                        </div>

                                                        <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center text-xs">
                                                            <div>
                                                                <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Hadir</span>
                                                                <span className="font-extrabold text-slate-700 mt-0.5 block">{payroll.daysPresent} Hari</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Reguler</span>
                                                                <span className="font-semibold text-slate-600 mt-0.5 block">{payroll.totalRegularHours.toFixed(1)} Jam</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Lembur</span>
                                                                <span className="font-semibold text-slate-600 mt-0.5 block">{payroll.totalLemburHours.toFixed(1)} Jam</span>
                                                            </div>
                                                        </div>

                                                        <div className="bg-slate-900 text-white p-3 rounded-xl flex items-center justify-between shadow-xs">
                                                            <div>
                                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Estimasi Gaji Bersih</span>
                                                                <span className="text-base font-black text-emerald-400">Rp {payroll.grandTotalSalary.toLocaleString('id-ID')}</span>
                                                            </div>
                                                            <div>
                                                                {payroll.status === 'paid' ? (
                                                                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-extrabold rounded-full text-[9px] uppercase">Dibayar</span>
                                                                ) : payroll.status === 'approved' ? (
                                                                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 font-extrabold rounded-full text-[9px] uppercase">Disetujui</span>
                                                                ) : (
                                                                    <span className="px-2 py-0.5 bg-white/10 text-slate-300 border border-white/20 font-extrabold rounded-full text-[9px] uppercase">Draft</span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {(payroll.totalTunjangan > 0 || payroll.totalPotongan > 0) && (
                                                            <div className="flex items-center gap-2 text-[10px] font-bold">
                                                                {payroll.totalTunjangan > 0 && (
                                                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">
                                                                        +Tunjangan: Rp {payroll.totalTunjangan.toLocaleString('id-ID')}
                                                                    </span>
                                                                )}
                                                                {payroll.totalPotongan > 0 && (
                                                                    <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-md border border-rose-100">
                                                                        -Potongan: Rp {payroll.totalPotongan.toLocaleString('id-ID')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div className="flex items-center gap-1.5 pt-1">
                                                            <button
                                                                onClick={() => setSelectedEmpPayrollDetail(payroll)}
                                                                className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-colors text-center cursor-pointer"
                                                            >
                                                                Rincian
                                                            </button>
                                                            <button
                                                                onClick={() => handlePrintSingleSlip(payroll)}
                                                                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-colors text-center cursor-pointer"
                                                            >
                                                                Slip
                                                            </button>
                                                            <button
                                                                onClick={() => handleEditPayroll(payroll)}
                                                                className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-xl transition-colors cursor-pointer"
                                                                title="Edit Gaji Karyawan"
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeletePayroll(payroll)}
                                                                className="p-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl transition-colors cursor-pointer"
                                                                title="Hapus / Reset Gaji"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {/* Pagination Footer */}
                                        {renderPaginationBar(
                                            pageGaji,
                                            totalPagesGaji,
                                            allPayrollData.length,
                                            limitGaji,
                                            setPageGaji,
                                            setLimitGaji,
                                            "Karyawan"
                                        )}
                                    </div>
                                </>
                            );
                        })()
                    )}
                </div>
            )}

            {/* Edit Dialog Modal */}
            {editingRecord && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="font-bold text-slate-800">Edit Absensi</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Milik: {usersMap[editingRecord.user_id]?.nama || 'Karyawan'}</p>
                            </div>
                            <button 
                                onClick={() => setEditingRecord(null)} 
                                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200/50 rounded-lg transition-all"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Jam Masuk</label>
                                <input 
                                    type="time" 
                                    step="1"
                                    value={editForm.jam_masuk}
                                    onChange={(e) => setEditForm({...editForm, jam_masuk: e.target.value})}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Jam Pulang</label>
                                <input 
                                    type="time" 
                                    step="1"
                                    value={editForm.jam_pulang}
                                    onChange={(e) => setEditForm({...editForm, jam_pulang: e.target.value})}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status Presensi</label>
                                <select 
                                    value={editForm.status}
                                    onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 bg-white"
                                >
                                    <option value="Hadir">Hadir</option>
                                    <option value="Terlambat">Terlambat</option>
                                    <option value="Izin">Izin</option>
                                    <option value="Sakit">Sakit</option>
                                    <option value="Alpa">Alpa</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Lama Istirahat (Jam)</label>
                                <input 
                                    type="number" 
                                    value={editForm.istirahat}
                                    onChange={(e) => setEditForm({...editForm, istirahat: Number(e.target.value)})}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 font-mono"
                                    min="0"
                                    max="24"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-1">
                                <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={!!editForm.is_lembur} 
                                        onChange={e => setEditForm({...editForm, is_lembur: e.target.checked})} 
                                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20"
                                    />
                                    <div className="text-xs">
                                        <span className="font-bold text-slate-700 block">Lembur</span>
                                        <span className="text-[10px] text-slate-400 block mt-0.5">Tarif lembur berlaku</span>
                                    </div>
                                </label>
                                <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={!!editForm.dryer_menyala} 
                                        onChange={e => setEditForm({...editForm, dryer_menyala: e.target.checked})} 
                                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20"
                                    />
                                    <div className="text-xs">
                                        <span className="font-bold text-slate-700 block">Dryer 1 Menyala</span>
                                        <span className="text-[10px] text-slate-400 block mt-0.5">Klaim bonus Dryer 1</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50">
                            <button 
                                onClick={() => setEditingRecord(null)} 
                                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                Batal
                            </button>
                            <button 
                                onClick={handleSaveEdit} 
                                className="px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 rounded-lg transition-all text-sm shadow-sm"
                            >
                                Simpan Perubahan
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Confirmation Dialog */}
            <ConfirmDialog
                isOpen={!!deleteId}
                title="Hapus Data Absensi"
                message={`Apakah Anda yakin ingin menghapus data absensi milik ${usersMap[attendance.find(item => item.id === deleteId)?.user_id]?.nama || 'Karyawan'}? Tindakan ini tidak dapat dibatalkan.`}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteId(null)}
                isDestructive={true}
                confirmText="Hapus Permanen"
                cancelText="Batal"
            />

            {/* AI Attendance Report Modal */}
            {showAIReportModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh] border border-slate-100 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-slate-100/50">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl text-white shadow-sm">
                                    <Sparkles size={18} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-base">Ekspor Laporan Absensi Pintar (AI)</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Sajikan laporan mingguan/bulanan yang rapi, lengkap dengan analisis otomatis.</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowAIReportModal(false)} 
                                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-200/50 rounded-xl transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 overflow-y-auto flex-1 space-y-6">
                            {/* Configuration Panel */}
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Pilih Rentang Laporan:</span>
                                    <div className="flex bg-slate-200 p-1 rounded-xl self-start sm:self-auto">
                                        <button 
                                            onClick={() => handleRangePresetChange('weekly')}
                                            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${reportRange === 'weekly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            Mingguan (7 Hari)
                                        </button>
                                        <button 
                                            onClick={() => handleRangePresetChange('monthly')}
                                            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${reportRange === 'monthly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            Bulanan (30 Hari)
                                        </button>
                                        <button 
                                            onClick={() => setReportRange('custom')}
                                            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${reportRange === 'custom' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            Kustom
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tanggal Mulai</label>
                                        <input 
                                            type="date"
                                            value={reportStartDate}
                                            onChange={(e) => {
                                                setReportStartDate(e.target.value);
                                                setReportRange('custom');
                                            }}
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tanggal Selesai</label>
                                        <input 
                                            type="date"
                                            value={reportEndDate}
                                            onChange={(e) => {
                                                setReportEndDate(e.target.value);
                                                setReportRange('custom');
                                            }}
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 font-medium"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleGenerateAIReport}
                                    disabled={isGeneratingReport}
                                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-orange-500/10 flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <Sparkles size={16} className={isGeneratingReport ? "animate-spin" : ""} />
                                    <span>{isGeneratingReport ? "Menghasilkan Laporan via AI (Harap Tunggu...)" : "Mulai Pemformatan & Analisis AI"}</span>
                                </button>
                            </div>

                            {/* Report Results */}
                            {generatedReport ? (
                                <div className="space-y-6">
                                    {/* AI Insights Summary cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex flex-col justify-between">
                                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Tingkat Kepatuhan</span>
                                            <span className="text-3xl font-black text-emerald-700 mt-1">{generatedReport.summary?.complianceRate || '100%'}</span>
                                            <span className="text-[10px] text-emerald-500 mt-1">Kehadiran tepat waktu</span>
                                        </div>
                                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col justify-between">
                                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Tepat Waktu (Hadir)</span>
                                            <span className="text-3xl font-black text-blue-700 mt-1">{generatedReport.summary?.totalOnTime || 0}</span>
                                            <span className="text-[10px] text-blue-500 mt-1">Total sesi check-in awal</span>
                                        </div>
                                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex flex-col justify-between">
                                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Terlambat</span>
                                            <span className="text-3xl font-black text-amber-700 mt-1">{generatedReport.summary?.totalLate || 0}</span>
                                            <span className="text-[10px] text-amber-500 mt-1">Total check-in lewat jam masuk</span>
                                        </div>
                                    </div>

                                    {/* AI Commentary */}
                                    <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 flex gap-3">
                                        <div className="p-1 bg-orange-100 rounded-lg text-orange-600 h-fit">
                                            <Sparkles size={16} />
                                        </div>
                                        <div>
                                            <span className="text-xs font-bold text-orange-800 uppercase tracking-wider">Komentar Ringkas AI</span>
                                            <p className="text-sm text-slate-700 mt-1 font-medium">{generatedReport.summary?.summaryComments}</p>
                                        </div>
                                    </div>

                                    {/* Printable Report Preview */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pratinjau Layout Laporan (Siap Cetak)</span>
                                            <span className="text-[10px] text-slate-400">Gunakan tombol cetak di bawah untuk mencetak langsung ke printer/PDF</span>
                                        </div>
                                        <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 max-h-[400px] overflow-y-auto shadow-inner">
                                            <div 
                                                className="bg-white p-8 rounded-xl shadow-md border border-slate-200 text-slate-800 overflow-x-auto min-w-[650px] markdown-body"
                                                dangerouslySetInnerHTML={{ __html: generatedReport.htmlReport }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                !isGeneratingReport && (
                                    <div className="py-12 flex flex-col items-center text-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                                        <div className="p-4 bg-amber-50 rounded-full text-amber-500 mb-3 animate-pulse">
                                            <Sparkles size={24} />
                                        </div>
                                        <h4 className="font-bold text-slate-700 text-sm">Belum Ada Laporan yang Dibuat</h4>
                                        <p className="text-xs text-slate-400 mt-1 max-w-sm">Pilih rentang tanggal di atas lalu klik tombol pemformatan untuk menghasilkan laporan terstruktur dan analisis otomatis oleh AI.</p>
                                    </div>
                                )
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50/50">
                            <span className="text-[11px] text-slate-400 text-center sm:text-left font-medium">
                                Laporan diformat otomatis & dioptimasi ramah printer menggunakan AI.
                            </span>
                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                <button 
                                    onClick={() => setShowAIReportModal(false)}
                                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer w-full sm:w-auto"
                                >
                                    Tutup
                                </button>
                                {generatedReport && (
                                    <>
                                        <button 
                                            onClick={handleDownloadAICsvReport}
                                            className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm w-full sm:w-auto"
                                        >
                                            <Download size={14} />
                                            <span>Unduh Excel (CSV)</span>
                                        </button>
                                        <button 
                                            onClick={handlePrintAIHTMLReport}
                                            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-orange-500/10 w-full sm:w-auto"
                                        >
                                            <Printer size={14} />
                                            <span>Cetak Laporan PDF</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Payroll Analysis Modal */}
            {showPayrollAIModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh] border border-slate-100 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-slate-100/50">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl text-white shadow-sm">
                                    <Sparkles size={18} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-base">Audit & Analisis Gaji Pintar (AI)</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Ringkasan pengeluaran upah, pencocokan lembur, dan audit anomali otomatis.</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowPayrollAIModal(false)} 
                                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-200/50 rounded-xl transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {isGeneratingPayrollAI && (
                                <div className="py-20 flex flex-col items-center justify-center text-center">
                                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                                    <h4 className="font-extrabold text-slate-800 text-sm">AI Sedang Melakukan Audit Gaji...</h4>
                                    <p className="text-xs text-slate-500 mt-2 max-w-md px-4 leading-relaxed">
                                        Menganalisis total pengeluaran, mendeteksi outlier jam lembur, memverifikasi korelasi kehadiran, dan merumuskan rekomendasi efisiensi biaya. Harap tunggu sebentar.
                                    </p>
                                </div>
                            )}

                            {payrollAIReport && (
                                <div className="space-y-6">
                                    {/* Key Metric Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex flex-col justify-between">
                                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Rata-rata Gaji Bersih</span>
                                            <span className="text-xl font-black text-indigo-900 mt-1">{payrollAIReport.average_salary}</span>
                                            <span className="text-[10px] text-indigo-500 mt-1">Rata-rata upah dibawa pulang</span>
                                        </div>
                                        <div className="bg-violet-50/50 p-4 rounded-xl border border-violet-100 flex flex-col justify-between">
                                            <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Total Biaya Lemburan</span>
                                            <span className="text-xl font-black text-violet-900 mt-1">{payrollAIReport.total_overtime_cost}</span>
                                            <span className="text-[10px] text-violet-500 mt-1">Total upah lembur bulan ini</span>
                                        </div>
                                        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex flex-col justify-between">
                                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Pendapatan Tertinggi</span>
                                            <span className="text-xl font-black text-emerald-900 mt-1 truncate" title={payrollAIReport.highest_earner}>
                                                {payrollAIReport.highest_earner}
                                            </span>
                                            <span className="text-[10px] text-emerald-500 mt-1">Penerima upah tertinggi</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                        {/* Executive Analysis */}
                                        <div className="lg:col-span-7 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="p-1 bg-indigo-100 text-indigo-700 rounded-lg">
                                                    <Sparkles size={14} />
                                                </div>
                                                <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider">Ulasan Eksekutif AI</span>
                                            </div>
                                            
                                            <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed text-xs sm:text-sm">
                                                {payrollAIReport.analysis.split('\n').map((line: string, i: number) => {
                                                    if (!line.trim()) return <div key={i} className="h-2"></div>;
                                                    if (line.startsWith('### ')) {
                                                        return <h4 key={i} className="text-sm font-bold text-slate-800 mt-4 mb-2">{line.replace('### ', '')}</h4>;
                                                    }
                                                    if (line.startsWith('#### ')) {
                                                        return <h5 key={i} className="text-xs font-bold text-slate-800 mt-3 mb-1 uppercase tracking-wider">{line.replace('#### ', '')}</h5>;
                                                    }
                                                    if (line.startsWith('*   ') || line.startsWith('* ')) {
                                                        return <li key={i} className="ml-4 list-disc text-slate-600 my-0.5">{line.replace(/^\*\s+/, '').replace(/^\*\s+\*\s+/, '')}</li>;
                                                    }
                                                    return <p key={i} className="mb-2 text-slate-600">{line}</p>;
                                                })}
                                            </div>
                                        </div>

                                        {/* Anomalies and Recommendations */}
                                        <div className="lg:col-span-5 space-y-6">
                                            {/* Anomalies */}
                                            <div className="bg-rose-50/50 p-5 rounded-2xl border border-rose-100">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <div className="p-1 bg-rose-100 text-rose-700 rounded-lg">
                                                        <AlertTriangle size={14} />
                                                    </div>
                                                    <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">🚨 Deteksi Anomali Gaji</span>
                                                </div>
                                                <div className="space-y-2">
                                                    {payrollAIReport.anomalies.map((item: string, idx: number) => (
                                                        <div key={idx} className="bg-white p-3 rounded-xl border border-rose-100 text-xs text-slate-700 font-medium flex items-start gap-2 shadow-sm">
                                                            <span className="text-rose-500 font-extrabold shrink-0">•</span>
                                                            <p className="leading-relaxed">{item}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Recommendations */}
                                            <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <div className="p-1 bg-emerald-100 text-emerald-700 rounded-lg">
                                                        <CheckCircle2 size={14} />
                                                    </div>
                                                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">💡 Rekomendasi Efisiensi & Insentif</span>
                                                </div>
                                                <div className="space-y-2">
                                                    {payrollAIReport.recommendations.map((item: string, idx: number) => (
                                                        <div key={idx} className="bg-white p-3 rounded-xl border border-emerald-100 text-xs text-slate-700 font-medium flex items-start gap-2 shadow-sm">
                                                            <span className="text-emerald-500 font-extrabold shrink-0">•</span>
                                                            <p className="leading-relaxed">{item}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
                            <button 
                                onClick={() => setShowPayrollAIModal(false)}
                                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Photo Viewer Modal */}
            {viewPhoto && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800">Foto Selfie Absensi</h3>
                            <button onClick={() => setViewPhoto(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200/50 rounded-lg transition-all">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 flex flex-col items-center bg-slate-100 justify-center">
                            <div className="relative w-full max-h-[70vh] bg-slate-200 rounded-xl overflow-auto border border-slate-300 shadow-inner flex items-center justify-center">
                                <img 
                                    src={viewPhoto} 
                                    alt="Selfie Absensi" 
                                    className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-sm"
                                    referrerPolicy="no-referrer"
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end bg-white">
                            <button 
                                onClick={() => setViewPhoto(null)} 
                                className="px-5 py-2 bg-slate-800 text-white font-medium hover:bg-slate-900 rounded-lg transition-colors text-sm shadow-sm"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- ADMIN DAILY PRINT AREA (ONLY SHOWN IN PRINT) --- */}
            <div id="print-daily-area" className="hidden p-8 font-sans space-y-6">
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">PRESENSI KARYAWAN US 162 BILIBILI</h1>
                        <p className="text-xs text-slate-500 font-medium">LAPORAN MONITORING HARIAN HADIR 162</p>
                    </div>
                    <div className="text-right text-xs">
                        <p className="font-bold">Admin Portal</p>
                        <p className="text-slate-500">Tanggal Laporan: {filterDate}</p>
                        {filterDivisi && <p className="text-slate-500">Divisi: {filterDivisi}</p>}
                        <p className="text-slate-400">Dicetak: {format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}</p>
                    </div>
                </div>

                {/* Print Summary Stats */}
                <div className="grid grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="text-center">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Presensi</p>
                        <p className="text-xl font-bold mt-1 text-slate-900">{totalCount} Orang</p>
                    </div>
                    <div className="text-center border-l border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tepat Waktu</p>
                        <p className="text-xl font-bold mt-1 text-emerald-600">{hadirCount} Orang</p>
                    </div>
                    <div className="text-center border-l border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Terlambat</p>
                        <p className="text-xl font-bold mt-1 text-rose-600">{terlambatCount} Orang</p>
                    </div>
                    <div className="text-center border-l border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Izin/Sakit/Alpa</p>
                        <p className="text-xl font-bold mt-1 text-amber-600">{absenCount} Orang</p>
                    </div>
                </div>

                {/* Print Daily Table */}
                <table className="w-full text-left text-[11px] border-collapse mt-4">
                    <thead>
                        <tr className="border-b border-slate-300 bg-slate-100 text-slate-700">
                            <th className="p-2 font-bold uppercase">No</th>
                            <th className="p-2 font-bold uppercase">Nama Karyawan</th>
                            <th className="p-2 font-bold uppercase">Divisi</th>
                            <th className="p-2 font-bold uppercase">Jam Masuk</th>
                            <th className="p-2 font-bold uppercase">Jam Pulang</th>
                            <th className="p-2 font-bold uppercase">Status</th>
                            <th className="p-2 font-bold uppercase">Alamat Check-in</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {displayedAttendance.map((item, idx) => {
                            const u = usersMap[item.user_id] || {};
                            return (
                                <tr key={item.id} className="align-top">
                                    <td className="p-2">{idx + 1}</td>
                                    <td className="p-2 font-semibold text-slate-900">{u.nama || 'Tidak Dikenal'}</td>
                                    <td className="p-2">{u.divisi || '-'}</td>
                                    <td className="p-2 font-mono font-bold text-emerald-600">{item.jam_masuk || '--:--'}</td>
                                    <td className="p-2 font-mono text-slate-700">{getEffectiveCheckoutTime(item) || '--:--'}</td>
                                    <td className="p-2 font-semibold capitalize">{item.status || 'Hadir'}</td>
                                    <td className="p-2 text-slate-500 max-w-xs">{item.alamat_masuk || '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Print Signatures */}
                <div className="pt-12 grid grid-cols-2 gap-12 text-center text-xs">
                    <div>
                        <p className="text-slate-400">Dibuat Oleh,</p>
                        <div className="h-16"></div>
                        <p className="font-bold underline uppercase">HR Staff</p>
                        <p className="text-[10px] text-slate-400">Hadir 162 - US Bilibili 162</p>
                    </div>
                    <div>
                        <p className="text-slate-400">Disetujui Oleh,</p>
                        <div className="h-16"></div>
                        <p className="font-bold underline uppercase">HR Manager</p>
                        <p className="text-[10px] text-slate-400">Hadir 162 - US Bilibili 162</p>
                    </div>
                </div>
            </div>

            {/* selectedEmpPayrollDetail modal breakdown */}
            {selectedEmpPayrollDetail && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-8 animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase tracking-widest font-extrabold px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full">Detail Payroll</span>
                                    <span className="text-xs text-slate-400">Periode: {format(new Date(selectedMonth + "-02"), 'MMMM yyyy', { locale: id })}</span>
                                </div>
                                <h3 className="text-xl font-black text-slate-800 mt-2">{selectedEmpPayrollDetail.employee.nama}</h3>
                                <p className="text-xs text-slate-500">{selectedEmpPayrollDetail.employee.jabatan || 'Karyawan'} • Divisi: {selectedEmpPayrollDetail.employee.divisi || '-'}</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handlePrintSingleSlip(selectedEmpPayrollDetail)}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                                >
                                    <span>Cetak Slip Gaji (PDF)</span>
                                </button>
                                <button
                                    onClick={() => setSelectedEmpPayrollDetail(null)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                            {/* Stats Summary Cards */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Hari Hadir</span>
                                    <span className="text-xl font-black text-slate-800">{selectedEmpPayrollDetail.daysPresent} Hari</span>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Jam Kerja Biasa</span>
                                    <span className="text-xl font-black text-slate-800">{selectedEmpPayrollDetail.totalRegularHours.toFixed(1)} Jam</span>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Jam Kerja Lembur</span>
                                    <span className="text-xl font-black text-slate-800">{selectedEmpPayrollDetail.totalLemburHours.toFixed(1)} Jam</span>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Upah Gaji</span>
                                    <span className="text-xl font-black text-blue-600">Rp {selectedEmpPayrollDetail.grandTotalSalary.toLocaleString('id-ID')}</span>
                                </div>
                            </div>

                            {/* Salary Config Summary */}
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/50">
                                <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">Konfigurasi Pengupahan Karyawan</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
                                    <div>Tipe Gaji: <strong className="text-slate-800">{selectedEmpPayrollDetail.employee.gaji_type === 'per_bulan' ? 'Bulanan' : 'Per Jam'}</strong></div>
                                    {selectedEmpPayrollDetail.employee.gaji_type === 'per_bulan' ? (
                                        <div>Gaji Pokok: <strong className="text-slate-800">Rp {(selectedEmpPayrollDetail.employee.gaji_bulanan || 0).toLocaleString('id-ID')} / bulan</strong></div>
                                    ) : (
                                        <div>Tarif Biasa: <strong className="text-slate-800">Rp {(selectedEmpPayrollDetail.employee.gaji_per_jam || 14000).toLocaleString('id-ID')} / jam</strong></div>
                                    )}
                                    <div>Tarif Lembur: <strong className="text-slate-800">Rp {(
                                        selectedEmpPayrollDetail.employee.nama?.toLowerCase().includes('juned') ? 15000 :
                                        selectedEmpPayrollDetail.employee.nama?.toLowerCase().includes('asma') ? 16000 :
                                        (selectedEmpPayrollDetail.employee.gaji_lembur_per_jam || 14000)
                                    ).toLocaleString('id-ID')} / jam</strong></div>
                                    {selectedEmpPayrollDetail.employee.bonus_dryer_1 && (
                                        <div>Bonus Dryer 1: <strong className="text-emerald-700">Aktif (Rp 10.000 / kehadiran dryer menyala)</strong></div>
                                    )}
                                </div>
                            </div>

                            {/* Monthly Adjustments Input Panel */}
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                                <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Form Penyesuaian & Pembayaran Bulan Ini</h4>
                                    <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 font-bold rounded-md">Khusus {format(new Date(selectedMonth + "-02"), 'MMMM yyyy', { locale: id })}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Column 1: Tunjangan (Allowances) */}
                                    <div className="space-y-3">
                                        <h5 className="text-[11px] font-black text-emerald-700 uppercase tracking-wider">💰 Tunjangan (Penambah Gaji)</h5>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tunjangan Makan</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">Rp</span>
                                                <input
                                                    type="text"
                                                    value={adjustmentsForm.tunjangan_makan === '' ? '' : formatRupiah(adjustmentsForm.tunjangan_makan)}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        setAdjustmentsForm({ ...adjustmentsForm, tunjangan_makan: raw === '' ? '' : parseRupiah(raw) });
                                                    }}
                                                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-bold text-slate-700"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tunjangan Jabatan</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">Rp</span>
                                                <input
                                                    type="text"
                                                    value={adjustmentsForm.tunjangan_jabatan === '' ? '' : formatRupiah(adjustmentsForm.tunjangan_jabatan)}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        setAdjustmentsForm({ ...adjustmentsForm, tunjangan_jabatan: raw === '' ? '' : parseRupiah(raw) });
                                                    }}
                                                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-bold text-slate-700"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tunjangan Transport</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">Rp</span>
                                                <input
                                                    type="text"
                                                    value={adjustmentsForm.tunjangan_transport === '' ? '' : formatRupiah(adjustmentsForm.tunjangan_transport)}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        setAdjustmentsForm({ ...adjustmentsForm, tunjangan_transport: raw === '' ? '' : parseRupiah(raw) });
                                                    }}
                                                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-bold text-slate-700"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column 2: Potongan (Deductions) */}
                                    <div className="space-y-3">
                                        <h5 className="text-[11px] font-black text-rose-700 uppercase tracking-wider">🛑 Potongan (Pengurang Gaji)</h5>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Kasbon / Pinjaman</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">Rp</span>
                                                <input
                                                    type="text"
                                                    value={adjustmentsForm.potongan_kasbon === '' ? '' : formatRupiah(adjustmentsForm.potongan_kasbon)}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        setAdjustmentsForm({ ...adjustmentsForm, potongan_kasbon: raw === '' ? '' : parseRupiah(raw) });
                                                    }}
                                                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-bold text-slate-700"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Potongan BPJS</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">Rp</span>
                                                <input
                                                    type="text"
                                                    value={adjustmentsForm.potongan_bpjs === '' ? '' : formatRupiah(adjustmentsForm.potongan_bpjs)}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        setAdjustmentsForm({ ...adjustmentsForm, potongan_bpjs: raw === '' ? '' : parseRupiah(raw) });
                                                    }}
                                                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-bold text-slate-700"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Potongan Lain-lain</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">Rp</span>
                                                <input
                                                    type="text"
                                                    value={adjustmentsForm.potongan_lain === '' ? '' : formatRupiah(adjustmentsForm.potongan_lain)}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        setAdjustmentsForm({ ...adjustmentsForm, potongan_lain: raw === '' ? '' : parseRupiah(raw) });
                                                    }}
                                                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-bold text-slate-700"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Catatan Gaji / Slip</label>
                                        <input
                                            type="text"
                                            value={adjustmentsForm.catatan}
                                            onChange={(e) => setAdjustmentsForm({ ...adjustmentsForm, catatan: e.target.value })}
                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs text-slate-700"
                                            placeholder="misal: Bonus tambahan kinerja, atau catatan denda terlambat"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Status Pembayaran Gaji</label>
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={adjustmentsForm.status}
                                                onChange={(e) => setAdjustmentsForm({ ...adjustmentsForm, status: e.target.value })}
                                                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-bold text-slate-700 bg-white"
                                            >
                                                <option value="draft">📁 DRAFT (Belum Dipublikasi)</option>
                                                <option value="approved">✅ DISETUJUI (Karyawan Bisa Lihat Slip)</option>
                                                <option value="paid">💵 SUDAH DIBAYAR / LUNAS</option>
                                            </select>
                                            <button
                                                onClick={handleSaveAdjustments}
                                                disabled={savingAdjustments}
                                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5 shrink-0"
                                            >
                                                {savingAdjustments ? '...' : 'Simpan'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Daily Breakdown Table */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Rincian Harian Aktivitas & Upah</h4>
                                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                                                    <th className="p-3">Tanggal</th>
                                                    <th className="p-3">Status</th>
                                                    <th className="p-3">Masuk - Pulang</th>
                                                    <th className="p-3 text-center">Istirahat</th>
                                                    <th className="p-3 text-center">Jam Kerja</th>
                                                    <th className="p-3 text-center">Lembur</th>
                                                    <th className="p-3 text-center">Dryer 1</th>
                                                    <th className="p-3 text-right">Upah Harian</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                                {selectedEmpPayrollDetail.salaryBreakdown.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={8} className="p-8 text-center text-slate-400">Tidak ada log kehadiran terekam.</td>
                                                    </tr>
                                                ) : (
                                                    selectedEmpPayrollDetail.salaryBreakdown.map((breakdown: any, idx: number) => (
                                                        <tr key={idx} className="hover:bg-slate-50">
                                                            <td className="p-3 font-semibold">{format(new Date(breakdown.tanggal), 'dd MMMM yyyy', { locale: id })}</td>
                                                            <td className="p-3">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                    breakdown.status === 'Hadir' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                                                    breakdown.status === 'Terlambat' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                                                    'bg-slate-100 text-slate-600 border border-slate-200'
                                                                }`}>
                                                                    {breakdown.status}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 font-mono">{breakdown.jam_masuk} - {breakdown.jam_pulang}</td>
                                                            <td className="p-3 text-center">{breakdown.istirahat} Jam</td>
                                                            <td className="p-3 text-center">{breakdown.jam_kerja.toFixed(1)} Jam</td>
                                                            <td className="p-3 text-center">{breakdown.lembur.toFixed(1)} Jam</td>
                                                            <td className="p-3 text-center">
                                                                {breakdown.dryer_aktif ? (
                                                                    <span className="text-xs text-emerald-600 font-bold">● Aktif</span>
                                                                ) : (
                                                                    <span className="text-xs text-slate-400">-</span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 text-right font-bold text-slate-900">
                                                                {breakdown.gaji_hari_ini > 0 ? `Rp ${breakdown.gaji_hari_ini.toLocaleString('id-ID')}` : '-'}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Payroll Modal */}
            {editingPayrollUser && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-slate-800 text-base">Edit Konfigurasi Gaji</h3>
                                <p className="text-xs text-slate-500 mt-0.5">{editingPayrollUser.nama} • {editingPayrollUser.jabatan || 'Karyawan'}</p>
                            </div>
                            <button 
                                onClick={() => setEditingPayrollUser(null)} 
                                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-200/50 rounded-xl transition-all cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Form Body */}
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipe Gaji</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPayrollForm(prev => ({ ...prev, gaji_type: 'per_jam' }))}
                                        className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                            payrollForm.gaji_type === 'per_jam'
                                                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        Per Jam
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPayrollForm(prev => ({ ...prev, gaji_type: 'per_bulan' }))}
                                        className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                            payrollForm.gaji_type === 'per_bulan'
                                                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        Bulanan
                                    </button>
                                </div>
                            </div>

                            {payrollForm.gaji_type === 'per_bulan' ? (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gaji Bulanan Pokok (Rp)</label>
                                    <input
                                        type="text"
                                        value={payrollForm.gaji_bulanan === '' ? '' : formatRupiah(payrollForm.gaji_bulanan)}
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            setPayrollForm(prev => ({ ...prev, gaji_bulanan: raw === '' ? '' : parseRupiah(raw) }));
                                        }}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                                        placeholder="Contoh: 3.000.000"
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gaji Per Jam (Rp)</label>
                                    <input
                                        type="text"
                                        value={payrollForm.gaji_per_jam === '' ? '' : formatRupiah(payrollForm.gaji_per_jam)}
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            setPayrollForm(prev => ({ ...prev, gaji_per_jam: raw === '' ? '' : parseRupiah(raw) }));
                                        }}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                                        placeholder="Contoh: 14.000"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gaji Lembur Per Jam (Rp)</label>
                                <input
                                    type="text"
                                    value={payrollForm.gaji_lembur_per_jam === '' ? '' : formatRupiah(payrollForm.gaji_lembur_per_jam)}
                                    onChange={(e) => {
                                        const raw = e.target.value;
                                        setPayrollForm(prev => ({ ...prev, gaji_lembur_per_jam: raw === '' ? '' : parseRupiah(raw) }));
                                    }}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700"
                                    placeholder="Contoh: 14.000"
                                />
                            </div>

                            <div className="flex items-center gap-2.5 bg-slate-50 p-4 rounded-xl border border-slate-200/50 mt-2">
                                <input
                                    type="checkbox"
                                    id="bonus_dryer_1_edit"
                                    checked={payrollForm.bonus_dryer_1}
                                    onChange={(e) => setPayrollForm(prev => ({ ...prev, bonus_dryer_1: e.target.checked }))}
                                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                                />
                                <label htmlFor="bonus_dryer_1_edit" className="text-xs text-slate-600 font-semibold cursor-pointer select-none">
                                    Bonus Dryer 1 (Tambahan Rp 10.000 / kehadiran saat dryer menyala)
                                </label>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50">
                            <button 
                                onClick={() => setEditingPayrollUser(null)} 
                                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
                            >
                                Batal
                            </button>
                            <button 
                                onClick={handleSavePayrollEdit} 
                                className="px-4 py-2 bg-blue-600 text-white font-bold hover:bg-blue-700 rounded-xl transition-all text-xs shadow-md cursor-pointer"
                            >
                                Simpan Perubahan
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Reset/Delete Payroll */}
            <ConfirmDialog
                isOpen={!!deletingPayrollUser}
                title="Hapus / Reset Konfigurasi Gaji"
                message={`Apakah Anda yakin ingin menghapus/mereset seluruh konfigurasi gaji untuk ${deletingPayrollUser?.nama}? Tindakan ini akan mengosongkan tarif gaji pokok dan lembur mereka kembali ke 0.`}
                onConfirm={handleConfirmDeletePayroll}
                onCancel={() => setDeletingPayrollUser(null)}
                isDestructive={true}
                confirmText="Ya, Hapus/Reset"
                cancelText="Batal"
            />
        </div>
    );
}
