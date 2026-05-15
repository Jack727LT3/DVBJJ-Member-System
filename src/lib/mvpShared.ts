/** BJJ belt tiers — highest rank first for reference display. */
export const BELT_TIERS = [
  "Black",
  "Brown",
  "Purple",
  "Blue",
  "White",
] as const;

export function formatWhen(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDateOnly(iso);
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/** Calendar date `YYYY-MM-DD` without timezone shift. */
export function formatDateOnly(ymd: string | null | undefined) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  if (Number.isNaN(local.getTime())) return "—";
  return local.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.length >= 4 ? `***${d.slice(-4)}` : phone || "—";
}

export function fullName(first: string, last: string) {
  return `${first} ${last}`.trim();
}

/** Age in full years from ISO date `YYYY-MM-DD`. */
export function ageFromDateOfBirth(ymd: string | null | undefined): number | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

export function isTrialExpired(daysRemaining: number) {
  return daysRemaining < 0;
}

export function formatTrialDaysLeft(daysRemaining: number) {
  if (daysRemaining < 0) return "Expired";
  return String(daysRemaining);
}

export function formatMemberAge(dateOfBirth: string | null | undefined): string {
  const age = ageFromDateOfBirth(dateOfBirth);
  if (age === null) return "—";
  return age === 1 ? "1 year" : `${age} years`;
}

export function formatMoney(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
