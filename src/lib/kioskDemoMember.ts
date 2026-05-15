import { maskPhone, normalizePhone } from "@/lib/phone";
import { getEffectiveStatusForMessaging } from "@/lib/statusResolver";

/** Stable fake row for kiosk demos / local click-through without Supabase data. */
export const KIOSK_DEMO_MEMBER_ID = "00000000-0000-4000-b000-000000000001";

/** Kiosk member demo (Jack) — use this number to hit the member check-in path without Supabase. */
const DEMO_PHONE_DIGITS = "7275550100";
/** Kiosk guest demo: this number always goes through the guest path (empty lookup, guest form). */
const DEMO_GUEST_PHONE_DIGITS = "7273891434";
const DEMO_LAST_LOWER = "wahl";
const DEMO_FIRST = "Jack";
const DEMO_LAST = "Wahl";

export function isKioskDemoMemberEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.KIOSK_DEMO_MEMBER === "true";
}

/**
 * Guest-path phones in dev / KIOSK_DEMO_MEMBER: always includes `7273891434`, plus any extra
 * digits from `KIOSK_DEMO_GUEST_PHONE` in `.env.local` if you need another test number.
 */
function isDemoGuestPhone(phone: string): boolean {
  if (!isKioskDemoMemberEnabled()) return false;
  const digits = normalizePhone(phone);
  if (digits === DEMO_GUEST_PHONE_DIGITS) return true;
  const raw = process.env.KIOSK_DEMO_GUEST_PHONE;
  if (raw == null || String(raw).trim() === "") return false;
  const extra = normalizePhone(String(raw));
  return extra.length >= 4 && digits === extra;
}

/** True when this phone should follow the guest kiosk path in demo mode (empty lookup). */
export function matchesKioskDemoGuestPath(phone: string): boolean {
  return isDemoGuestPhone(phone);
}

export function matchesKioskDemoLookup(lastName: string, phone: string): boolean {
  if (!isKioskDemoMemberEnabled()) return false;
  if (matchesKioskDemoGuestPath(phone)) return false;
  const digits = normalizePhone(phone);
  if (digits !== DEMO_PHONE_DIGITS) return false;
  const ln = lastName.replace(/\s+/g, " ").trim().toLowerCase();
  if (ln.length === 0) return true;
  return ln === DEMO_LAST_LOWER;
}

export function isKioskDemoMemberId(personId: string): boolean {
  return personId === KIOSK_DEMO_MEMBER_ID;
}

function demoPriorCheckInIso(now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 3);
  d.setHours(18, 30, 0, 0);
  return d.toISOString();
}

/**
 * Demo active member (Wahl + demo phone). For local / KIOSK_DEMO_MEMBER without Supabase.
 */
export function buildKioskDemoSearchResults(now: Date) {
  const lastCheckInAt = demoPriorCheckInIso(now);
  const row = {
    id: KIOSK_DEMO_MEMBER_ID,
    first_name: DEMO_FIRST,
    last_name: DEMO_LAST,
    phone: DEMO_PHONE_DIGITS,
    status: "member" as const,
    member_state: "active" as const,
    trial_end_date: null as null,
    last_check_in: lastCheckInAt,
  };

  const effective = getEffectiveStatusForMessaging(
    {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      status: row.status,
      member_state: row.member_state,
      trial_end_date: row.trial_end_date,
      last_check_in: row.last_check_in,
    },
    now
  );

  return [
    {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      phoneMasked: maskPhone(row.phone),
      status: effective.status,
      memberState: effective.status === "member" ? (effective.member_state ?? null) : null,
      daysLeftInTrial: effective.status === "trial" ? (effective.daysLeft ?? 0) : null,
      lastCheckInAt: row.last_check_in,
    },
  ];
}
