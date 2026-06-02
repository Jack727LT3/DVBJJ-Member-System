import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; checkInId: string }> };

function isDemoMemberId(id: string) {
  return id.startsWith("demo-") || /^m\d+$/.test(id);
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id, checkInId } = await context.params;

  if (isDemoMemberId(id)) {
    return NextResponse.json({
      source: "demo",
      ok: true,
      lastVisit: null,
      totalVisits: 0,
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_delete_check_in", {
      p_person_id: id,
      p_check_in_id: checkInId,
    });
    if (error) throw error;

    const result = data as {
      ok: boolean;
      error?: string;
      last_visit?: string | null;
      total_visits?: number;
    };

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Could not remove check-in." }, { status: 400 });
    }

    return NextResponse.json({
      source: "live",
      ok: true,
      lastVisit: result.last_visit ?? null,
      totalVisits: result.total_visits ?? 0,
    });
  } catch {
    return NextResponse.json({ error: "Could not remove check-in." }, { status: 500 });
  }
}
