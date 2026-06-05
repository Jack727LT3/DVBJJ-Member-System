import type {
  MemberAgeGroup,
  StaffGuestRow,
  StaffMemberParent,
  StaffMemberRow,
  StaffTrialRow,
} from "@/lib/staffDashboard";

export type GuestEnrollPayload = {
  beltColor: string;
  monthlyPayment: number;
  ageGroup: MemberAgeGroup;
  dateOfBirth: string | null;
  parents: StaffMemberParent[];
};

export function buildMemberFromTrialEnroll(
  trial: StaffTrialRow,
  payload: GuestEnrollPayload
): StaffMemberRow {
  return {
    id: trial.id,
    firstName: trial.firstName,
    lastName: trial.lastName,
    phone: trial.phone,
    email: trial.email,
    joinDate: new Date().toISOString(),
    lastVisit: null,
    totalVisits: 0,
    memberState: "active",
    beltColor: payload.beltColor,
    monthlyPayment: payload.monthlyPayment,
    ageGroup: payload.ageGroup,
    dateOfBirth: payload.dateOfBirth,
    parents: payload.parents,
    notes: trial.notes,
    staffFlagType: null,
    staffFlagOther: null,
  };
}

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
    staffFlagType: null,
    staffFlagOther: null,
  };
}
