import { NextResponse } from "next/server";
import { isDemoPersonId } from "@/lib/personNotesApi";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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
        lastVisit: null,
      },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_complete_trial_contact", {
      p_person_id: id,
    });
    if (error) throw error;

    const result = data as {
      ok: boolean;
      guest?: {
        id: string;
        first_name: string;
        last_name: string;
        created_at: string;
        last_visit: string | null;
        completed_trial: boolean;
      };
    };

    if (!result.ok || !result.guest) {
      return NextResponse.json({ error: "Could not complete contact." }, { status: 404 });
    }

    return NextResponse.json({
      source: "live",
      ok: true,
      guest: {
        id: result.guest.id,
        completedTrial: result.guest.completed_trial,
        createdAt: result.guest.created_at,
        lastVisit: result.guest.last_visit,
      },
    });
  } catch {
    return NextResponse.json({
      source: "demo",
      ok: true,
      guest: { id, completedTrial: true, createdAt: new Date().toISOString(), lastVisit: null },
    });
  }
}
