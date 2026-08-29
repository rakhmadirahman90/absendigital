from pathlib import Path

path = Path('src/pages/admin/AbsensiTab.tsx')
s = path.read_text(encoding='utf-8')

# Daily view must not subscribe to the entire attendance collection. That can
# consume the Firestore free-tier read quota and make the app appear empty.
# Use a narrow date query for the normal case; only "Semua Tanggal" reads all.
old_all_collection = '''    useEffect(() => {
        setLoading(true);

        // Read the complete real attendance collection first, then filter in the
        // client. This avoids a missing/incorrect Firestore query index or a
        // legacy date-format mismatch hiding valid employee records.
        const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snap) => {
            let data: any[] = [];
            snap.forEach(docSnap => data.push({ id: docSnap.id, ...docSnap.data() }));

            // Normalize date values so legacy records remain visible.
            const normalizeDate = (value: any): string => {
                if (!value) return '';
                if (typeof value === 'string') return value.slice(0, 10);
                if (value?.toDate) return format(value.toDate(), 'yyyy-MM-dd');
                if (value instanceof Date) return format(value, 'yyyy-MM-dd');
                return String(value).slice(0, 10);
            };

            if (filterDateMode !== 'all') {
                data = data.filter(item => normalizeDate(item.tanggal) === filterDate);
            }

            data.sort((a, b) => {
                const dateComp = normalizeDate(b.tanggal).localeCompare(normalizeDate(a.tanggal));
                if (dateComp !== 0) return dateComp;
                return (b.jam_masuk || '').localeCompare(a.jam_masuk || '');
            });

            if (filterDivisi) {
                data = data.filter(item => {
                    const user = getUserFromRecord(item, usersMap);
                    return user.divisi === filterDivisi || item.divisi === filterDivisi;
                });
            }

            // IMPORTANT: never replace real Firestore data with demo attendance.
            // Empty means genuinely no records for the selected date.
            setAttendance(data);
            setLoading(false);
        }, (error) => {
            console.error('[AbsensiTab] Attendance sync error:', error?.message || error);
            setAttendance([]);
            setLoading(false);
            toast.error('Gagal memuat data absensi dari server. Silakan coba lagi.');
        });

        return () => unsubAttendance();
    }, [filterDate, filterDateMode, filterDivisi, usersMap]);'''

new_targeted = '''    useEffect(() => {
        setLoading(true);

        const buildData = (snap: any) => {
            let data: any[] = [];
            snap.forEach((docSnap: any) => data.push({ id: docSnap.id, ...docSnap.data() }));

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

        const unsubAttendance = onSnapshot(q, (snap) => {
            const data = buildData(snap);
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
    }, [filterDate, filterDateMode, filterDivisi, usersMap]);'''

if old_all_collection in s:
    s = s.replace(old_all_collection, new_targeted, 1)
elif 'const buildData = (snap: any)' not in s:
    raise SystemExit('Expected attendance listener block not found; refusing modification.')

# Never inject demo attendance into the daily/monthly report data.
s = s.replace('''            if (records.length === 0) {
                setMonthlyRecords(DEFAULT_ATTENDANCE);
            } else {
                setMonthlyRecords(records);
            }''', '''            setMonthlyRecords(records);''')
s = s.replace("setMonthlyRecords(DEFAULT_ATTENDANCE);", "setMonthlyRecords([]);")

# Remove demo attendance import if it is no longer referenced.
if 'DEFAULT_ATTENDANCE' not in s and ', DEFAULT_ATTENDANCE' in s:
    s = s.replace(', DEFAULT_ATTENDANCE', '')

path.write_text(s, encoding='utf-8')
print('Daily attendance now uses a targeted Firestore date query; full collection scan is limited to explicit All Dates mode.')
