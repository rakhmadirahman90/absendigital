from pathlib import Path
import re

path = Path('src/pages/admin/AbsensiTab.tsx')
s = path.read_text(encoding='utf-8')

# Add Firestore OR support for legacy daily date formats without a collection-wide read.
s = s.replace(
    "import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';",
    "import { collection, query, where, or, onSnapshot, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';",
    1,
)

old_q = """        const q = filterDateMode === 'all'\n            ? query(collection(db, 'attendance'))\n            : query(collection(db, 'attendance'), where('tanggal', '==', filterDate));"""
new_q = """        const legacyDate = (() => {\n            const m = filterDate.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);\n            return m ? { slash: `${m[3]}/${m[2]}/${m[1]}`, dash: `${m[3]}-${m[2]}-${m[1]}` } : null;\n        })();\n\n        // One bounded OR query covers ISO + legacy date formats without\n        // downloading the entire attendance collection.\n        const q = filterDateMode === 'all'\n            ? query(collection(db, 'attendance'))\n            : legacyDate\n                ? query(collection(db, 'attendance'), or(\n                    where('tanggal', '==', filterDate),\n                    where('tanggal', '==', legacyDate.slash),\n                    where('tanggal', '==', legacyDate.dash)\n                  ))\n                : query(collection(db, 'attendance'), where('tanggal', '==', filterDate));"""
if old_q in s:
    s = s.replace(old_q, new_q, 1)

# Remove any remaining collection-wide compatibility fallback after an empty daily query.
old_fallback = re.compile(r"\n\s*// Primary exact-date query is efficient\. If it returns zero rows,.*?\n\s*}\n\n\s*setAttendance\(data\);", re.S)
new_fallback = """\n            // Legacy daily formats are already covered by the bounded OR query.\n            // Never fall back to reading the entire collection here.\n            setAttendance(data);"""
s, _ = old_fallback.subn(new_fallback, s, count=1)

# Monthly: read only three bounded date ranges (ISO, DD/MM/YYYY, DD-MM-YYYY).
# This preserves legacy August records while avoiding a full collection scan.
start_marker = "        const [monthYear, monthNum] = selectedMonth.split('-');"
end_marker = "\n\n        // Listen to payroll adjustments for this month"
start = s.find(start_marker)
end = s.find(end_marker, start)
if start != -1 and end != -1:
    monthly = """        const [monthYear, monthNum] = selectedMonth.split('-');\n        const lastDay = new Date(Number(monthYear), Number(monthNum), 0).getDate();\n        const isoStart = `${selectedMonth}-01`;\n        const nextMonthDate = new Date(Number(monthYear), Number(monthNum), 1);\n        const isoEnd = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;\n        const legacyStart = `01/${monthNum}/${monthYear}`;\n        const legacyEnd = `${String(lastDay).padStart(2, '0')}/${monthNum}/${monthYear}`;\n        const legacyDashStart = `01-${monthNum}-${monthYear}`;\n        const legacyDashEnd = `${String(lastDay).padStart(2, '0')}-${monthNum}-${monthYear}`;\n\n        const monthlyQueries = [\n            query(collection(db, 'attendance'), where('tanggal', '>=', isoStart), where('tanggal', '<', isoEnd)),\n            query(collection(db, 'attendance'), where('tanggal', '>=', legacyStart), where('tanggal', '<=', legacyEnd)),\n            query(collection(db, 'attendance'), where('tanggal', '>=', legacyDashStart), where('tanggal', '<=', legacyDashEnd))\n        ];\n        const monthlyById: Record<string, any> = {};\n        let monthlyLoaded = 0;\n        const handleMonthlySnap = (snap: any) => {\n            snap.forEach((docSnap: any) => {\n                monthlyById[docSnap.id] = { id: docSnap.id, ...docSnap.data() };\n            });\n            monthlyLoaded += 1;\n            if (monthlyLoaded === monthlyQueries.length) {\n                const records = Object.values(monthlyById).sort((a: any, b: any) =>\n                    `${normalizeAttendanceDate(b.tanggal)} ${b.jam_masuk || ''}`.localeCompare(`${normalizeAttendanceDate(a.tanggal)} ${a.jam_masuk || ''}`)\n                );\n                setMonthlyRecords(records);\n                setMonthlyLoading(false);\n            }\n        };\n        const monthlyUnsubs = monthlyQueries.map(monthQuery => onSnapshot(monthQuery, handleMonthlySnap, (error) => {\n            console.warn('[AbsensiTab] Monthly records sync notice:', error?.message || error);\n            monthlyLoaded += 1;\n            if (monthlyLoaded === monthlyQueries.length) {\n                setMonthlyRecords(Object.values(monthlyById));\n                setMonthlyLoading(false);\n            }\n        }));\n        const unsubMonthly = () => monthlyUnsubs.forEach(unsub => unsub());"""
    s = s[:start] + monthly + s[end:]

path.write_text(s, encoding='utf-8')
print('Firestore attendance reads are bounded and legacy monthly date formats are included.')
