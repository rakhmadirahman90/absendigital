from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# 1) Remove fake checkout times from the built-in TODAY fallback data.
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
    p = ROOT / 'src' / 'pages' / 'CheckInOut.tsx'
    s = p.read_text(encoding='utf-8')

    old = """          jam_masuk: timeStr,\n          latitude_masuk: latitude,"""
    new = """          jam_masuk: timeStr,\n          checkin_status: 'success',\n          checkin_at: new Date().toISOString(),\n          method_masuk: 'selfie+gps',\n          latitude_masuk: latitude,"""
    s = s.replace(old, new, 1)

    old = """        const docToUpdate = existingDocs[0];\n        const localKey = `local_att_${user.uid}_${dateStr}`;\n        const localData = JSON.parse(localStorage.getItem(localKey) || '{}');\n\n        if (docToUpdate && docToUpdate.data && docToUpdate.data().jam_pulang) {\n          throw new Error('Anda sudah melakukan absen pulang');\n        }\n\n        if (localData && localData.jam_pulang) {\n          throw new Error('Anda sudah melakukan absen pulang');\n        }"""
    new = """        const docToUpdate = existingDocs[0];\n        const localKey = `local_att_${user.uid}_${dateStr}`;\n        const localData = JSON.parse(localStorage.getItem(localKey) || '{}');\n\n        const existingData = docToUpdate?.data ? docToUpdate.data() : {};\n        const hasVerifiedCheckout = Boolean(\n          existingData?.jam_pulang && (\n            existingData?.checkout_status === 'success' ||\n            existingData?.checkout_at ||\n            existingData?.method_pulang ||\n            existingData?.selfie_pulang ||\n            existingData?.latitude_pulang !== undefined ||\n            existingData?.longitude_pulang !== undefined\n          )\n        );\n        const hasVerifiedLocalCheckout = Boolean(\n          localData?.jam_pulang && (\n            localData?.checkout_status === 'success' ||\n            localData?.checkout_at ||\n            localData?.method_pulang ||\n            localData?.selfie_pulang ||\n            localData?.latitude_pulang !== undefined ||\n            localData?.longitude_pulang !== undefined\n          )\n        );\n\n        if (hasVerifiedCheckout || hasVerifiedLocalCheckout) {\n          throw new Error('Anda sudah melakukan absen pulang');\n        }"""
    if old not in s:
        raise SystemExit('CheckInOut legacy checkout guard block not found')
    s = s.replace(old, new, 1)

    old = """            await updateDoc(docToUpdate.ref, {\n              jam_pulang: timeStr,\n              latitude_pulang: latitude,"""
    new = """            await updateDoc(docToUpdate.ref, {\n              jam_pulang: timeStr,\n              checkout_status: 'success',\n              checkout_at: new Date().toISOString(),\n              method_pulang: 'selfie+gps',\n              latitude_pulang: latitude,"""
    s = s.replace(old, new, 1)

    old = """          ...localData,\n          jam_pulang: timeStr,\n          latitude_pulang: latitude,"""
    new = """          ...localData,\n          jam_pulang: timeStr,\n          checkout_status: 'success',\n          checkout_at: new Date().toISOString(),\n          method_pulang: 'selfie+gps',\n          latitude_pulang: latitude,"""
    s = s.replace(old, new, 1)

    p.write_text(s, encoding='utf-8')


def fix_admin():
    p = ROOT / 'src' / 'pages' / 'admin' / 'AbsensiTab.tsx'
    s = p.read_text(encoding='utf-8')

    anchor = """    const parseRupiah = (formattedVal: string | number) => {\n        if (typeof formattedVal === 'number') return formattedVal;\n        const clean = String(formattedVal).replace(/[^0-9]/g, '');\n        return clean ? Number(clean) : 0;\n    };\n"""
    helper = anchor + """\n    // Checkout is valid only when the system has a real checkout proof.\n    // This prevents fallback/demo data or stale jam_pulang values from appearing as a real checkout.\n    const hasVerifiedCheckout = (item: any) => Boolean(\n        item?.jam_pulang && (\n            item?.checkout_status === 'success' ||\n            item?.checkout_at ||\n            item?.method_pulang ||\n            item?.selfie_pulang ||\n            item?.latitude_pulang !== undefined ||\n            item?.longitude_pulang !== undefined\n        )\n    );\n\n    const getEffectiveCheckoutTime = (item: any) =>\n        hasVerifiedCheckout(item) ? item.jam_pulang : '';\n"""
    if anchor not in s:
        raise SystemExit('AbsensiTab parseRupiah anchor not found')
    if 'const hasVerifiedCheckout = (item: any)' not in s:
        s = s.replace(anchor, helper, 1)

    s = s.replace("const outVal = rec.jam_pulang || '';", "const outVal = getEffectiveCheckoutTime(rec);")
    s = s.replace("jam_pulang: item.jam_pulang || '',\n            status:", "jam_pulang: getEffectiveCheckoutTime(item),\n            status:")

    # AI-imported attendance must also carry explicit checkout proof when a checkout time exists.
    old = """                    jam_masuk: record.jam_masuk,\n                    status: record.status,\n                    method_masuk: 'Foto AI',"""
    new = """                    jam_masuk: record.jam_masuk,\n                    checkin_status: 'success',\n                    checkin_at: new Date().toISOString(),\n                    status: record.status,\n                    method_masuk: 'Foto AI',"""
    s = s.replace(old, new, 1)
    old = """                    payload.jam_pulang = record.jam_pulang;\n                    payload.method_pulang = 'Foto AI';"""
    new = """                    payload.jam_pulang = record.jam_pulang;\n                    payload.checkout_status = 'success';\n                    payload.checkout_at = new Date().toISOString();\n                    payload.method_pulang = 'Foto AI';"""
    s = s.replace(old, new, 1)

    # Admin manual edits are explicit, therefore a manually entered checkout is valid.
    old = """            await updateDoc(doc(db, 'attendance', editingRecord.id), {\n                jam_masuk: editForm.jam_masuk,\n                jam_pulang: editForm.jam_pulang,\n                status: editForm.status,"""
    new = """            await updateDoc(doc(db, 'attendance', editingRecord.id), {\n                jam_masuk: editForm.jam_masuk,\n                jam_pulang: editForm.jam_pulang || '',\n                checkout_status: editForm.jam_pulang ? 'success' : '',\n                checkout_at: editForm.jam_pulang ? new Date().toISOString() : '',\n                method_pulang: editForm.jam_pulang ? 'Admin Manual' : '',\n                status: editForm.status,"""
    if old in s:
        s = s.replace(old, new, 1)

    # Replace display-only references with the verified value.
    s = s.replace("{item.jam_pulang ? (\n                                                    <span className=\"text-slate-700\">{item.jam_pulang}</span>", "{hasVerifiedCheckout(item) ? (\n                                                    <span className=\"text-slate-700\">{item.jam_pulang}</span>")
    s = s.replace("{item.jam_pulang || '-'}</span>", "{getEffectiveCheckoutTime(item) || '-'}</span>")
    s = s.replace("item.jam_pulang || '-',\n                item.status", "getEffectiveCheckoutTime(item) || '-',\n                item.status")
    s = s.replace("item.jam_pulang || '--:--'", "getEffectiveCheckoutTime(item) || '--:--'")

    # Monthly export should never export an unverified checkout.
    s = s.replace("item.jam_pulang || '-',\n                item.status || 'Hadir'", "getEffectiveCheckoutTime(item) || '-',\n                item.status || 'Hadir'")

    p.write_text(s, encoding='utf-8')


if __name__ == '__main__':
    fix_defaults()
    fix_checkinout()
    fix_admin()
    print('Attendance checkout fix applied successfully.')
