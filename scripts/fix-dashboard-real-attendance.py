from pathlib import Path

path = Path('src/pages/admin/DashboardTab.tsx')
s = path.read_text(encoding='utf-8')

# The dashboard must never display bundled demo attendance when Firestore has
# no records or the live listener hits a transient error. Those fallback rows
# can contain stale/fictitious check-in clocks (e.g. evening times).
old = '''    const applyAttendanceFallback = () => {\n      let hadirHariIni = DEFAULT_ATTENDANCE.length;\n      let terlambat = 0;\n      setRecentAttendance(DEFAULT_ATTENDANCE.slice(0, 5));\n      setStats(prev => {\n        const belumAbsen = Math.max(0, (prev.totalKaryawan || DEFAULT_USERS.length) - hadirHariIni - (prev.izinCutiHariIni || 0));\n        return { ...prev, hadirHariIni, terlambat, belumAbsen };\n      });\n    };'''
new = '''    const applyAttendanceFallback = () => {\n      // Firestore is the only source of truth for the dashboard attendance feed.\n      // Empty/error must never substitute DEFAULT_ATTENDANCE demo rows.\n      setRecentAttendance([]);\n      setStats(prev => {\n        const hadirHariIni = 0;\n        const terlambat = 0;\n        const belumAbsen = Math.max(0, (prev.totalKaryawan || 0) - (prev.izinCutiHariIni || 0));\n        return { ...prev, hadirHariIni, terlambat, belumAbsen };\n      });\n    };'''
if old not in s:
    raise SystemExit('Expected attendance fallback block not found; refusing modification.')
s = s.replace(old, new, 1)

old_empty = '''      if (attendanceSnap.empty) {\n        applyAttendanceFallback();\n        return;\n      }'''
new_empty = '''      if (attendanceSnap.empty) {\n        // No Firestore attendance today: show no activity, never demo data.\n        applyAttendanceFallback();\n        return;\n      }'''
s = s.replace(old_empty, new_empty, 1)

# When Firestore listener fails (including quota/network), keep the feed empty
# rather than showing bundled sample times as if they were real attendance.
old_error = '''    }, (error: any) => {\n      applyAttendanceFallback();\n      if (error?.message?.includes('Quota') || error?.code === 'resource-exhausted') {'''
new_error = '''    }, (error: any) => {\n      applyAttendanceFallback();\n      if (error?.message?.includes('Quota') || error?.code === 'resource-exhausted') {'''
if old_error not in s:
    raise SystemExit('Expected attendance error handler not found; refusing modification.')
# Keep the explicit fallback call but its implementation is now source-of-truth safe.

path.write_text(s, encoding='utf-8')
print('Dashboard attendance feed now uses Firestore only; demo fallback disabled.')
