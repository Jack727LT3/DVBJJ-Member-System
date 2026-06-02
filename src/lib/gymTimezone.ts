/** DVBJJ operates in US Eastern — used for "today" check-ins and daily stats. */
export const GYM_TIMEZONE = "America/New_York";

/**
 * Calendar date string (YYYY-MM-DD) for a timestamp in the gym timezone.
 */
export function gymLocalDateString(isoOrDate: string | Date, now = new Date()): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleDateString("en-CA", { timeZone: GYM_TIMEZONE });
}

export function todayGymDateString(now = new Date()): string {
  return gymLocalDateString(now, now);
}

export function isTimestampOnGymToday(iso: string, now = new Date()): boolean {
  return gymLocalDateString(iso, now) === todayGymDateString(now);
}
