import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/pages/admin/AbsensiTab.tsx');
let s = fs.readFileSync(file, 'utf8');

// Firestore is the only source of truth for attendance. Never inject demo
// attendance records into the admin table, including "all dates" mode.
const fallbackVariants = [
  `            if (data.length === 0) {\n                data = [...DEFAULT_ATTENDANCE];\n            }`,
  `            if (data.length === 0) {\n                // Source of truth is Firestore. For a specific date, do not\n                // inject demo/default attendance that could show false times.\n                data = filterDateMode === 'all' ? [...DEFAULT_ATTENDANCE] : [];\n            }`
];
const replacement = `            if (data.length === 0) {\n                // Firestore is authoritative. Empty means no stored attendance.\n                data = [];\n            }`;
for (const oldBlock of fallbackVariants) {
  if (s.includes(oldBlock)) s = s.replace(oldBlock, replacement);
}

// Use the exact stored check-in/out clocks for work-hour calculations.
// If today's employee has checked in but not checked out yet, calculate the
// live elapsed hours from the stored check-in time to the current clock.
if (!s.includes('const getEffectiveWorkHours = (item: any) =>')) {
  s = s.replace(
    "import { calculateAutoBreakHours } from '../../lib/utils';",
    "import { calculateAutoBreakHours, calculateStoredWorkHours, parseStoredAttendanceTime } from '../../lib/utils';"
  );

  const anchor = `    const getEffectiveCheckoutTime = (item: any) =>\n        hasVerifiedCheckout(item) ? item.jam_pulang : '';\n`;
  const helper = `${anchor}\n    const getEffectiveWorkHours = (item: any) => {\n        const jamMasuk = item?.jam_masuk;\n        if (!jamMasuk) return 0;\n\n        const jamPulang = getEffectiveCheckoutTime(item);\n        if (jamPulang) {\n            return calculateStoredWorkHours(jamMasuk, jamPulang, item?.istirahat) ?? 0;\n        }\n\n        const today = format(new Date(), 'yyyy-MM-dd');\n        if (String(item?.tanggal || '') !== today) {\n            return Number(item?.total_jam_kerja) || 0;\n        }\n\n        const inTime = parseStoredAttendanceTime(jamMasuk);\n        const currentClock = format(new Date(), 'HH:mm:ss');\n        const nowTime = parseStoredAttendanceTime(currentClock);\n        if (inTime === null || nowTime === null || nowTime <= inTime) return 0;\n\n        const breakHours = calculateAutoBreakHours(String(jamMasuk), currentClock, item?.istirahat);\n        return Number(Math.max(0, nowTime - inTime - breakHours).toFixed(2));\n    };\n`;
  if (!s.includes(anchor)) {
    throw new Error('Expected checkout helper anchor was not found; refusing to modify source.');
  }
  s = s.replace(anchor, helper);
}

// Replace read/display/calculation access to stored total hours with the
// authoritative calculation above. Object keys such as total_jam_kerja: are
// deliberately untouched so Firestore writes remain unchanged.
s = s.replace(/\b(item|record|rec|r)\.total_jam_kerja\b/g, 'getEffectiveWorkHours($1)');

fs.writeFileSync(file, s, 'utf8');
console.log('Attendance source-of-truth and live work-hours fix applied.');
