import { maskPhone, normalizePhone } from "@/lib/phone";
import { getEffectiveStatusForMessaging } from "@/lib/statusResolver";

/** Stable fake row for kiosk demos / local click-through without Supabase data. */
export const KIOSK_DEMO_MEMBER_ID = "00000000-0000-4000-b000-000000000001";

const DEMO_PHONE_DIGITS = "7273891434";
const DEMO_LAST_LOWER = "wahl";
const DEMO_FIRST = "Jack";
const DEMO_LAST = "Wahl";

export function isKioskDemoMemberEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.KIOSK_DEMO_MEMBER === "true";
}

export function matchesKioskDemoLookup(lastName: string, phone: string): boolean {
  if (!isKioskDemoMemberEnabled()) return false;
  const ln = lastName.replace(/\s+/g, " ").trim().toLowerCase();
  const digits = normalizePhone(phone);
  return ln === DEMO_LAST_LOWER && digits === DEMO_PHONE_DIGITS;
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
