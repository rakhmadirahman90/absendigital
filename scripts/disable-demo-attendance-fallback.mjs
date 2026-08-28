import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/pages/admin/AbsensiTab.tsx');
let source = fs.readFileSync(file, 'utf8');

// Build-time only. Never writes to Firebase.
// Firestore is the only source of truth for attendance reports.
const replacements = [
  {
    from: `            if (data.length === 0) {\n                data = [...DEFAULT_ATTENDANCE];\n            }`,
    to: `            if (data.length === 0) {\n                // No Firestore record = no attendance. Never inject demo attendance.\n                data = [];\n            }`
  },
  {
    from: `            setAttendance(DEFAULT_ATTENDANCE);`,
    to: `            setAttendance([]);`
  },
  {
    from: `            if (records.length === 0) {\n                setMonthlyRecords(DEFAULT_ATTENDANCE);\n            } else {`,
    to: `            if (records.length === 0) {\n                // No Firestore record = no monthly attendance.\n                setMonthlyRecords([]);\n            } else {`
  },
  {
    from: `            setMonthlyRecords(DEFAULT_ATTENDANCE);`,
    to: `            setMonthlyRecords([]);`
  },
  {
    from: `        const start = \`${'${selectedMonth}'}-01\`;\n        const end = \`${'${selectedMonth}'}-31\`;\n        const q = query(\n            collection(db, 'attendance'),\n            where('tanggal', '>=', start),\n            where('tanggal', '<=', end)\n        );\n\n        const unsubMonthly = onSnapshot(q, (snap) => {\n            const records: any[] = [];\n            snap.forEach(doc => {\n                records.push({ id: doc.id, ...doc.data() });\n            });\n            if (records.length === 0) {\n                setMonthlyRecords(DEFAULT_ATTENDANCE);\n            } else {\n                setMonthlyRecords(records);\n            }\n            setMonthlyLoading(false);\n        }, (error) => {\n            console.warn('[AbsensiTab] Monthly records sync notice, using fallbacks:', error?.message || error);\n            setMonthlyRecords(DEFAULT_ATTENDANCE);\n            setMonthlyLoading(false);\n        });`,
    to: `        // Read the complete attendance collection and filter the selected month in JavaScript.\n        // This avoids range-query/index/date-type mismatches and keeps payroll identical to the admin daily recap.\n        const unsubMonthly = onSnapshot(collection(db, 'attendance'), (snap) => {\n            const start = \`${'${selectedMonth}'}-01\`;\n            const end = \`${'${selectedMonth}'}-31\`;\n            const records: any[] = [];\n            snap.forEach(doc => {\n                const data = doc.data();\n                const tanggal = String(data.tanggal || '');\n                if (tanggal >= start && tanggal <= end) {\n                    records.push({ id: doc.id, ...data });\n                }\n            });\n            records.sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));\n            setMonthlyRecords(records);\n            setMonthlyLoading(false);\n        }, (error) => {\n            console.warn('[AbsensiTab] Monthly records sync notice:', error?.message || error);\n            setMonthlyRecords([]);\n            setMonthlyLoading(false);\n        });`
  }
];

let changed = false;
for (const { from, to } of replacements) {
  if (source.includes(from)) {
    source = source.split(from).join(to);
    changed = true;
  }
}

// Remove the demo attendance import once no reference remains.
if (!source.includes('DEFAULT_ATTENDANCE') && source.includes(', DEFAULT_ATTENDANCE')) {
  source = source.replace(', DEFAULT_ATTENDANCE', '');
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, source, 'utf8');
  console.log('Attendance reports now use authoritative Firestore monthly data.');
} else {
  console.log('Attendance report source already patched; continuing build.');
}
