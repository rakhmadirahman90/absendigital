const PROJECT_ID = 'polynomial-node-c2gpt';
const DATABASE_ID = 'ai-studio-624bea7c-68f3-4297-85df-707056c1d162';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

const CANONICAL = {
  PUNDU: { id: 'wa-0816200005', waNumber: '0816200005' },
  ASMA: { id: 'wa-0816200001', waNumber: '0816200001' }
};

const norm = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const digits = (v) => String(v ?? '').replace(/\D/g, '');

function decodeValue(v) {
  if (!v) return undefined;
  if (Object.hasOwn(v, 'stringValue')) return v.stringValue;
  if (Object.hasOwn(v, 'integerValue')) return Number(v.integerValue);
  if (Object.hasOwn(v, 'doubleValue')) return v.doubleValue;
  if (Object.hasOwn(v, 'booleanValue')) return v.booleanValue;
  if (Object.hasOwn(v, 'timestampValue')) return v.timestampValue;
  if (Object.hasOwn(v, 'nullValue')) return null;
  return undefined;
}

function decodeDoc(doc) {
  return Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, decodeValue(v)]));
}

function encodeValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number' && Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  return { stringValue: String(v) };
}

async function listCollection(collection) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${BASE}/${collection}?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${collection}: list failed ${res.status} ${await res.text()}`);
    const json = await res.json();
    docs.push(...(json.documents || []));
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function patchFields(documentPath, updates) {
  const params = Object.keys(updates)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&');
  const body = { fields: Object.fromEntries(Object.entries(updates).map(([k, v]) => [k, encodeValue(v)])) };
  const res = await fetch(`${BASE}/${documentPath}?${params}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`patch ${documentPath} failed ${res.status} ${await res.text()}`);
}

async function deleteDocument(documentPath) {
  const res = await fetch(`${BASE}/${documentPath}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`delete ${documentPath} failed ${res.status} ${await res.text()}`);
}

async function createDocument(documentPath, fields) {
  const res = await fetch(`${BASE}/${documentPath}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)])) }),
  });
  if (!res.ok) throw new Error(`create ${documentPath} failed ${res.status} ${await res.text()}`);
}

function docId(doc) { return doc.name.split('/').pop(); }

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
  const docs = raw.map(d => ({ id: docId(d), data: decodeDoc(d) }))
    .filter(({ data }) => String(data.user_id || '') === canonicalId || digits(data.user_waNumber || data.waNumber) === CANONICAL.PUNDU.waNumber || norm(data.nama) === 'PUNDU');

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
      user_nama: 'PUNDU'
    };
    for (const key of ['employeeName', 'waNumber', 'jam_masuk', 'jam_pulang', 'checkin_status', 'checkout_status', 'checkin_at', 'checkout_at', 'method_masuk', 'method_pulang', 'status', 'istirahat', 'is_lembur', 'dryer_menyala', 'total_jam_kerja']) {
      if (merged[key] !== undefined) updates[key] = key === 'employeeName' || key === 'waNumber' ? (key === 'employeeName' ? 'PUNDU' : CANONICAL.PUNDU.waNumber) : merged[key];
    }
    await patchFields(`attendance/${keeper.id}`, updates);
    kept++;

    for (const item of group.slice(1)) {
      await deleteDocument(`attendance/${item.id}`);
      removed++;
    }
  }
  return { kept, removed };
}

async function main() {
  const usersRaw = await listCollection('users');
  const users = usersRaw.map(d => ({ id: docId(d), ...decodeDoc(d) }));
  const actions = [];

  const canonicalPundu = users.find(u => u.id === CANONICAL.PUNDU.id) || users.find(isPunduUser);
  const canonicalAsma = users.find(u => u.id === CANONICAL.ASMA.id) || users.find(isAsmaUser);
  const punduId = canonicalPundu?.id || CANONICAL.PUNDU.id;
  const asmaId = canonicalAsma?.id || CANONICAL.ASMA.id;

  // The record shown as Karyawan (123456), or any user carrying PUNDU's WA, belongs to PUNDU.
  const punduDuplicates = users.filter(u => u.id !== punduId && isPunduUser(u));
  for (const duplicate of punduDuplicates) {
    for (const collection of ['attendance', 'payrolls', 'leave_requests', 'overtime_requests']) {
      const docs = await listCollection(collection);
      for (const d of docs) {
        const x = decodeDoc(d);
        if (String(x.user_id || '') !== duplicate.id && digits(x.user_waNumber || x.waNumber) !== digits(duplicate.waNumber)) continue;
        const updates = {
          user_id: punduId,
          user_waNumber: CANONICAL.PUNDU.waNumber,
          nama: 'PUNDU'
        };
        if (x.user_nama !== undefined) updates.user_nama = 'PUNDU';
        if (x.employeeName !== undefined) updates.employeeName = 'PUNDU';
        if (x.waNumber !== undefined) updates.waNumber = CANONICAL.PUNDU.waNumber;
        await patchFields(`${collection}/${docId(d)}`, updates);
      }
    }
    await deleteDocument(`users/${duplicate.id}`);
    actions.push(`merged user ${duplicate.id} -> PUNDU`);
  }

  if (!canonicalPundu) {
    await createDocument(`users/${punduId}`, {
      waNumber: CANONICAL.PUNDU.waNumber,
      nama: 'PUNDU', divisi: '162', jabatan: 'OPERATOR', role: 'karyawan',
      password: '123456', assignedOfficeId: 'all', gaji_type: 'per_jam',
      gaji_bulanan: 0, gaji_per_jam: 10000, gaji_lembur_per_jam: 14000, bonus_dryer_1: false
    });
  } else {
    await patchFields(`users/${punduId}`, { nama: 'PUNDU', waNumber: CANONICAL.PUNDU.waNumber });
  }

  const punduAttendance = await mergePunduAttendance(punduId);
  actions.push(`PUNDU attendance normalized: ${punduAttendance.kept} kept, ${punduAttendance.removed} duplicates removed`);

  // Preserve one canonical ASMA and remove other ASMA users. Their related records are relinked to canonical ASMA.
  const asmaDuplicates = users.filter(u => u.id !== asmaId && isAsmaUser(u));
  for (const duplicate of asmaDuplicates) {
    for (const collection of ['attendance', 'payrolls', 'leave_requests', 'overtime_requests']) {
      const docs = await listCollection(collection);
      for (const d of docs) {
        const x = decodeDoc(d);
        if (String(x.user_id || '') !== duplicate.id) continue;
        const updates = {
          user_id: asmaId,
          user_waNumber: CANONICAL.ASMA.waNumber,
          nama: 'ASMA'
        };
        if (x.user_nama !== undefined) updates.user_nama = 'ASMA';
        if (x.employeeName !== undefined) updates.employeeName = 'ASMA';
        if (x.waNumber !== undefined) updates.waNumber = CANONICAL.ASMA.waNumber;
        await patchFields(`${collection}/${docId(d)}`, updates);
      }
    }
    await deleteDocument(`users/${duplicate.id}`);
    actions.push(`deleted duplicate ASMA user ${duplicate.id}`);
  }

  if (!canonicalAsma) {
    await createDocument(`users/${asmaId}`, {
      waNumber: CANONICAL.ASMA.waNumber,
      nama: 'ASMA', divisi: '162', jabatan: 'OPERATOR', role: 'karyawan',
      password: '123456', assignedOfficeId: 'all', gaji_type: 'per_jam',
      gaji_bulanan: 0, gaji_per_jam: 12000, gaji_lembur_per_jam: 16000, bonus_dryer_1: false
    });
  } else {
    await patchFields(`users/${asmaId}`, { nama: 'ASMA', waNumber: CANONICAL.ASMA.waNumber });
  }

  console.log(JSON.stringify({ ok: true, punduUserId: punduId, asmaUserId: asmaId, actions }, null, 2));
}

main().catch((error) => {
  console.error('[employee-repair] FAILED:', error);
  process.exitCode = 1;
});
