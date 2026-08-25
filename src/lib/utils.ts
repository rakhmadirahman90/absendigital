import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parse a stored attendance clock without changing it. */
export function parseStoredAttendanceTime(value: unknown): number | null {
  if (value === undefined || value === null || value === '' || value === '-') return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours + minutes / 60 + seconds / 3600;
}

/**
 * Read-only break calculation. A stored `istirahat` value is authoritative
 * and is never replaced or written back to Firestore.
 */
export function calculateAutoBreakHours(inVal: string, outVal: string, storedIstirahat?: number): number {
  if (storedIstirahat !== undefined && storedIstirahat !== null && Number.isFinite(Number(storedIstirahat))) {
    return Number(storedIstirahat);
  }

  const inTime = parseStoredAttendanceTime(inVal);
  const outTime = parseStoredAttendanceTime(outVal);
  if (inTime === null || outTime === null || outTime <= inTime) return 0;

  let daytimeBreak = 0;
  if (inTime < 13 && outTime > 12) {
    daytimeBreak = Math.max(0, Math.min(13, outTime) - Math.max(12, inTime));
  }

  let nightBreak = 0;
  if (inTime < 20 && outTime > 18) {
    nightBreak = Math.max(0, Math.min(20, outTime) - Math.max(18, inTime));
  }

  const computedBreak = daytimeBreak + nightBreak;
  if (computedBreak > 0) return Number(computedBreak.toFixed(2));
  return outTime - inTime >= 4 ? 1 : 0;
}

/** Calculate worked hours from exact stored clock-in/out values, read-only. */
export function calculateStoredWorkHours(
  jamMasuk: unknown,
  jamPulang: unknown,
  istirahat?: unknown
): number | null {
  const inTime = parseStoredAttendanceTime(jamMasuk);
  const outTime = parseStoredAttendanceTime(jamPulang);
  if (inTime === null || outTime === null || outTime <= inTime) return null;

  const storedBreak = Number(istirahat);
  const breakHours = Number.isFinite(storedBreak)
    ? Math.max(0, storedBreak)
    : calculateAutoBreakHours(String(jamMasuk), String(jamPulang));

  return Number(Math.max(0, outTime - inTime - breakHours).toFixed(2));
}

/** Return the original stored clock string exactly as saved. */
export function getStoredAttendanceClock(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}
