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

# Remove the expensive collection-wide compatibility fallback after an empty daily query.
old_fallback = re.compile(r"\n\s*// Primary exact-date query is efficient\. If it returns zero rows,.*?\n\s*}\n\n\s*setAttendance\(data\);", re.S)
new_fallback = """\n            // Legacy daily formats are already covered by the bounded OR query.\n            // Never fall back to reading the entire collection here.\n            setAttendance(data);"""
s, n = old_fallback.subn(new_fallback, s, count=1)
if n == 0:
    # Already repaired is acceptable.
    pass

# Replace the collection-wide monthly listener with a bounded ISO month query.
start_marker = "        const unsubMonthly = onSnapshot(collection(db, 'attendance'), (snap) => {"
end_marker = "\n\n        // Listen to payroll adjustments for this month"
start = s.find(start_marker)
end = s.find(end_marker, start)
if start != -1 and end != -1:
    monthly = """        const [monthYear, monthNum] = selectedMonth.split('-');\n        const monthStart = `${selectedMonth}-01`;\n        const nextMonthDate = new Date(Number(monthYear), Number(monthNum), 1);\n        const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;\n        const monthQuery = query(\n            collection(db, 'attendance'),\n            where('tanggal', '>=', monthStart),\n            where('tanggal', '<', nextMonth)\n        );\n\n        const unsubMonthly = onSnapshot(monthQuery, (snap) => {\n            const records: any[] = [];\n            snap.forEach(doc => records.push({ id: doc.id, ...doc.data() }));\n            records.sort((a, b) => `${normalizeAttendanceDate(b.tanggal)} ${b.jam_masuk || ''}`.localeCompare(`${normalizeAttendanceDate(a.tanggal)} ${a.jam_masuk || ''}`));\n            setMonthlyRecords(records);\n            setMonthlyLoading(false);\n        }, (error) => {\n            console.warn('[AbsensiTab] Monthly records sync notice:', error?.message || error);\n            setMonthlyRecords([]);\n            setMonthlyLoading(false);\n        });"""
    s = s[:start] + monthly + s[end:]

path.write_text(s, encoding='utf-8')
print('Firestore attendance read paths repaired for quota safety.')
