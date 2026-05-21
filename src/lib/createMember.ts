import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberAgeGroup, StaffMemberParent, StaffMemberRow } from "@/lib/staffDashboard";
import { normalizePhone } from "@/lib/phone";

export type CreateMemberPayload = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  beltColor: string | null;
  monthlyPayment: number;
  ageGroup: MemberAgeGroup;
  dateOfBirth: string | null;
  parents: StaffMemberParent[];
};

export function sanitizePersonName(input: string) {
  const collapsed = input.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  return collapsed
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function parseCreateMemberPayload(body: unknown): CreateMemberPayload | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request." };
  const b = body as Record<string, unknown>;

  const firstName = sanitizePersonName(typeof b.firstName === "string" ? b.firstName : "");
  const lastName = sanitizePersonName(typeof b.lastName === "string" ? b.lastName : "");
  const phone = typeof b.phone === "string" ? b.phone : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const beltRaw = typeof b.beltColor === "string" ? b.beltColor.trim() : "";
  const beltColor = beltRaw.length > 0 ? beltRaw : null;

  const monthlyPayment =
    typeof b.monthlyPayment === "number"
      ? b.monthlyPayment
      : typeof b.monthlyPayment === "string"
        ? Number.parseFloat(b.monthlyPayment)
        : NaN;

  const ageGroup: MemberAgeGroup = b.ageGroup === "child" ? "child" : "adult";
  const dateOfBirth =
    typeof b.dateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.dateOfBirth)
      ? b.dateOfBirth
      : null;

  const parents: StaffMemberParent[] = Array.isArray(b.parents)
    ? b.parents
        .map((p) => {
          if (!p || typeof p !== "object") return null;
          const row = p as Record<string, unknown>;
          const name = typeof row.name === "string" ? row.name.trim() : "";
          const parentPhone = typeof row.phone === "string" ? row.phone.replace(/\D/g, "") : "";
          if (!name || parentPhone.length < 10) return null;
          return { name, phone: parentPhone };
        })
        .filter((p): p is StaffMemberParent => p !== null)
    : [];

  if (!firstName || !lastName) return { error: "Enter first and last name." };
  if (normalizePhone(phone).length < 10) return { error: "Enter a valid phone number." };
  if (!email || !email.includes("@")) return { error: "Enter a valid email." };
  if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
    return { error: "Enter a valid monthly payment." };
  }
  if (ageGroup === "child" && parents.length === 0) {
    return { error: "Add parent or guardian info for child members." };
  }

  return {
    firstName,
    lastName,
    phone,
    email,
    beltColor,
    monthlyPayment,
    ageGroup,
    dateOfBirth,
    parents,
  };
}

export async function createMemberInDatabase(
  supabase: SupabaseClient,
  payload: CreateMemberPayload
): Promise<{ ok: true; member: StaffMemberRow } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("mvp_create_member", {
    p_first_name: payload.firstName,
    p_last_name: payload.lastName,
    p_phone: normalizePhone(payload.phone),
    p_email: payload.email,
    p_monthly_payment: payload.monthlyPayment,
    p_belt_color: payload.beltColor,
    p_member_age_group: payload.ageGroup,
    p_date_of_birth: payload.dateOfBirth,
    p_member_parents: payload.parents,
  });
  if (error) return { ok: false, error: "db_error" };

  const result = data as {
    ok: boolean;
    error?: string;
    member?: Parameters<typeof mapRpcMemberRow>[0];
  };

  if (!result.ok || !result.member) {
    const code = result.error ?? "unknown";
    const msg =
      code === "duplicate_phone"
        ? "A profile with this phone number already exists."
        : code === "parent_required"
          ? "Child members need parent or guardian info."
          : code === "invalid_payment"
            ? "Invalid monthly payment."
            : code === "invalid_email"
              ? "Invalid email."
              : "Could not add member.";
    return { ok: false, error: msg };
  }

  return { ok: true, member: mapRpcMemberRow(result.member) };
}

export function buildDemoMemberFromPayload(payload: CreateMemberPayload): StaffMemberRow {
  const id = `demo-member-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    firstName: payload.firstName,
    lastName: payload.lastName,
    phone: normalizePhone(payload.phone),
    email: payload.email,
    joinDate: new Date().toISOString(),
    lastVisit: null,
    totalVisits: 0,
    memberState: "active",
    beltColor: payload.beltColor,
    monthlyPayment: payload.monthlyPayment,
    ageGroup: payload.ageGroup,
    dateOfBirth: payload.dateOfBirth,
    parents: payload.parents,
    notes: [],
  };
}

export function mapRpcMemberRow(raw: {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  join_date: string;
  last_visit: string | null;
  total_visits: number;
  member_state: string | null;
  belt_color: string | null;
  monthly_payment: number | null;
  member_age_group?: string | null;
  member_parents?: { name: string; phone: string }[] | null;
  date_of_birth?: string | null;
  notes?: { id: string; body: string; created_at: string }[] | null;
}): StaffMemberRow {
  return {
    id: raw.id,
    firstName: raw.first_name,
    lastName: raw.last_name,
    phone: raw.phone,
    email: raw.email,
    joinDate: raw.join_date,
    lastVisit: raw.last_visit,
    totalVisits: raw.total_visits,
    memberState: raw.member_state as StaffMemberRow["memberState"],
    beltColor: raw.belt_color,
    monthlyPayment: raw.monthly_payment != null ? Number(raw.monthly_payment) : null,
    ageGroup: raw.member_age_group === "child" ? "child" : "adult",
    dateOfBirth: raw.date_of_birth ?? null,
    parents: Array.isArray(raw.member_parents)
      ? raw.member_parents.filter((g): g is StaffMemberParent => Boolean(g?.name && g?.phone))
      : [],
    notes: (raw.notes ?? []).map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.created_at,
    })),
  };
}
