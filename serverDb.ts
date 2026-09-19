import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://missjyvqfehamtpyodjr.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_trhfpzLX50WdkdaItRPFMQ_ewqF0fgn';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

type Constraint =
  | { type:'where'; field:string; op:string; value:any }
  | { type:'orderBy'; field:string; direction:'asc'|'desc' }
  | { type:'limit'; value:number };

type Ref = { kind:'collection'|'doc'; collection:string; id?:string };
type QueryRef = { kind:'query'; collection:string; constraints:Constraint[] };

const TABLES: Record<string,string> = {
  users:'hadir_users', attendance:'hadir_attendance', leave_requests:'hadir_leave_requests',
  overtime:'hadir_overtime', payrolls:'hadir_payrolls', settings:'hadir_settings',
  notifications:'hadir_notifications', wa_logs:'hadir_wa_logs',
  attendance_adjustments:'hadir_attendance_adjustments',
  wa_scheduled_triggers:'hadir_wa_scheduled_triggers'
};
const tableFor=(name:string)=>TABLES[name]||name;
const now=()=>new Date().toISOString();

function clean(v:any):any{
  if(v && typeof v==='object'){
    if(v.__hadirServerTimestamp) return now();
    if(Array.isArray(v)) return v.map(clean);
    const o:any={}; for(const [k,x] of Object.entries(v)) o[k]=clean(x); return o;
  }
  return v;
}

function toDoc(collectionName:string,row:any){
  const base=row?.data && typeof row.data==='object'?{...row.data}:{};
  delete base.data;
  if(collectionName==='settings') return {id:row.id,...base};
  const aliases:any={
    waNumber:row.wa_number, wa_number:row.wa_number,
    loginMethod:row.login_method, login_method:row.login_method,
    assignedOfficeId:row.assigned_office_id, assigned_office_id:row.assigned_office_id,
    triggerTime:row.trigger_time, trigger_time:row.trigger_time
  };
  const explicit:any={id:row.id,...aliases};
  for(const k of ['user_id','tanggal','jam_masuk','jam_pulang','status','latitude_masuk','longitude_masuk','alamat_masuk','latitude_pulang','longitude_pulang','alamat_pulang','selfie_masuk','selfie_pulang','leave_request_id','overtime_request_id','via','keterangan','created_at','updated_at','nama','divisi','jabatan','password','role','photo_url','email','read','title','message','type','timestamp','jenis','alasan','tanggal_mulai','tanggal_akhir','durasi_jam','jam_mulai','jam_selesai','periode','bulan','tahun']) {
    if(row[k]!==undefined && row[k]!==null) explicit[k]=row[k];
  }
  return {...base,...explicit,id:row.id};
}

function toRow(collectionName:string,id:string,payload:any){
  const p=clean(payload||{}); const data={...p}; delete data.id; const r:any={id,data};
  const pick=(...keys:string[])=>keys.map(k=>p[k]).find(v=>v!==undefined);
  if(collectionName==='users'){
    r.wa_number=pick('waNumber','wa_number'); r.nama=p.nama; r.divisi=p.divisi; r.jabatan=p.jabatan;
    r.password=p.password; r.role=p.role; r.status=p.status; r.login_method=pick('loginMethod','login_method');
    r.assigned_office_id=pick('assignedOfficeId','assigned_office_id'); r.photo_url=p.photo_url; r.email=p.email;
  } else if(collectionName==='attendance'){
    for(const k of ['user_id','tanggal','jam_masuk','jam_pulang','status','latitude_masuk','longitude_masuk','alamat_masuk','latitude_pulang','longitude_pulang','alamat_pulang','selfie_masuk','selfie_pulang','leave_request_id','overtime_request_id','via','keterangan','created_at','updated_at']) r[k]=p[k];
  } else if(collectionName==='leave_requests'){
    for(const k of ['user_id','tanggal_mulai','tanggal_akhir','jenis','alasan','status','created_at','updated_at']) r[k]=p[k];
  } else if(collectionName==='overtime'){
    for(const k of ['user_id','tanggal','jam_mulai','jam_selesai','durasi_jam','status','alasan','created_at','updated_at']) r[k]=p[k];
  } else if(collectionName==='payrolls'){
    for(const k of ['user_id','periode','bulan','tahun','status','created_at','updated_at']) r[k]=p[k];
  } else if(collectionName==='notifications'){
    for(const k of ['user_id','read','title','message','type','created_at']) r[k]=p[k];
  } else if(collectionName==='wa_logs'){
    r.wa_number=pick('waNumber','wa_number'); r.nama=p.nama; r.message=p.message; r.type=p.type;
    r.trigger_time=pick('triggerTime','trigger_time'); r.status=p.status; r.timestamp=p.timestamp||now();
  } else if(collectionName==='attendance_adjustments'){
    r.user_id=p.user_id; r.tanggal=p.tanggal; r.status=p.status; r.created_at=p.created_at||now();
  } else if(collectionName==='wa_scheduled_triggers'){
    r.status=p.status; r.trigger_date=p.dateStr||p.trigger_date; r.trigger_hour=p.hour??p.trigger_hour; r.timestamp=p.timestamp||now();
  }
  for(const k of Object.keys(r)) if(r[k]===undefined) delete r[k];
  return r;
}

export const collection=(_db:any,name:string):Ref=>({kind:'collection',collection:name});
export const doc=(_db:any,name:string,id:string):Ref=>({kind:'doc',collection:name,id});
export const where=(field:string,op:string,value:any):Constraint=>({type:'where',field,op,value});
export const orderBy=(field:string,direction:'asc'|'desc'='asc'):Constraint=>({type:'orderBy',field,direction});
export const limit=(value:number):Constraint=>({type:'limit',value});
export const query=(ref:Ref|QueryRef,...constraints:Constraint[]):QueryRef=>({kind:'query',collection:ref.collection,constraints:[...(ref.kind==='query'?ref.constraints:[]),...constraints]});
export const serverTimestamp=()=>({__hadirServerTimestamp:true});

async function rows(ref:Ref|QueryRef){
  const cs=ref.kind==='query'?ref.constraints:[];
  let q:any=supabase.from(tableFor(ref.collection)).select('*');
  const map:any={waNumber:'wa_number',triggerTime:'trigger_time',loginMethod:'login_method',assignedOfficeId:'assigned_office_id'};
  for(const c of cs){
    if(c.type==='where'){
      const f=map[c.field]||c.field;
      const m:any={'==':'eq','!=':'neq','<':'lt','<=':'lte','>':'gt','>=':'gte','in':'in'};
      if(m[c.op]) q=q[m[c.op]](f,c.value);
    } else if(c.type==='orderBy'){
      q=q.order(map[c.field]||c.field,{ascending:c.direction!=='desc'});
    } else if(c.type==='limit') q=q.limit(c.value);
  }
  const {data,error}=await q; if(error) throw error;
  return (data||[]).map((r:any)=>toDoc(ref.collection,r));
}
const snapshot=(items:any[],collectionName:string)=>({docs:items.map(d=>({id:d.id,data:()=>d,exists:()=>true,ref:{kind:'doc',collection:collectionName,id:d.id}})),empty:items.length===0,size:items.length,forEach:(fn:any)=>items.forEach(fn)});
export const getDocs=async(ref:Ref|QueryRef)=>snapshot(await rows(ref),ref.collection);
export const getDoc=async(ref:Ref)=>{
  const {data,error}=await supabase.from(tableFor(ref.collection)).select('*').eq('id',ref.id).maybeSingle();
  if(error) throw error;
  if(!data) return {id:ref.id,exists:()=>false,data:()=>undefined,ref};
  const d=toDoc(ref.collection,data); return {id:ref.id,exists:()=>true,data:()=>d,ref};
};
export const setDoc=async(ref:Ref,payload:any,options:any={})=>{
  let p=clean(payload||{});
  if(options.merge){const cur=await getDoc(ref); if(cur.exists()) p={...(cur.data()||{}),...p};}
  const {error}=await supabase.from(tableFor(ref.collection)).upsert(toRow(ref.collection,ref.id!,p),{onConflict:'id'});
  if(error) throw error;
};
export const addDoc=async(ref:Ref,payload:any)=>{
  const id=crypto.randomUUID(); const {error}=await supabase.from(tableFor(ref.collection)).insert(toRow(ref.collection,id,payload));
  if(error) throw error; return {id,ref:{kind:'doc',collection:ref.collection,id}};
};
export const updateDoc=async(ref:Ref,payload:any)=>setDoc(ref,payload,{merge:true});
export const deleteDoc=async(ref:Ref)=>{const {error}=await supabase.from(tableFor(ref.collection)).delete().eq('id',ref.id);if(error)throw error;};
export const db=supabase;
