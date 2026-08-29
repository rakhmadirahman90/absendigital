from pathlib import Path

path = Path('src/pages/admin/AbsensiTab.tsx')
source = path.read_text(encoding='utf-8')

old = """            if (typeof value === 'string') {\n                const match = value.match(/(\\d{4}-\\d{2}-\\d{2})/);\n                return match ? match[1] : value.slice(0, 10);\n            }"""
new = """            if (typeof value === 'string') {\n                const isoMatch = value.match(/(\\d{4}-\\d{2}-\\d{2})/);\n                if (isoMatch) return isoMatch[1];\n\n                // Legacy records may store dates as DD/MM/YYYY or DD-MM-YYYY.\n                const legacyMatch = value.match(/^(\\d{2})[\\/-](\\d{2})[\\/-](\\d{4})/);\n                if (legacyMatch) return `${legacyMatch[3]}-${legacyMatch[2]}-${legacyMatch[1]}`;\n\n                return value.slice(0, 10);\n            }"""
if old not in source:
    raise SystemExit('normalizeDate string block not found; no change applied.')
source = source.replace(old, new, 1)

old2 = """                    const allSnap = await getDocs(collection(db, 'attendance'));\n                    data = buildData(allSnap, true);\n                } catch (fallbackError: any) {"""
new2 = """                    const allSnap = await getDocs(collection(db, 'attendance'));\n                    data = buildData(allSnap, true);\n                    console.info(`[AbsensiTab] Compatibility attendance fallback loaded ${data.length} record(s) for ${filterDate}.`);\n                } catch (fallbackError: any) {"""
if old2 not in source:
    raise SystemExit('attendance fallback block not found; no change applied.')
source = source.replace(old2, new2, 1)

path.write_text(source, encoding='utf-8')
print('Applied legacy DD/MM/YYYY and DD-MM-YYYY attendance date compatibility.')
