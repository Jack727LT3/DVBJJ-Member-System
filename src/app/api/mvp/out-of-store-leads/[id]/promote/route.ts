import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { StaffGuestRow } from "@/lib/staffDashboard";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type PromoteBody = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string | null;
  createdAt?: string;
};

async function fetchGuestRow(supabase: ReturnType<typeof getSupabaseAdmin>, id: string): Promise<StaffGuestRow | null> {
  const { data, error } = await supabase
    .from("people")
    .select(
      "id, first_name, last_name, phone, email, created_at, last_check_in, total_check_ins, completed_trial, member_parents, notes(id, body, created_at)"
    )
    .eq("id", id)
    .eq("status", "guest")
    .maybeSingle();

  if (error || !data) return null;

  const parentsRaw = data.member_parents as { name?: string; phone?: string }[] | null;
  const notesRaw = data.notes as { id: string; body: string; created_at: string }[] | null;

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    phone: data.phone,
    email: data.email,
    createdAt: data.created_at,
    lastVisit: data.last_check_in,
    totalVisits: data.total_check_ins ?? 0,
    dateOfBirth: null,
    ageGroup: "adult",
    completedTrial: Boolean(data.completed_trial),
    parents: Array.isArray(parentsRaw)
      ? parentsRaw.filter((g): g is { name: string; phone: string } => Boolean(g?.name && g?.phone))
      : [],
    notes: (notesRaw ?? []).map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.created_at,
    })),
  };
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: PromoteBody = {};
  try {
    body = (await req.json()) as PromoteBody;
  } catch {
    // optional body for demo fallback
  }

  if (id.startsWith("demo-oos-")) {
    const guest: StaffGuestRow = {
      id,
      firstName: body.firstName ?? "Lead",
      lastName: body.lastName ?? "",
      phone: body.phone ?? "",
      email: body.email ?? null,
      createdAt: body.createdAt ?? new Date().toISOString(),
      lastVisit: null,
      totalVisits: 0,
      dateOfBirth: null,
      ageGroup: "adult",
      completedTrial: false,
      parents: [],
      notes: [],
    };
    return NextResponse.json({ source: "demo", ok: true, guest });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_promote_out_of_store_lead", {
      p_person_id: id,
    });
    if (error) throw error;

    const result = data as { ok: boolean; error?: string; guest_id?: string };
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Could not promote lead." }, { status: 400 });
    }

    const guestId = result.guest_id ?? id;
    const guest = await fetchGuestRow(supabase, guestId);
    return NextResponse.json({ source: "live", ok: true, guestId, guest });
  } catch {
    return NextResponse.json({ error: "Could not promote lead." }, { status: 500 });
  }
}
