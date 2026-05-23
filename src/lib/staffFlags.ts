export type StaffFlagType = "missed_payment" | "absent_week_plus" | "other";

export const STAFF_FLAG_OPTIONS: { value: StaffFlagType; label: string }[] = [
  { value: "missed_payment", label: "Missed payment" },
  { value: "absent_week_plus", label: "Absent 1 week +" },
  { value: "other", label: "Other" },
];

export function staffFlagLabel(
  flagType: StaffFlagType | null | undefined,
  flagOther: string | null | undefined
): string | null {
  if (!flagType) return null;
  if (flagType === "missed_payment") return "Flagged · Missed payment";
  if (flagType === "absent_week_plus") return "Flagged · Absent 1 week+";
  if (flagType === "other") return flagOther ? `Flagged · ${flagOther}` : "Flagged · Other";
  return "Flagged";
}

export function isStaffFlaggedMember(m: {
  memberState: string | null;
  staffFlagType?: StaffFlagType | null;
}): boolean {
  if (m.staffFlagType) return true;
  return Boolean(m.memberState && m.memberState !== "active");
}
