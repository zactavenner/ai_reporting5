// Single source of truth for the calls.showed flag.
// showed = true ONLY when the CRM status is 'showed' or 'completed'
// (case-insensitive) AND the appointment start time is not in the future.
// 'confirmed', 'booked', 'new', 'pending' and anything else => false.
export function isShowedStatus(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'showed' || s === 'completed';
}

export function resolveShowed(
  raw: string | null | undefined,
  startTime: string | number | Date | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!isShowedStatus(raw)) return false;
  if (startTime !== null && startTime !== undefined && startTime !== '') {
    const t = new Date(startTime as any).getTime();
    if (Number.isFinite(t) && t > nowMs) return false;
  }
  return true;
}
