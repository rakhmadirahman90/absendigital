import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// READ-ONLY audit. This script intentionally contains no set/update/delete operations.
const firebaseConfig = {
  projectId: 'polynomial-node-c2gpt',
  appId: '1:397253837002:web:7ebe7dbe248c8c72f0b433',
  apiKey: 'AIzaSyCeSU11fbjNcojjlfgKudsjq4vIv8C3oSw',
  authDomain: 'polynomial-node-c2gpt.firebaseapp.com',
  storageBucket: 'polynomial-node-c2gpt.firebasestorage.app',
  messagingSenderId: '397253837002',
};
const DATABASE_ID = 'ai-studio-624bea7c-68f3-4297-85df-707056c1d162';
const db = getFirestore(initializeApp(firebaseConfig), DATABASE_ID);

const wanted = new Set(['ASMA', 'ABI', 'PUNDU']);
const norm = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const digits = (v) => String(v ?? '').replace(/\D/g, '');

const identity = (x) => norm(x.nama || x.user_nama || x.employeeName || x.name);
const belongsToWanted = (x) => {
  const name = identity(x);
  return wanted.has(name) || ['ASMA', 'ABI', 'PUNDU'].includes(norm(x.karyawan));
};

const stable = (v) => {
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v && typeof v === 'object' && v.seconds !== undefined) return `${v.seconds}.${v.nanoseconds || 0}`;
  return v;
};

function normalizeRecord(id, x) {
  const keys = [
    'tanggal', 'user_id', 'user_waNumber', 'waNumber', 'nama', 'user_nama', 'employeeName',
    'jam_masuk', 'jam_pulang', 'checkin_status', 'checkout_status', 'checkin_at', 'checkout_at',
    'status', 'istirahat', 'total_jam_kerja', 'is_lembur', 'method_masuk', 'method_pulang',
  ];
  return Object.fromEntries([['id', id], ...keys.filter((k) => k in x).map((k) => [k, stable(x[k])])]);
}

async function read(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

async function main() {
  const [users, attendance] = await Promise.all([read('users'), read('attendance')]);
  const employees = users.filter(({ data }) => wanted.has(norm(data.nama || data.name || data.employeeName)) || wanted.has(norm(data.user_nama)));

  const employeeIds = new Set(employees.map(({ id }) => id));
  const employeePhones = new Set(employees.map(({ data }) => digits(data.waNumber || data.phone || data.user_waNumber)).filter(Boolean));
  const records = attendance
    .filter(({ data }) => employeeIds.has(String(data.user_id || '')) || employeePhones.has(digits(data.user_waNumber || data.waNumber)) || belongsToWanted(data))
    .map(({ id, data }) => normalizeRecord(id, data))
    .sort((a, b) => `${a.nama || a.user_nama || a.employeeName || ''}|${a.tanggal || ''}|${a.jam_masuk || ''}`.localeCompare(`${b.nama || b.user_nama || b.employeeName || ''}|${b.tanggal || ''}|${b.jam_masuk || ''}`));

  const byEmployee = Object.fromEntries([...wanted].map((name) => [name, records.filter((r) => identity(r) === name || norm(r.karyawan) === name)]));
  const duplicatesByEmployeeDate = {};
  for (const name of wanted) {
    const map = new Map();
    for (const r of byEmployee[name]) {
      const key = `${r.tanggal || ''}`;
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    duplicatesByEmployeeDate[name] = Object.fromEntries([...map].filter(([, count]) => count > 1));
  }

  console.log(JSON.stringify({
    readOnly: true,
    generatedAt: new Date().toISOString(),
    employeeUsers: employees.map(({ id, data }) => ({ id, nama: data.nama || data.name, waNumber: data.waNumber || data.phone || data.user_waNumber })),
    counts: Object.fromEntries([...wanted].map((name) => [name, byEmployee[name].length])),
    duplicateDates: duplicatesByEmployeeDate,
    attendance: byEmployee,
  }, null, 2));
}

main().catch((err) => {
  console.error('[attendance-audit-readonly] FAILED', err);
  process.exitCode = 1;
});
