import { NextResponse } from "next/server";
import { buildMemberFromGuestEnroll, type GuestEnrollPayload } from "@/lib/guestEnroll";
import { isDemoPersonId } from "@/lib/personNotesApi";
import type { MemberAgeGroup, StaffMemberParent } from "@/lib/staffDashboard";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function parsePayload(body: unknown): GuestEnrollPayload | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request." };
  const b = body as Record<string, unknown>;
  const beltColor = typeof b.beltColor === "string" ? b.beltColor.trim() : "";
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
          const phone = typeof row.phone === "string" ? row.phone.replace(/\D/g, "") : "";
          if (!name || phone.length < 10) return null;
          return { name, phone };
        })
        .filter((p): p is StaffMemberParent => p !== null)
    : [];

  if (!beltColor) return { error: "Select a belt color." };
  if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
    return { error: "Enter a valid monthly payment." };
  }
  if (ageGroup === "child" && parents.length === 0) {
    return { error: "Add at least one parent or guardian for child members." };
  }

  return { beltColor, monthlyPayment, ageGroup, dateOfBirth, parents };
}

function mapRpcMember(raw: {
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
}) {
  return {
    id: raw.id,
    firstName: raw.first_name,
    lastName: raw.last_name,
    phone: raw.phone,
    email: raw.email,
    joinDate: raw.join_date,
    lastVisit: raw.last_visit,
    totalVisits: raw.total_visits,
    memberState: raw.member_state as "active" | "delinquent" | "frozen" | "canceled" | null,
    beltColor: raw.belt_color,
    monthlyPayment: raw.monthly_payment != null ? Number(raw.monthly_payment) : null,
    ageGroup: raw.member_age_group === "child" ? ("child" as const) : ("adult" as const),
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

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parsePayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (isDemoPersonId(id)) {
    const guestStub = {
      id,
      firstName: "Guest",
      lastName: "Member",
      phone: "7275550000",
      email: null as string | null,
      createdAt: new Date().toISOString(),
      lastVisit: null as string | null,
      completedTrial: true,
      notes: [] as { id: string; body: string; createdAt: string }[],
    };
    return NextResponse.json({
      source: "demo",
      ok: true,
      member: buildMemberFromGuestEnroll(guestStub, parsed),
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_enroll_guest", {
      p_person_id: id,
      p_belt_color: parsed.beltColor,
      p_monthly_payment: parsed.monthlyPayment,
      p_member_age_group: parsed.ageGroup,
      p_date_of_birth: parsed.dateOfBirth,
      p_member_parents: parsed.parents,
    });
    if (error) throw error;

    const result = data as {
      ok: boolean;
      error?: string;
      member?: Parameters<typeof mapRpcMember>[0];
    };

    if (!result.ok || !result.member) {
      const msg =
        result.error === "parent_required"
          ? "Add at least one parent or guardian for child members."
          : result.error === "invalid_payment"
            ? "Enter a valid monthly payment."
            : "Could not enroll guest.";
      return NextResponse.json({ error: msg }, { status: 404 });
    }

    return NextResponse.json({
      source: "live",
      ok: true,
      member: mapRpcMember(result.member),
    });
  } catch {
    return NextResponse.json({ error: "Could not enroll guest." }, { status: 500 });
  }
}
