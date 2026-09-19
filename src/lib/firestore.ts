import { createClient } from '@supabase/supabase-js';
import { auth } from './firebase';

const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  'https://missjyvqfehamtpyodjr.supabase.co';

const SUPABASE_KEY =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_trhfpzLX50WdkdaItRPFMQ_ewqF0fgn';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  accessToken: async () => {
    try {
      return (await auth.currentUser?.getIdToken(false)) ?? null;
    } catch {
      return null;
    }
  },
});

// Compatibility layer for the existing Firestore-shaped application.
// The application keeps its existing query/write call sites while the
// persistence layer is now Supabase PostgreSQL.
export const db = supabase;

type Constraint =
  | { type: 'where'; field: string; op: string; value: any }
  | { type: 'orderBy'; field: string; direction: 'asc' | 'desc' }
  | { type: 'limit'; value: number }
  | { type: 'or'; constraints: Constraint[] };

type Ref = { kind: 'collection' | 'doc'; collection: string; id?: string };
type QueryRef = { kind: 'query'; collection: string; constraints: Constraint[] };

const TABLES: Record<string, string> = {
  users: 'hadir_users',
  attendance: 'hadir_attendance',
  leave_requests: 'hadir_leave_requests',
  overtime: 'hadir_overtime',
  payrolls: 'hadir_payrolls',
  settings: 'hadir_settings',
  notifications: 'hadir_notifications',
  wa_logs: 'hadir_wa_logs',
  attendance_adjustments: 'hadir_attendance_adjustments',
  wa_scheduled_triggers: 'hadir_wa_scheduled_triggers',
};

const tableFor = (name: string) => TABLES[name] || name;

export const collection = (_db: any, name: string): Ref => ({
  kind: 'collection',
  collection: name,
});

export const doc = (_db: any, collectionName: string, id: string): Ref => ({
  kind: 'doc',
  collection: collectionName,
  id,
});

export const where = (field: string, op: string, value: any): Constraint => ({
  type: 'where',
  field,
  op,
  value,
});

export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc'): Constraint => ({
  type: 'orderBy',
  field,
  direction,
});

export const limit = (value: number): Constraint => ({
  type: 'limit',
  value,
});

export const or = (...constraints: Constraint[]): Constraint => ({
  type: 'or',
  constraints,
});

export const serverTimestamp = () => ({ __hadirServerTimestamp: true });

const nowIso = () => new Date().toISOString();

function materialize(value: any): any {
  if (value && typeof value === 'object') {
    if (value.__hadirServerTimestamp) return nowIso();
    if (Array.isArray(value)) return value.map(materialize);
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = materialize(v);
    return out;
  }
  return value;
}

function rowToDocument(collectionName: string, row: any) {
  const base = row?.data && typeof row.data === 'object' ? { ...row.data } : {};
  delete base.data;

  if (collectionName === 'settings') {
    return { id: row.id, ...base };
  }

  const explicit: Record<string, any> = {
    id: row.id,
    user_id: row.user_id,
    tanggal: row.tanggal,
    jam_masuk: row.jam_masuk,
    jam_pulang: row.jam_pulang,
    status: row.status,
    latitude_masuk: row.latitude_masuk,
    longitude_masuk: row.longitude_masuk,
    alamat_masuk: row.alamat_masuk,
    latitude_pulang: row.latitude_pulang,
    longitude_pulang: row.longitude_pulang,
    alamat_pulang: row.alamat_pulang,
    selfie_masuk: row.selfie_masuk,
    selfie_pulang: row.selfie_pulang,
    leave_request_id: row.leave_request_id,
    overtime_request_id: row.overtime_request_id,
    via: row.via,
    keterangan: row.keterangan,
    created_at: row.created_at,
    updated_at: row.updated_at,
    waNumber: row.wa_number,
    wa_number: row.wa_number,
    nama: row.nama,
    divisi: row.divisi,
    jabatan: row.jabatan,
    password: row.password,
    role: row.role,
    loginMethod: row.login_method,
    login_method: row.login_method,
    assignedOfficeId: row.assigned_office_id,
    assigned_office_id: row.assigned_office_id,
    photo_url: row.photo_url,
    email: row.email,
    read: row.read,
    title: row.title,
    message: row.message,
    type: row.type,
    triggerTime: row.trigger_time,
    trigger_time: row.trigger_time,
    timestamp: row.timestamp,
    jenis: row.jenis,
    alasan: row.alasan,
    tanggal_mulai: row.tanggal_mulai,
    tanggal_akhir: row.tanggal_akhir,
    durasi_jam: row.durasi_jam,
    jam_mulai: row.jam_mulai,
    jam_selesai: row.jam_selesai,
    periode: row.periode,
    bulan: row.bulan,
    tahun: row.tahun,
  };

  for (const [key, value] of Object.entries(explicit)) {
    if (value === undefined || value === null) delete explicit[key];
  }

  return { ...base, ...explicit, id: row.id };
}

function documentToRow(collectionName: string, id: string, payload: any) {
  const p = materialize(payload || {});
  const data = { ...p };
  delete data.id;

  const row: any = {
    id,
    data,
  };

  if (collectionName === 'settings') {
    row.data = data;
    row.updated_at = nowIso();
    return row;
  }

  const pick = (key: string, ...aliases: string[]) => {
    for (const k of [key, ...aliases]) {
      if (p[k] !== undefined) return p[k];
    }
    return undefined;
  };

  if (collectionName === 'users') {
    row.wa_number = pick('waNumber', 'wa_number');
    row.nama = p.nama;
    row.divisi = p.divisi;
    row.jabatan = p.jabatan;
    row.password = p.password;
    row.role = p.role;
    row.status = p.status;
    row.login_method = pick('loginMethod', 'login_method');
    row.assigned_office_id = pick('assignedOfficeId', 'assigned_office_id');
    row.photo_url = p.photo_url;
    row.email = p.email;
  } else if (collectionName === 'attendance') {
    for (const k of [
      'user_id','tanggal','jam_masuk','jam_pulang','status',
      'latitude_masuk','longitude_masuk','alamat_masuk',
      'latitude_pulang','longitude_pulang','alamat_pulang',
      'selfie_masuk','selfie_pulang','leave_request_id',
      'overtime_request_id','via','keterangan','created_at','updated_at'
    ]) row[k] = p[k];
  } else if (collectionName === 'leave_requests') {
    for (const k of ['user_id','tanggal_mulai','tanggal_akhir','jenis','alasan','status','created_at','updated_at']) row[k] = p[k];
  } else if (collectionName === 'overtime') {
    for (const k of ['user_id','tanggal','jam_mulai','jam_selesai','durasi_jam','status','alasan','created_at','updated_at']) row[k] = p[k];
  } else if (collectionName === 'payrolls') {
    for (const k of ['user_id','periode','bulan','tahun','status','created_at','updated_at']) row[k] = p[k];
  } else if (collectionName === 'notifications') {
    for (const k of ['user_id','read','title','message','type','created_at']) row[k] = p[k];
  } else if (collectionName === 'wa_logs') {
    row.wa_number = pick('waNumber', 'wa_number');
    row.nama = p.nama;
    row.message = p.message;
    row.type = p.type;
    row.trigger_time = pick('triggerTime', 'trigger_time');
    row.status = p.status;
    row.timestamp = p.timestamp || nowIso();
  } else if (collectionName === 'attendance_adjustments') {
    row.user_id = p.user_id;
    row.tanggal = p.tanggal;
    row.status = p.status;
    row.created_at = p.created_at || nowIso();
  } else if (collectionName === 'wa_scheduled_triggers') {
    row.status = p.status;
    row.trigger_date = p.dateStr || p.trigger_date;
    row.trigger_hour = p.hour ?? p.trigger_hour;
    row.timestamp = p.timestamp || nowIso();
  }

  for (const key of Object.keys(row)) {
    if (row[key] === undefined) delete row[key];
  }

  return row;
}

function getConstraints(ref: Ref | QueryRef): Constraint[] {
  return ref.kind === 'query' ? ref.constraints : [];
}

export const query = (ref: Ref | QueryRef, ...constraints: Constraint[]): QueryRef => ({
  kind: 'query',
  collection: ref.kind === 'query' ? ref.collection : ref.collection,
  constraints: [
    ...(ref.kind === 'query' ? ref.constraints : []),
    ...constraints,
  ],
});

function compare(value: any, op: string, target: any) {
  if (op === '==') return value === target;
  if (op === '!=') return value !== target;
  if (op === '<') return value < target;
  if (op === '<=') return value <= target;
  if (op === '>') return value > target;
  if (op === '>=') return value >= target;
  if (op === 'array-contains') return Array.isArray(value) && value.includes(target);
  if (op === 'in') return Array.isArray(target) && target.includes(value);
  return true;
}

function matches(row: any, c: Constraint): boolean {
  if (c.type === 'where') return compare(row[c.field], c.op, c.value);
  if (c.type === 'or') return c.constraints.some(inner => matches(row, inner));
  return true;
}

async function fetchRows(ref: Ref | QueryRef) {
  const collectionName = ref.collection;
  let q: any = supabase.from(tableFor(collectionName)).select('*');
  const constraints = getConstraints(ref);

  const serverFilters = constraints.filter((c): c is Extract<Constraint,{type:'where'}> => c.type === 'where');
  for (const c of serverFilters) {
    const fieldMap: Record<string,string> = {
      waNumber: 'wa_number',
      triggerTime: 'trigger_time',
      loginMethod: 'login_method',
      assignedOfficeId: 'assigned_office_id',
    };
    const field = fieldMap[c.field] || c.field;
    if (['==','!=','<','<=','>','>='].includes(c.op)) {
      const method = c.op === '==' ? 'eq' : c.op === '!=' ? 'neq' : c.op === '<' ? 'lt' : c.op === '<=' ? 'lte' : c.op === '>' ? 'gt' : 'gte';
      q = q[method](field, c.value);
    } else if (c.op === 'in') {
      q = q.in(field, c.value);
    }
  }

  const order = constraints.find((c): c is Extract<Constraint,{type:'orderBy'}> => c.type === 'orderBy');
  const lim = constraints.find((c): c is Extract<Constraint,{type:'limit'}> => c.type === 'limit');
  if (order) {
    const fieldMap: Record<string,string> = { waNumber:'wa_number', triggerTime:'trigger_time', loginMethod:'login_method', assignedOfficeId:'assigned_office_id' };
    q = q.order(fieldMap[order.field] || order.field, { ascending: order.direction !== 'desc' });
  }
  if (lim) q = q.limit(lim.value);

  const { data, error } = await q;
  if (error) throw error;

  let rows = (data || []).map((row: any) => rowToDocument(collectionName, row));
  const orConstraints = constraints.filter((c): c is Extract<Constraint,{type:'or'}> => c.type === 'or');
  if (orConstraints.length) rows = rows.filter(row => orConstraints.every(c => matches(row, c)));
  return rows;
}

function snapshot(rows: any[], collectionName: string) {
  const docs = rows.map((data: any) => ({
    id: data.id,
    data: () => data,
    exists: () => true,
    ref: { kind: 'doc', collection: collectionName, id: data.id },
  }));
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (fn: (doc: any) => void) => docs.forEach(fn),
  };
}

export const getDocs = async (ref: Ref | QueryRef) => snapshot(await fetchRows(ref), ref.collection);

export const getDocsFromCache = getDocs;

export const getDoc = async (ref: Ref) => {
  if (ref.kind !== 'doc') throw new Error('getDoc requires a document reference');
  const { data, error } = await supabase
    .from(tableFor(ref.collection))
    .select('*')
    .eq('id', ref.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { id: ref.id, exists: () => false, data: () => undefined, ref };
  const mapped = rowToDocument(ref.collection, data);
  return { id: ref.id, exists: () => true, data: () => mapped, ref };
};

async function mergeWrite(ref: Ref, payload: any, merge: boolean) {
  if (ref.kind !== 'doc') throw new Error('A document reference is required');
  const cleaned = materialize(payload || {});
  let merged = cleaned;
  if (merge) {
    const current = await getDoc(ref);
    merged = current.exists() ? { ...(current.data() || {}), ...cleaned } : cleaned;
  }
  const row = documentToRow(ref.collection, ref.id!, merged);
  const { error } = await supabase
    .from(tableFor(ref.collection))
    .upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

export const setDoc = (ref: Ref, payload: any, options: { merge?: boolean } = {}) =>
  mergeWrite(ref, payload, !!options.merge);

export const updateDoc = async (ref: Ref, payload: any) => mergeWrite(ref, payload, true);

export const deleteDoc = async (ref: Ref) => {
  if (ref.kind !== 'doc') throw new Error('deleteDoc requires a document reference');
  const { error } = await supabase.from(tableFor(ref.collection)).delete().eq('id', ref.id);
  if (error) throw error;
};

export const addDoc = async (ref: Ref, payload: any) => {
  if (ref.kind !== 'collection') throw new Error('addDoc requires a collection reference');
  const id = crypto.randomUUID();
  const row = documentToRow(ref.collection, id, payload);
  const { error } = await supabase.from(tableFor(ref.collection)).insert(row);
  if (error) throw error;
  return { id, ref: { kind: 'doc', collection: ref.collection, id } };
};

export const onSnapshot = (
  ref: Ref | QueryRef,
  onNext: (snapshot: any) => void,
  onError?: (error: any) => void
) => {
  let active = true;
  const run = async () => {
    try {
      const snap = await getDocs(ref);
      if (active) onNext(snap);
    } catch (error) {
      if (active && onError) onError(error);
    }
  };
  void run();
  const timer = window.setInterval(run, 15000);
  return () => {
    active = false;
    window.clearInterval(timer);
  };
};

export const writeBatch = (_db: any) => {
  const operations: Promise<any>[] = [];
  return {
    set(ref: Ref, payload: any, options: { merge?: boolean } = {}) {
      operations.push(setDoc(ref, payload, options));
      return this;
    },
    update(ref: Ref, payload: any) {
      operations.push(updateDoc(ref, payload));
      return this;
    },
    delete(ref: Ref) {
      operations.push(deleteDoc(ref));
      return this;
    },
    commit: async () => { await Promise.all(operations); },
  };
};
