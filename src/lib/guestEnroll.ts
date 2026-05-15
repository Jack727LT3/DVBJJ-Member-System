import type { MemberAgeGroup, StaffGuestRow, StaffMemberParent, StaffMemberRow } from "@/lib/staffDashboard";

export type GuestEnrollPayload = {
  beltColor: string;
  monthlyPayment: number;
  ageGroup: MemberAgeGroup;
  dateOfBirth: string | null;
  parents: StaffMemberParent[];
};

export function buildMemberFromGuestEnroll(
  guest: StaffGuestRow,
  payload: GuestEnrollPayload
): StaffMemberRow {
  return {
    id: guest.id,
    firstName: guest.firstName,
    lastName: guest.lastName,
    phone: guest.phone,
    email: guest.email,
    joinDate: new Date().toISOString(),
    lastVisit: guest.lastVisit,
    totalVisits: guest.lastVisit ? 1 : 0,
    memberState: "active",
    beltColor: payload.beltColor,
    monthlyPayment: payload.monthlyPayment,
    ageGroup: payload.ageGroup,
    dateOfBirth: payload.dateOfBirth,
    parents: payload.parents,
    notes: guest.notes,
  };
}
