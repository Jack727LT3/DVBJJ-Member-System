import { NextResponse } from "next/server";
import { isDemoPersonId } from "@/lib/personNotesApi";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, context: RouteContext) {
  const { id } = await context.params;

  if (id.startsWith("demo-") || id.startsWith("trial-") || isDemoPersonId(id)) {
    return NextResponse.json({ source: "demo", ok: true });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_calendar_event_delete", {
      p_event_id: id,
    });
    if (error) throw error;
    const result = data as { ok: boolean; error?: string };
    if (!result.ok) {
      return NextResponse.json({ error: "Could not delete." }, { status: 404 });
    }
    return NextResponse.json({ source: "live", ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  }
}
