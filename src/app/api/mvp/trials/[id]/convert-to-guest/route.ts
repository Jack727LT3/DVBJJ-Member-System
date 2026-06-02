import { NextResponse } from "next/server";
import { isDemoPersonId } from "@/lib/personNotesApi";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { StaffGuestRow } from "@/lib/staffDashboard";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const { id } = await context.params;

  if (isDemoPersonId(id)) {
    return NextResponse.json({
      source: "demo",
      ok: true,
      guest: {
        id,
        completedTrial: true,
        createdAt: new Date().toISOString(),
      },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_trial_convert_to_guest", {
      p_person_id: id,
    });
    if (error) throw error;

    const result = data as {
      ok: boolean;
      error?: string;
      guest?: {
        id: string;
        first_name: string;
        last_name: string;
        phone: string;
        email: string | null;
        created_at: string;
        last_visit: string | null;
        total_visits: number;
        date_of_birth: string | null;
        completed_trial: boolean;
      };
    };

    if (!result.ok || !result.guest) {
      return NextResponse.json({ error: result.error ?? "Could not convert." }, { status: 400 });
    }

    const g = result.guest;
    const guest: StaffGuestRow = {
      id: g.id,
      firstName: g.first_name,
      lastName: g.last_name,
      phone: g.phone,
      email: g.email,
      createdAt: g.created_at,
      lastVisit: g.last_visit,
      totalVisits: g.total_visits ?? 0,
      dateOfBirth: g.date_of_birth,
      ageGroup: "adult",
      completedTrial: Boolean(g.completed_trial),
      parents: [],
      notes: [],
    };

    return NextResponse.json({ source: "live", ok: true, guest });
  } catch {
    return NextResponse.json({ error: "Could not convert." }, { status: 500 });
  }
}
