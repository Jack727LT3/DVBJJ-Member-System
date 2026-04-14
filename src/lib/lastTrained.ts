import { differenceInCalendarDays, format } from "date-fns";

/** Human-friendly copy for the visit *before* the current check-in. */
export function formatLastTrainedLine(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) {
    return "We don’t have an earlier visit on file—glad you’re here.";
  }
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return "We don’t have an earlier visit on file—glad you’re here.";
  }
  const days = differenceInCalendarDays(now, d);
  if (days <= 0) return "Last time you trained was earlier today.";
  if (days === 1) return "Last time you trained was yesterday.";
  if (days < 7) return `Last time you trained was ${days} days ago.`;
  return `Last time you trained was ${format(d, "EEEE, MMM d, yyyy")}.`;
}
