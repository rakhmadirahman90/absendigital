from pathlib import Path
import subprocess

path = Path('src/pages/admin/AbsensiTab.tsx')
parent = '33b648effa67d450997d084da2d3721f2fa981cd'

# The previous automated edit accidentally replaced the component with a truncated
# copy. Restore the complete component from its known-good parent commit first.
restored = subprocess.check_output(
    ['git', 'show', f'{parent}:src/pages/admin/AbsensiTab.tsx'],
    text=True,
)

old = '''        const buildData = (snap: any) => {\n            let data: any[] = [];\n            snap.forEach((docSnap: any) => data.push({ id: docSnap.id, ...docSnap.data() }));\n\n            data.sort((a, b) => {'''
new = '''        const normalizeDate = (value: any) => {\n            if (!value) return '';\n            if (typeof value === 'string') {\n                const match = value.match(/(\\d{4}-\\d{2}-\\d{2})/);\n                return match ? match[1] : value.slice(0, 10);\n            }\n            if (value?.toDate) {\n                try { return format(value.toDate(), 'yyyy-MM-dd'); } catch (_) {}\n            }\n            if (value instanceof Date) return format(value, 'yyyy-MM-dd');\n            return '';\n        };\n\n        const buildData = (snap: any, forceDateFilter = false) => {\n            let data: any[] = [];\n            snap.forEach((docSnap: any) => data.push({ id: docSnap.id, ...docSnap.data() }));\n\n            // Compatibility with legacy records whose tanggal may be a timestamp\n            // or a string containing a time component.\n            if (filterDateMode !== 'all' && forceDateFilter) {\n                data = data.filter(item => normalizeDate(item.tanggal) === filterDate);\n            }\n\n            data.sort((a, b) => {'''
if old not in restored:
    raise SystemExit('Known-good buildData block was not found; no change applied.')
restored = restored.replace(old, new, 1)

old_query = '''        const unsubAttendance = onSnapshot(q, (snap) => {\n            const data = buildData(snap);\n            setAttendance(data);\n            setLoading(false);\n        }, (error) => {'''
new_query = '''        const unsubAttendance = onSnapshot(q, async (snap) => {\n            let data = buildData(snap);\n\n            // Primary query stays efficient. Only when it returns zero rows do we\n            // perform a compatibility read to recover valid legacy attendance.\n            if (filterDateMode !== 'all' && snap.empty) {\n                try {\n                    const { getDocs } = await import('firebase/firestore');\n                    const allSnap = await getDocs(collection(db, 'attendance'));\n                    data = buildData(allSnap, true);\n                } catch (fallbackError: any) {\n                    console.warn('[AbsensiTab] Compatibility attendance read notice:', fallbackError?.message || fallbackError);\n                }\n            }\n\n            setAttendance(data);\n            setLoading(false);\n        }, (error) => {'''
if old_query not in restored:
    raise SystemExit('Known-good attendance listener block was not found; no change applied.')
restored = restored.replace(old_query, new_query, 1)
path.write_text(restored, encoding='utf-8')
print('Restored complete AbsensiTab.tsx and applied resilient date filtering.')
