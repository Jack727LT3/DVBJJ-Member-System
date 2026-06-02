import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function isDemoMemberId(id: string) {
  return id.startsWith("demo-") || /^m\d+$/.test(id);
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;

  if (isDemoMemberId(id)) {
    const now = new Date();
    return NextResponse.json({
      source: "demo",
      checkIns: [
        { id: "demo-ci-1", at: now.toISOString() },
        { id: "demo-ci-2", at: new Date(now.getTime() - 3 * 86400000).toISOString() },
      ],
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_list_attendance", {
      p_person_id: id,
      p_limit: 50,
    });
    if (error) throw error;

    const rows = Array.isArray(data)
      ? (data as { id: string; at: string }[]).map((r) => ({ id: r.id, at: r.at }))
      : [];

    return NextResponse.json({ source: "live", checkIns: rows });
  } catch {
    return NextResponse.json({ source: "demo", checkIns: [] });
  }
}
