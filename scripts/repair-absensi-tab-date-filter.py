from pathlib import Path

path = Path('src/pages/admin/AbsensiTab.tsx')
source = path.read_text(encoding='utf-8')

# 1) Keep the existing daily compatibility repair idempotent.
old = """            if (typeof value === 'string') {\n                const match = value.match(/(\\d{4}-\\d{2}-\\d{2})/);\n                return match ? match[1] : value.slice(0, 10);\n            }"""
new = """            if (typeof value === 'string') {\n                const isoMatch = value.match(/(\\d{4}-\\d{2}-\\d{2})/);\n                if (isoMatch) return isoMatch[1];\n\n                // Legacy records may store dates as DD/MM/YYYY or DD-MM-YYYY.\n                const legacyMatch = value.match(/^(\\d{2})[\\/-](\\d{2})[\\/-](\\d{4})/);\n                if (legacyMatch) return `${legacyMatch[3]}-${legacyMatch[2]}-${legacyMatch[1]}`;\n\n                return value.slice(0, 10);\n            }"""
if old in source:
    source = source.replace(old, new, 1)

old2 = """                    const allSnap = await getDocs(collection(db, 'attendance'));\n                    data = buildData(allSnap, true);\n                } catch (fallbackError: any) {"""
new2 = """                    const allSnap = await getDocs(collection(db, 'attendance'));\n                    data = buildData(allSnap, true);\n                    console.info(`[AbsensiTab] Compatibility attendance fallback loaded ${data.length} record(s) for ${filterDate}.`);\n                } catch (fallbackError: any) {"""
if old2 in source:
    source = source.replace(old2, new2, 1)

# 2) Add one shared date normalizer for monthly/AI reporting.
marker = """export default function AbsensiTab() {\n"""
helper = """const normalizeAttendanceDate = (value: any): string => {\n    if (!value) return '';\n    if (typeof value === 'string') {\n        const isoMatch = value.match(/(\\d{4}-\\d{2}-\\d{2})/);\n        if (isoMatch) return isoMatch[1];\n        const legacyMatch = value.match(/^(\\d{2})[\\/-](\\d{2})[\\/-](\\d{4})/);\n        if (legacyMatch) return `${legacyMatch[3]}-${legacyMatch[2]}-${legacyMatch[1]}`;\n        return value.slice(0, 10);\n    }\n    if (value?.toDate) {\n        try { return format(value.toDate(), 'yyyy-MM-dd'); } catch (_) {}\n    }\n    if (value instanceof Date) return format(value, 'yyyy-MM-dd');\n    return '';\n};\n\n"""
if 'const normalizeAttendanceDate = (value: any): string =>' not in source:
    if marker not in source:
        raise SystemExit('component marker not found')
    source = source.replace(marker, helper + marker, 1)

# 3) Monthly view: read the authoritative attendance collection, then normalize dates locally.
# This prevents mixed ISO/legacy date formats from hiding August records.
old3 = """        const start = `${selectedMonth}-01`;\n        const end = `${selectedMonth}-31`;\n        const q = query(\n            collection(db, 'attendance'),\n            where('tanggal', '>=', start),\n            where('tanggal', '<=', end)\n        );\n\n        const unsubMonthly = onSnapshot(q, (snap) => {\n            const records: any[] = [];\n            snap.forEach(doc => {\n                records.push({ id: doc.id, ...doc.data() });\n            });\n            setMonthlyRecords(records);\n            setMonthlyLoading(false);\n        }, (error) => {"""
new3 = """        // Read the authoritative attendance collection and normalize every stored date.\n        // Do not rely on a Firestore string range because legacy records can use\n        // DD/MM/YYYY or DD-MM-YYYY and would otherwise be silently excluded.\n        const unsubMonthly = onSnapshot(collection(db, 'attendance'), (snap) => {\n            const records: any[] = [];\n            snap.forEach(doc => {\n                const record = { id: doc.id, ...doc.data() };\n                if (normalizeAttendanceDate(record.tanggal).startsWith(selectedMonth)) {\n                    records.push(record);\n                }\n            });\n            records.sort((a, b) => {\n                const da = normalizeAttendanceDate(a.tanggal);\n                const db = normalizeAttendanceDate(b.tanggal);\n                return `${db} ${b.jam_masuk || ''}`.localeCompare(`${da} ${a.jam_masuk || ''}`);\n            });\n            setMonthlyRecords(records);\n            setMonthlyLoading(false);\n        }, (error) => {"""
if old3 not in source:
    raise SystemExit('monthly query block not found')
source = source.replace(old3, new3, 1)

# 4) Monthly AI report: normalize before filtering so legacy August records are included.
old4 = """            const start = `${selectedMonth}-01`;\n            const end = `${selectedMonth}-31`;\n            const response = await fetch('/api/generate-ai-report',"""
new4 = """            const start = `${selectedMonth}-01`;\n            const end = `${selectedMonth}-31`;\n            const normalizedMonthlyRecords = filteredMonthlyRecords.map(record => ({\n                ...record,\n                tanggal: normalizeAttendanceDate(record.tanggal) || record.tanggal\n            }));\n            const response = await fetch('/api/generate-ai-report',"""
if old4 not in source:
    raise SystemExit('monthly AI report block not found')
source = source.replace(old4, new4, 1)

old5 = """                    records: filteredMonthlyRecords,\n                    users: usersMap,"""
new5 = """                    records: normalizedMonthlyRecords,\n                    users: usersMap,"""
if old5 not in source:
    raise SystemExit('monthly AI records payload not found')
source = source.replace(old5, new5, 1)

# 5) Generic AI report: normalize date values before applying the report range.
old6 = """            const filtered = allRecords.filter(r => r.tanggal >= reportStartDate && r.tanggal <= reportEndDate);"""
new6 = """            const filtered = allRecords\n                .map(r => ({ ...r, tanggal: normalizeAttendanceDate(r.tanggal) || r.tanggal }))\n                .filter(r => r.tanggal >= reportStartDate && r.tanggal <= reportEndDate);"""
if old6 in source:
    source = source.replace(old6, new6, 1)

path.write_text(source, encoding='utf-8')
print('Applied complete attendance date compatibility for daily, August/monthly views, and AI reports.')
