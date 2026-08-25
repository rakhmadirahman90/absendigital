import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';

const firebaseConfig = {
  projectId: 'polynomial-node-c2gpt',
  appId: '1:397253837002:web:7ebe7dbe248c8c72f0b433',
  apiKey: 'AIzaSyCeSU11fbjNcojjlfgKudsjq4vIv8C3oSw',
  authDomain: 'polynomial-node-c2gpt.firebaseapp.com',
  storageBucket: 'polynomial-node-c2gpt.firebasestorage.app',
  messagingSenderId: '397253837002',
};

const DATABASE_ID = 'ai-studio-624bea7c-68f3-4297-85df-707056c1d162';
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, DATABASE_ID);

const CANONICAL = {
  PUNDU: { id: 'wa-0816200005', waNumber: '0816200005' },
  ASMA: { id: 'wa-0816200001', waNumber: '0816200001' },
};

const norm = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const digits = (v) => String(v ?? '').replace(/\D/g, '');

async function listCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

async function patchDocument(collectionName, id, updates) {
  await setDoc(doc(db, collectionName, id), updates, { merge: true });
}

async function deleteDocument(collectionName, id) {
  await deleteDoc(doc(db, collectionName, id));
}

function isPunduUser(u) {
  return norm(u.nama) === 'PUNDU' || digits(u.waNumber) === CANONICAL.PUNDU.waNumber || u.id === '123456';
}

function isAsmaUser(u) {
  return norm(u.nama) === 'ASMA' && digits(u.waNumber) !== CANONICAL.PUNDU.waNumber;
}

function attendanceQuality(x) {
  let score = 0;
  if (x.jam_masuk) score += 2;
  if (x.checkout_status === 'success' || x.checkout_at || x.jam_pulang) score += 4;
  if (x.latitude_masuk !== undefined || x.longitude_masuk !== undefined) score += 1;
  if (x.selfie_masuk || x.photo_masuk) score += 1;
  if (x.created_at) score += 1;
  return score;
}

async function mergePunduAttendance(canonicalId) {
  const raw = await listCollection('attendance');
  const docs = raw.filter(({ data }) =>
    String(data.user_id || '') === canonicalId ||
    digits(data.user_waNumber || data.waNumber) === CANONICAL.PUNDU.waNumber ||
    norm(data.nama) === 'PUNDU'
  );

  const groups = new Map();
  for (const item of docs) {
    const date = String(item.data.tanggal || '');
    if (!date) continue;
    const arr = groups.get(date) || [];
    arr.push(item);
    groups.set(date, arr);
  }

  let kept = 0;
  let removed = 0;
  for (const group of groups.values()) {
    group.sort((a, b) => attendanceQuality(b.data) - attendanceQuality(a.data));
    const keeper = group[0];
    const merged = { ...keeper.data };

    for (const item of group.slice(1)) {
      for (const [key, value] of Object.entries(item.data)) {
        if ((merged[key] === undefined || merged[key] === null || merged[key] === '') && value !== undefined && value !== null && value !== '') {
          merged[key] = value;
        }
      }
    }

    const updates = {
      user_id: canonicalId,
      user_waNumber: CANONICAL.PUNDU.waNumber,
      nama: 'PUNDU',
      user_nama: 'PUNDU',
    };

    for (const key of [
      'employeeName', 'waNumber', 'jam_masuk', 'jam_pulang',
      'checkin_status', 'checkout_status', 'checkin_at', 'checkout_at',
      'method_masuk', 'method_pulang', 'status', 'istirahat', 'is_lembur',
      'dryer_menyala', 'total_jam_kerja'
    ]) {
      if (merged[key] !== undefined) {
        updates[key] = key === 'employeeName'
          ? 'PUNDU'
          : key === 'waNumber'
            ? CANONICAL.PUNDU.waNumber
            : merged[key];
      }
    }

    await patchDocument('attendance', keeper.id, updates);
    kept++;

    for (const item of group.slice(1)) {
      await deleteDocument('attendance', item.id);
      removed++;
    }
  }
  return { kept, removed };
}

async function main() {
  const users = await listCollection('users');
  const actions = [];

  const canonicalPundu = users.find((u) => u.id === CANONICAL.PUNDU.id) || users.find(isPunduUser);
  const canonicalAsma = users.find((u) => u.id === CANONICAL.ASMA.id) || users.find(isAsmaUser);
  const punduId = canonicalPundu?.id || CANONICAL.PUNDU.id;
  const asmaId = canonicalAsma?.id || CANONICAL.ASMA.id;

  // The record shown as Karyawan (123456), or any user carrying PUNDU's WA, belongs to PUNDU.
  const punduDuplicates = users.filter((u) => u.id !== punduId && isPunduUser(u));
  for (const duplicate of punduDuplicates) {
    for (const collectionName of ['attendance', 'payrolls', 'leave_requests', 'overtime_requests']) {
      const docs = await listCollection(collectionName);
      for (const item of docs) {
        const x = item.data;
        if (String(x.user_id || '') !== duplicate.id && digits(x.user_waNumber || x.waNumber) !== digits(duplicate.waNumber)) continue;

        const updates = {
          user_id: punduId,
          user_waNumber: CANONICAL.PUNDU.waNumber,
          nama: 'PUNDU',
        };
        if (x.user_nama !== undefined) updates.user_nama = 'PUNDU';
        if (x.employeeName !== undefined) updates.employeeName = 'PUNDU';
        if (x.waNumber !== undefined) updates.waNumber = CANONICAL.PUNDU.waNumber;
        await patchDocument(collectionName, item.id, updates);
      }
    }

    await deleteDocument('users', duplicate.id);
    actions.push(`merged user ${duplicate.id} -> PUNDU`);
  }

  const punduRef = doc(db, 'users', punduId);
  const punduSnap = await getDoc(punduRef);
  if (!punduSnap.exists()) {
    await setDoc(punduRef, {
      waNumber: CANONICAL.PUNDU.waNumber,
      nama: 'PUNDU', divisi: '162', jabatan: 'OPERATOR', role: 'karyawan',
      password: '123456', assignedOfficeId: 'all', gaji_type: 'per_jam',
      gaji_bulanan: 0, gaji_per_jam: 10000, gaji_lembur_per_jam: 14000, bonus_dryer_1: false,
    });
  } else {
    await patchDocument('users', punduId, { nama: 'PUNDU', waNumber: CANONICAL.PUNDU.waNumber });
  }

  const punduAttendance = await mergePunduAttendance(punduId);
  actions.push(`PUNDU attendance normalized: ${punduAttendance.kept} kept, ${punduAttendance.removed} duplicates removed`);

  // Preserve one canonical ASMA and remove all other duplicate ASMA user records.
  const asmaDuplicates = users.filter((u) => u.id !== asmaId && isAsmaUser(u));
  for (const duplicate of asmaDuplicates) {
    for (const collectionName of ['attendance', 'payrolls', 'leave_requests', 'overtime_requests']) {
      const docs = await listCollection(collectionName);
      for (const item of docs) {
        const x = item.data;
        if (String(x.user_id || '') !== duplicate.id) continue;

        const updates = {
          user_id: asmaId,
          user_waNumber: CANONICAL.ASMA.waNumber,
          nama: 'ASMA',
        };
        if (x.user_nama !== undefined) updates.user_nama = 'ASMA';
        if (x.employeeName !== undefined) updates.employeeName = 'ASMA';
        if (x.waNumber !== undefined) updates.waNumber = CANONICAL.ASMA.waNumber;
        await patchDocument(collectionName, item.id, updates);
      }
    }

    await deleteDocument('users', duplicate.id);
    actions.push(`deleted duplicate ASMA user ${duplicate.id}`);
  }

  const asmaRef = doc(db, 'users', asmaId);
  const asmaSnap = await getDoc(asmaRef);
  if (!asmaSnap.exists()) {
    await setDoc(asmaRef, {
      waNumber: CANONICAL.ASMA.waNumber,
      nama: 'ASMA', divisi: '162', jabatan: 'OPERATOR', role: 'karyawan',
      password: '123456', assignedOfficeId: 'all', gaji_type: 'per_jam',
      gaji_bulanan: 0, gaji_per_jam: 12000, gaji_lembur_per_jam: 16000, bonus_dryer_1: false,
    });
  } else {
    await patchDocument('users', asmaId, { nama: 'ASMA', waNumber: CANONICAL.ASMA.waNumber });
  }

  console.log(JSON.stringify({ ok: true, punduUserId: punduId, asmaUserId: asmaId, actions }, null, 2));
}

main().catch((error) => {
  console.error('[employee-repair] FAILED:', error);
  process.exitCode = 1;
});
