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

// Legacy-safe checkout rule:
// - Today: only a verified checkout is displayed as JAM PULANG.
// - Historical dates: an already-stored jam_pulang is preserved even when
//   older records do not contain checkout metadata. This prevents historical
//   payroll from becoming 0 after the newer checkout-proof validation.
const oldCheckoutHelper = `    const hasVerifiedCheckout = (item: any) => Boolean(\n        item?.jam_pulang && (\n            item?.checkout_status === 'success' ||\n            item?.checkout_at ||\n            item?.method_pulang ||\n            item?.selfie_pulang ||\n            item?.latitude_pulang !== undefined ||\n            item?.longitude_pulang !== undefined\n        )\n    );\n\n    const getEffectiveCheckoutTime = (item: any) =>\n        hasVerifiedCheckout(item) ? item.jam_pulang : '';\n`;
const newCheckoutHelper = `    const hasVerifiedCheckout = (item: any) => {\n        if (!item?.jam_pulang) return false;\n\n        const isStoredCheckoutVerified = Boolean(\n            item?.checkout_status === 'success' ||\n            item?.checkout_at ||\n            item?.method_pulang ||\n            item?.selfie_pulang ||\n            item?.latitude_pulang !== undefined ||\n            item?.longitude_pulang !== undefined\n        );\n\n        // Keep today's UI strict so an unverified/stale jam_pulang cannot\n        // falsely show that the employee has already checked out.\n        const today = format(new Date(), 'yyyy-MM-dd');\n        const recordDate = String(item?.tanggal || '');\n        if (recordDate === today) return isStoredCheckoutVerified;\n\n        // Historical attendance is immutable source data. If a checkout time\n        // was already stored before this validation was introduced, preserve it.\n        return isStoredCheckoutVerified || Boolean(recordDate && recordDate < today);\n    };\n\n    const getEffectiveCheckoutTime = (item: any) =>\n        hasVerifiedCheckout(item) ? item.jam_pulang : '';\n`;
if (s.includes(oldCheckoutHelper)) {
  s = s.replace(oldCheckoutHelper, newCheckoutHelper);
} else if (!s.includes('const getEffectiveCheckoutTime = (item: any)')) {
  throw new Error('Checkout helper not found; refusing to modify attendance source.');
}

// Use the exact stored check-in/out clocks for work-hour calculations.
if (!s.includes('const getEffectiveWorkHours = (item: any) =>')) {
  s = s.replace(
    "import { calculateAutoBreakHours } from '../../lib/utils';",
    "import { calculateAutoBreakHours, calculateStoredWorkHours, parseStoredAttendanceTime } from '../../lib/utils';"
  );
  const anchor = `    const getEffectiveCheckoutTime = (item: any) =>\n        hasVerifiedCheckout(item) ? item.jam_pulang : '';\n`;
  const helper = `${anchor}\n    const getEffectiveWorkHours = (item: any) => {\n        const jamMasuk = item?.jam_masuk;\n        if (!jamMasuk) return 0;\n        const jamPulang = getEffectiveCheckoutTime(item);\n        if (jamPulang) return calculateStoredWorkHours(jamMasuk, jamPulang, item?.istirahat) ?? 0;\n        const today = format(new Date(), 'yyyy-MM-dd');\n        if (String(item?.tanggal || '') !== today) return Number(item?.total_jam_kerja) || 0;\n        const inTime = parseStoredAttendanceTime(jamMasuk);\n        const currentClock = format(new Date(), 'HH:mm:ss');\n        const nowTime = parseStoredAttendanceTime(currentClock);\n        if (inTime === null || nowTime === null || nowTime <= inTime) return 0;\n        const breakHours = calculateAutoBreakHours(String(jamMasuk), currentClock, item?.istirahat);\n        return Number(Math.max(0, nowTime - inTime - breakHours).toFixed(2));\n    };\n`;
  if (!s.includes(anchor)) throw new Error('Expected checkout helper anchor was not found; refusing to modify source.');
  s = s.replace(anchor, helper);
}

// Replace read/display/calculation access to stored total hours with the authoritative calculation.
s = s.replace(/\b(item|record|rec|r)\.total_jam_kerja\b/g, 'getEffectiveWorkHours($1)');

// PUNDU employee migration: change employee 123456/12345 to PUNDU,
// set both hourly rates to Rp10.000, and remove duplicate PUNDU user records.
const karyawanFile = path.join(process.cwd(), 'src/pages/admin/KaryawanTab.tsx');
let k = fs.readFileSync(karyawanFile, 'utf8');
if (!k.includes('PUNDU_EMPLOYEE_MIGRATION_V1')) {
  const anchor = `    const handleSubmit = async (e: React.FormEvent) => {\n`;
  const migration = `    // PUNDU_EMPLOYEE_MIGRATION_V1\n    useEffect(() => {\n        if (!users.length) return;\n        const runPunduMigration = async () => {\n            try {\n                const targetIds = new Set(['123456', '12345', 'wa-123456', 'wa-12345']);\n                let target = users.find(u => targetIds.has(String(u.id)) || targetIds.has(String(u.waNumber)));\n                if (!target) target = users.find(u => String(u.nama || '').trim().toUpperCase() === 'PUNDU');\n                if (!target) target = users.find(u => String(u.nama || '').trim().toUpperCase() === 'KARYAWAN');\n                if (!target) return;\n\n                const targetId = String(target.id);\n                await setDoc(doc(db, 'users', targetId), {\n                    ...target,\n                    nama: 'PUNDU',\n                    divisi: target.divisi || '162',\n                    jabatan: target.jabatan || 'OPERATOR',\n                    role: target.role || 'karyawan',\n                    gaji_type: 'per_jam',\n                    gaji_per_jam: 10000,\n                    gaji_lembur_per_jam: 10000\n                }, { merge: true });\n\n                const duplicates = users.filter(u => String(u.id) !== targetId && String(u.nama || '').trim().toUpperCase() === 'PUNDU');\n                for (const duplicate of duplicates) {\n                    await deleteDoc(doc(db, 'users', String(duplicate.id)));\n                }\n            } catch (error) {\n                console.warn('[PUNDU migration] skipped:', error);\n            }\n        };\n        runPunduMigration();\n    }, [users]);\n\n`;
  if (!k.includes(anchor)) throw new Error('KaryawanTab handleSubmit anchor not found; refusing to modify source.');
  k = k.replace(anchor, migration + anchor);
}
fs.writeFileSync(karyawanFile, k, 'utf8');

// Keep bundled fallback/default PUNDU configuration consistent.
const defaultFile = path.join(process.cwd(), 'src/data/defaultData.ts');
let d = fs.readFileSync(defaultFile, 'utf8');
d = d.replace("gaji_per_jam: 10000,\n    gaji_lembur_per_jam: 14000,", "gaji_per_jam: 10000,\n    gaji_lembur_per_jam: 10000,");
fs.writeFileSync(defaultFile, d, 'utf8');

fs.writeFileSync(file, s, 'utf8');
console.log('Attendance source-of-truth, legacy checkout preservation, live hours, and PUNDU payroll migration fixes applied.');
