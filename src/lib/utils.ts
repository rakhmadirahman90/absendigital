import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateAutoBreakHours(inVal: string, outVal: string, storedIstirahat?: number): number {
  if (!inVal || !outVal || inVal === '-' || outVal === '-') {
    return storedIstirahat !== undefined && storedIstirahat !== null ? Number(storedIstirahat) : 0;
  }

  let inTime = 0;
  let outTime = 0;

  if (inVal.includes(':')) {
    const [h, m] = inVal.split(':').map(Number);
    inTime = (h || 0) + (m || 0) / 60;
  } else {
    inTime = Number(inVal) || 0;
  }

  if (outVal.includes(':')) {
    const [h, m] = outVal.split(':').map(Number);
    outTime = (h || 0) + (m || 0) / 60;
  } else {
    outTime = Number(outVal) || 0;
  }

  if (inTime <= 0 || outTime <= 0 || outTime <= inTime) {
    return storedIstirahat !== undefined && storedIstirahat !== null ? Number(storedIstirahat) : 0;
  }

  // 1. Daytime break (Istirahat Siang: 12:00 - 13:00 -> 1 Jam)
  let daytimeBreak = 0;
  if (inTime < 13 && outTime > 12) {
    daytimeBreak = Math.min(13, outTime) - Math.max(12, inTime);
    if (daytimeBreak < 0) daytimeBreak = 0;
  }

  // 2. Evening/Night break & Sholat Isya (Istirahat Malam: 18:00 - 20:00 -> 2 Jam)
  let nightBreak = 0;
  if (inTime < 20 && outTime > 18) {
    nightBreak = Math.min(20, outTime) - Math.max(18, inTime);
    if (nightBreak < 0) nightBreak = 0;
  }

  const computedBreak = daytimeBreak + nightBreak;

  if (storedIstirahat !== undefined && storedIstirahat !== null) {
    const numStored = Number(storedIstirahat);
    return Math.max(numStored, Number(computedBreak.toFixed(1)));
  }

  if (computedBreak <= 0) {
    const shiftDuration = outTime - inTime;
    if (shiftDuration >= 4) return 1;
    return 0;
  }

  return Number(computedBreak.toFixed(1));
}

