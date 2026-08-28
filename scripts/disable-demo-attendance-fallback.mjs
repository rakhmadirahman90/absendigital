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
  }
];

let changed = false;
for (const { from, to } of replacements) {
  if (source.includes(from)) {
    source = source.split(from).join(to);
    changed = true;
  }
}

if (!source.includes('DEFAULT_ATTENDANCE') && source.includes(', DEFAULT_ATTENDANCE')) {
  source = source.replace(', DEFAULT_ATTENDANCE', '');
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, source, 'utf8');
  console.log('Attendance demo fallback disabled: Firestore is authoritative.');
} else {
  console.log('Attendance demo fallback already disabled; continuing build.');
}
