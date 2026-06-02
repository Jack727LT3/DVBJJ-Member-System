import type { StaffMemberRow } from "@/lib/staffDashboard";
import { normalizePhone } from "@/lib/phone";

/** Remove duplicate member rows by id (keeps first occurrence). */
export function dedupeMembersById(rows: StaffMemberRow[]): StaffMemberRow[] {
  const seen = new Set<string>();
  const out: StaffMemberRow[] = [];
  for (const m of rows) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/** When the same phone exists as member and trial in demo data, keep the member row only. */
export function dedupeMembersByPhonePreferMember(rows: StaffMemberRow[]): StaffMemberRow[] {
  const byPhone = new Map<string, StaffMemberRow>();
  for (const m of rows) {
    const key = normalizePhone(m.phone);
    const existing = byPhone.get(key);
    if (!existing) {
      byPhone.set(key, m);
      continue;
    }
    if (existing.memberState === "canceled" && m.memberState !== "canceled") {
      byPhone.set(key, m);
    }
  }
  return dedupeMembersById(rows.filter((m) => byPhone.get(normalizePhone(m.phone))?.id === m.id));
}

export function compareMembersAlphabetically(a: StaffMemberRow, b: StaffMemberRow): number {
  const aFirst = (a.firstName || a.lastName).trim();
  const bFirst = (b.firstName || b.lastName).trim();
  const byFirst = aFirst.localeCompare(bFirst, undefined, { sensitivity: "base" });
  if (byFirst !== 0) return byFirst;
  return a.lastName.trim().localeCompare(b.lastName.trim(), undefined, { sensitivity: "base" });
}

export function sortMembersAlphabetically(rows: StaffMemberRow[]): StaffMemberRow[] {
  return [...rows].sort(compareMembersAlphabetically);
}
