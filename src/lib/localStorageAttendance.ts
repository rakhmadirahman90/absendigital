export function getLocalAttendanceRecords(userId: string): any[] {
  const records: any[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`local_att_${userId}_`)) {
        const item = localStorage.getItem(key);
        if (item) {
          try {
            records.push(JSON.parse(item));
          } catch (e) {
            // ignore invalid json
          }
        }
      }
    }
  } catch (e) {
    console.warn('Error reading local attendance records:', e);
  }
  return records;
}
