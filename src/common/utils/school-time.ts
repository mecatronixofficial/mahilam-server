/** School calendar boundaries; PostgreSQL DateTime values represent UTC instants. */
export const SCHOOL_OFFSET_MS = 330 * 60_000;
export function schoolDay(now = new Date()) {
  return new Date(now.getTime() + SCHOOL_OFFSET_MS).toISOString().slice(0, 10);
}
export function schoolDayStart(day = schoolDay()) { return new Date(`${day}T00:00:00+05:30`); }
export function schoolDayEnd(day = schoolDay()) { return new Date(schoolDayStart(day).getTime() + 86_400_000 - 1); }
export function schoolMonthStart(now = new Date()) { return schoolDayStart(`${schoolDay(now).slice(0, 7)}-01`); }
/** Preserve explicit timestamp instants; only date-only filters expand to a school day. */
export function schoolRange(value: string, end = false) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? (end ? schoolDayEnd(value) : schoolDayStart(value)) : new Date(value);
}
