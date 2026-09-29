/** `undefined` leaves a field untouched, `null`/"" clears it, anything else becomes a Date. */
export function toDate(value: string | Date | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(value);
}

/** Returns a copy of `data` with the named keys converted by `toDate`. */
export function withDates<T extends object>(data: T, keys: string[]): any {
  const out: Record<string, any> = { ...data };
  for (const key of keys) if (key in out) out[key] = toDate(out[key]);
  return out;
}
