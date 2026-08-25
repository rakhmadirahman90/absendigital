import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, text) { fs.writeFileSync(path.join(root, file), text, 'utf8'); }

function fixDefaults() {
  const file = 'src/data/defaultData.ts';
  let s = read(file);
  const start = s.indexOf('export const DEFAULT_ATTENDANCE = [');
  const end = s.indexOf('export const DEFAULT_LEAVE_REQUESTS = [');
  if (start < 0 || end < 0) throw new Error('DEFAULT_ATTENDANCE section not found');
  let body = s.slice(start, end);
  body = body.replace(/^\s*jam_pulang:\s*[^,]+,\n/gm, '');
  body = body.replace(/^\s*total_jam_kerja:\s*[^,]+,\n/gm, '    total_jam_kerja: 0,\n');
  body = body.replace(/^\s*checkout_status:\s*[^,]+,\n/gm, '');
  write(file, s.slice(0, start) + body + s.slice(end));
}

function fixCheckInOut() {
  const file = 'src/pages/CheckInOut.tsx';
  let s = read(file);

  s = s.replace(
    "          jam_masuk: timeStr,\n          latitude_masuk: latitude,",
    "          jam_masuk: timeStr,\n          checkin_status: 'success',\n          checkin_at: new Date().toISOString(),\n          method_masuk: 'selfie+gps',\n          latitude_masuk: latitude,"
  );

  const oldGuard = `        const docToUpdate = existingDocs[0];
        const localKey = \`local_att_\${user.uid}_\${dateStr}\`;
        const localData = JSON.parse(localStorage.getItem(localKey) || '{}');

        if (docToUpdate && docToUpdate.data && docToUpdate.data().jam_pulang) {
          throw new Error('Anda sudah melakukan absen pulang');
        }

        if (localData && localData.jam_pulang) {
          throw new Error('Anda sudah melakukan absen pulang');
        }`;
  const newGuard = `        const docToUpdate = existingDocs[0];
        const localKey = \`local_att_\${user.uid}_\${dateStr}\`;
        const localData = JSON.parse(localStorage.getItem(localKey) || '{}');

        const existingData = docToUpdate?.data ? docToUpdate.data() : {};
        const hasVerifiedCheckout = Boolean(
          existingData?.jam_pulang && (
            existingData?.checkout_status === 'success' ||
            existingData?.checkout_at ||
            existingData?.method_pulang ||
            existingData?.selfie_pulang ||
            existingData?.latitude_pulang !== undefined ||
            existingData?.longitude_pulang !== undefined
          )
        );
        const hasVerifiedLocalCheckout = Boolean(
          localData?.jam_pulang && (
            localData?.checkout_status === 'success' ||
            localData?.checkout_at ||
            localData?.method_pulang ||
            localData?.selfie_pulang ||
            localData?.latitude_pulang !== undefined ||
            localData?.longitude_pulang !== undefined
          )
        );

        if (hasVerifiedCheckout || hasVerifiedLocalCheckout) {
          throw new Error('Anda sudah melakukan absen pulang');
        }`;
  if (s.includes(oldGuard)) s = s.replace(oldGuard, newGuard);

  s = s.replace(
    "              jam_pulang: timeStr,\n              latitude_pulang: latitude,",
    "              jam_pulang: timeStr,\n              checkout_status: 'success',\n              checkout_at: new Date().toISOString(),\n              method_pulang: 'selfie+gps',\n              latitude_pulang: latitude,"
  );
  s = s.replace(
    "          ...localData,\n          jam_pulang: timeStr,\n          latitude_pulang: latitude,",
    "          ...localData,\n          jam_pulang: timeStr,\n          checkout_status: 'success',\n          checkout_at: new Date().toISOString(),\n          method_pulang: 'selfie+gps',\n          latitude_pulang: latitude,"
  );
  write(file, s);
}

function fixAdmin() {
  const file = 'src/pages/admin/AbsensiTab.tsx';
  let s = read(file);
  const anchor = `    const parseRupiah = (formattedVal: string | number) => {
        if (typeof formattedVal === 'number') return formattedVal;
        const clean = String(formattedVal).replace(/[^0-9]/g, '');
        return clean ? Number(clean) : 0;
    };
`;
  const helper = `${anchor}
    const hasVerifiedCheckout = (item: any) => Boolean(
        item?.jam_pulang && (
            item?.checkout_status === 'success' ||
            item?.checkout_at ||
            item?.method_pulang ||
            item?.selfie_pulang ||
            item?.latitude_pulang !== undefined ||
            item?.longitude_pulang !== undefined
        )
    );

    const getEffectiveCheckoutTime = (item: any) =>
        hasVerifiedCheckout(item) ? item.jam_pulang : '';
`;
  if (!s.includes('const hasVerifiedCheckout = (item: any)')) {
    if (!s.includes(anchor)) throw new Error('AbsensiTab parseRupiah anchor not found');
    s = s.replace(anchor, helper);
  }

  s = s.replace("const outVal = rec.jam_pulang || '';", "const outVal = getEffectiveCheckoutTime(rec);");
  s = s.replace("jam_pulang: item.jam_pulang || '',\n            status:", "jam_pulang: getEffectiveCheckoutTime(item),\n            status:");
  s = s.replace(
    "                    jam_masuk: record.jam_masuk,\n                    status: record.status,\n                    method_masuk: 'Foto AI',",
    "                    jam_masuk: record.jam_masuk,\n                    checkin_status: 'success',\n                    checkin_at: new Date().toISOString(),\n                    status: record.status,\n                    method_masuk: 'Foto AI',"
  );
  s = s.replace(
    "                    payload.jam_pulang = record.jam_pulang;\n                    payload.method_pulang = 'Foto AI';",
    "                    payload.jam_pulang = record.jam_pulang;\n                    payload.checkout_status = 'success';\n                    payload.checkout_at = new Date().toISOString();\n                    payload.method_pulang = 'Foto AI';"
  );

  const oldEdit = `            await updateDoc(doc(db, 'attendance', editingRecord.id), {
                jam_masuk: editForm.jam_masuk,
                jam_pulang: editForm.jam_pulang,
                status: editForm.status,`;
  const newEdit = `            await updateDoc(doc(db, 'attendance', editingRecord.id), {
                jam_masuk: editForm.jam_masuk,
                jam_pulang: editForm.jam_pulang || '',
                checkout_status: editForm.jam_pulang ? 'success' : '',
                checkout_at: editForm.jam_pulang ? new Date().toISOString() : '',
                method_pulang: editForm.jam_pulang ? 'Admin Manual' : '',
                status: editForm.status,`;
  if (s.includes(oldEdit)) s = s.replace(oldEdit, newEdit);

  s = s.replace("{item.jam_pulang || '-'}</span>", "{getEffectiveCheckoutTime(item) || '-'}</span>");
  s = s.replace("item.jam_pulang || '--:--'", "getEffectiveCheckoutTime(item) || '--:--'");
  s = s.replace("item.jam_pulang || '-',\n                item.status", "getEffectiveCheckoutTime(item) || '-',\n                item.status");
  s = s.replace("item.jam_pulang || '-',\n                item.status || 'Hadir'", "getEffectiveCheckoutTime(item) || '-',\n                item.status || 'Hadir'");
  s = s.replace(
    "{item.jam_pulang ? (\n                                                    <span className=\"text-slate-700\">{item.jam_pulang}</span>",
    "{hasVerifiedCheckout(item) ? (\n                                                    <span className=\"text-slate-700\">{item.jam_pulang}</span>"
  );
  write(file, s);
}

fixDefaults();
fixCheckInOut();
fixAdmin();
console.log('Attendance checkout fix applied successfully.');
