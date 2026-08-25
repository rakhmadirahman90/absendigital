from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def fix_defaults():
    p = ROOT / 'src' / 'data' / 'defaultData.ts'
    s = p.read_text(encoding='utf-8')
    start = s.index('export const DEFAULT_ATTENDANCE = [')
    end = s.index('export const DEFAULT_LEAVE_REQUESTS = [')
    head, body, tail = s[:start], s[start:end], s[end:]
    body = re.sub(r'^\s*jam_pulang:\s*[^,]+,\n', '', body, flags=re.M)
    body = re.sub(r'^\s*total_jam_kerja:\s*[^,]+,\n', '    total_jam_kerja: 0,\n', body, flags=re.M)
    body = re.sub(r'^\s*checkout_status:\s*[^,]+,\n', '', body, flags=re.M)
    p.write_text(head + body + tail, encoding='utf-8')


def fix_checkinout():
    p = ROOT / 'pages' / 'CheckInOut.tsx'
    s = p.read_text(encoding='utf-8')

    s = s.replace(
        "          jam_masuk: timeStr,\n          latitude_masuk: latitude,",
        "          jam_masuk: timeStr,\n          checkin_status: 'success',\n          checkin_at: new Date().toISOString(),\n          method_masuk: 'selfie+gps',\n          latitude_masuk: latitude,",
        1
    )

    old = """        const docToUpdate = existingDocs[0];
        const localKey = `local_att_${user.uid}_${dateStr}`;
        const localData = JSON.parse(localStorage.getItem(localKey) || '{}');

        if (docToUpdate && docToUpdate.data && docToUpdate.data().jam_pulang) {
          throw new Error('Anda sudah melakukan absen pulang');
        }

        if (localData && localData.jam_pulang) {
          throw new Error('Anda sudah melakukan absen pulang');
        }"""
    new = """        const docToUpdate = existingDocs[0];
        const localKey = `local_att_${user.uid}_${dateStr}`;
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
        }"""
    if old not in s:
        raise SystemExit('CheckInOut checkout guard not found')
    s = s.replace(old, new, 1)

    s = s.replace(
        "              jam_pulang: timeStr,\n              latitude_pulang: latitude,",
        "              jam_pulang: timeStr,\n              checkout_status: 'success',\n              checkout_at: new Date().toISOString(),\n              method_pulang: 'selfie+gps',\n              latitude_pulang: latitude,",
        1
    )
    s = s.replace(
        "          ...localData,\n          jam_pulang: timeStr,\n          latitude_pulang: latitude,",
        "          ...localData,\n          jam_pulang: timeStr,\n          checkout_status: 'success',\n          checkout_at: new Date().toISOString(),\n          method_pulang: 'selfie+gps',\n          latitude_pulang: latitude,",
        1
    )
    p.write_text(s, encoding='utf-8')


def fix_admin():
    p = ROOT / 'pages' / 'admin' / 'AbsensiTab.tsx'
    s = p.read_text(encoding='utf-8')

    anchor = """    const parseRupiah = (formattedVal: string | number) => {
        if (typeof formattedVal === 'number') return formattedVal;
        const clean = String(formattedVal).replace(/[^0-9]/g, '');
        return clean ? Number(clean) : 0;
    };
"""
    helper = anchor + """
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
"""
    if anchor not in s:
        raise SystemExit('AbsensiTab parseRupiah anchor not found')
    if 'const hasVerifiedCheckout = (item: any)' not in s:
        s = s.replace(anchor, helper, 1)

    s = s.replace("const outVal = rec.jam_pulang || '';", "const outVal = getEffectiveCheckoutTime(rec);")
    s = s.replace("jam_pulang: item.jam_pulang || '',\n            status:", "jam_pulang: getEffectiveCheckoutTime(item),\n            status:")

    s = s.replace(
        "                    jam_masuk: record.jam_masuk,\n                    status: record.status,\n                    method_masuk: 'Foto AI',",
        "                    jam_masuk: record.jam_masuk,\n                    checkin_status: 'success',\n                    checkin_at: new Date().toISOString(),\n                    status: record.status,\n                    method_masuk: 'Foto AI',",
        1
    )
    s = s.replace(
        "                    payload.jam_pulang = record.jam_pulang;\n                    payload.method_pulang = 'Foto AI';",
        "                    payload.jam_pulang = record.jam_pulang;\n                    payload.checkout_status = 'success';\n                    payload.checkout_at = new Date().toISOString();\n                    payload.method_pulang = 'Foto AI';",
        1
    )

    old = """            await updateDoc(doc(db, 'attendance', editingRecord.id), {
                jam_masuk: editForm.jam_masuk,
                jam_pulang: editForm.jam_pulang,
                status: editForm.status,"""
    new = """            await updateDoc(doc(db, 'attendance', editingRecord.id), {
                jam_masuk: editForm.jam_masuk,
                jam_pulang: editForm.jam_pulang || '',
                checkout_status: editForm.jam_pulang ? 'success' : '',
                checkout_at: editForm.jam_pulang ? new Date().toISOString() : '',
                method_pulang: editForm.jam_pulang ? 'Admin Manual' : '',
                status: editForm.status,"""
    if old in s:
        s = s.replace(old, new, 1)

    s = s.replace("{item.jam_pulang || '-'}</span>", "{getEffectiveCheckoutTime(item) || '-'}</span>")
    s = s.replace("item.jam_pulang || '--:--'", "getEffectiveCheckoutTime(item) || '--:--'")
    s = s.replace("item.jam_pulang || '-',\n                item.status", "getEffectiveCheckoutTime(item) || '-',\n                item.status")
    s = s.replace("item.jam_pulang || '-',\n                item.status || 'Hadir'", "getEffectiveCheckoutTime(item) || '-',\n                item.status || 'Hadir'")
    s = s.replace(
        "{item.jam_pulang ? (\n                                                    <span className=\"text-slate-700\">{item.jam_pulang}</span>",
        "{hasVerifiedCheckout(item) ? (\n                                                    <span className=\"text-slate-700\">{item.jam_pulang}</span>"
    )

    p.write_text(s, encoding='utf-8')


if __name__ == '__main__':
    fix_defaults()
    fix_checkinout()
    fix_admin()
    print('Attendance checkout fix applied successfully.')
