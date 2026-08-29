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
            if (value instanceof Date) {
                return format(value, 'yyyy-MM-dd');
            }
            return '';
        };

        const buildData = (snap: any, forceDateFilter = false) => {
            let data: any[] = [];
            snap.forEach((docSnap: any) => data.push({ id: docSnap.id, ...docSnap.data() }));

            // Some legacy/manual records may store tanggal as a timestamp or as
            // "YYYY-MM-DD HH:mm:ss". Normalize before filtering so valid records
            // are not hidden simply because their date representation differs.
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

        // Primary path: indexed/equality query for the selected date.
        const q = filterDateMode === 'all'
            ? query(collection(db, 'attendance'))
            : query(collection(db, 'attendance'), where('tanggal', '==', filterDate));

        const unsubAttendance = onSnapshot(q, async (snap) => {
            let data = buildData(snap);

            // If the exact-date query is empty, do one compatibility read across
            // attendance and normalize legacy date formats client-side. This is
            // only executed when the primary query has zero rows, so normal usage
            // remains quota-friendly. It also prevents the whole daily table from
            // appearing empty when older records use a different date format.
            if (filterDateMode !== 'all' && snap.empty) {
                try {
                    const allSnap = await import('firebase/firestore').then(({ getDocs }) =>
                        getDocs(collection(db, 'attendance'))
                    );
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

    // ... rest of component remains unchanged ...
