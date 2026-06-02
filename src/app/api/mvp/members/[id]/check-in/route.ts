import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function isDemoMemberId(id: string) {
  return id.startsWith("demo-") || /^m\d+$/.test(id);
}

export async function POST(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const now = new Date().toISOString();

  if (isDemoMemberId(id)) {
    return NextResponse.json({
      source: "demo",
      lastVisit: now,
      totalVisits: 1,
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_staff_check_in", { p_person_id: id });
    if (error) throw error;

    const result = data as {
      ok: boolean;
      error?: string;
      last_check_in?: string;
      total_check_ins?: number;
    };

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Could not check in." }, { status: 400 });
    }

    return NextResponse.json({
      source: "live",
      lastVisit: result.last_check_in,
      totalVisits: result.total_check_ins,
    });
  } catch {
    return NextResponse.json({ error: "Could not check in." }, { status: 500 });
  }
}
