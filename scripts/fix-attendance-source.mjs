import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/pages/admin/AbsensiTab.tsx');
let s = fs.readFileSync(file, 'utf8');

// For a specific date, the attendance table must be empty when Firestore has
// no records. Never substitute DEFAULT_ATTENDANCE/demo records for today.
const oldBlock = `            if (data.length === 0) {\n                data = [...DEFAULT_ATTENDANCE];\n            }`;
const newBlock = `            if (data.length === 0) {\n                // Source of truth is Firestore. For a specific date, do not\n                // inject demo/default attendance that could show false times.\n                data = filterDateMode === 'all' ? [...DEFAULT_ATTENDANCE] : [];\n            }`;

if (!s.includes(oldBlock)) {
  throw new Error('Expected attendance fallback block was not found; refusing to modify source.');
}

s = s.replace(oldBlock, newBlock);
fs.writeFileSync(file, s, 'utf8');
console.log('Daily attendance source-of-truth fix applied.');
