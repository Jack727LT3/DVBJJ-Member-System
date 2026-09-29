import { NextResponse } from "next/server";
import { isDemoPersonId } from "@/lib/personNotesApi";
import { mapRpcCalendarEvent, mapRpcOverlay } from "@/lib/staffCalendar";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const setNote = "notes" in b;
  const notes = typeof b.notes === "string" ? b.notes : null;
  const clearStartTime = b.clearStartTime === true;
  const startTime =
    typeof b.startTime === "string" && /^\d{2}:\d{2}/.test(b.startTime) ? b.startTime.slice(0, 5) : null;

  // Active trial overlay: id is trial-<personId>
  if (id.startsWith("trial-")) {
    const personId = id.slice("trial-".length);
    if (id.startsWith("trial-demo-") || isDemoPersonId(personId)) {
      return NextResponse.json({
        source: "demo",
        ok: true,
        overlay: {
          personId,
          note: setNote ? notes : undefined,
          startTime: clearStartTime ? null : startTime,
        },
      });
    }
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.rpc("mvp_calendar_trial_overlay_upsert", {
        p_person_id: personId,
        p_note: notes,
        p_start_time: startTime,
        p_clear_start_time: clearStartTime,
        p_set_note: setNote,
      });
      if (error) throw error;
      const result = data as {
        ok: boolean;
        overlay?: Parameters<typeof mapRpcOverlay>[0];
      };
      if (!result.ok || !result.overlay) {
        return NextResponse.json({ error: "Could not update." }, { status: 400 });
      }
      return NextResponse.json({
        source: "live",
        ok: true,
        overlay: mapRpcOverlay(result.overlay),
      });
    } catch {
      return NextResponse.json({ error: "Could not update." }, { status: 500 });
    }
  }

  if (id.startsWith("demo-") || isDemoPersonId(id)) {
    return NextResponse.json({
      source: "demo",
      ok: true,
      event: {
        id,
        notes: setNote ? notes : undefined,
        startTime: clearStartTime ? null : startTime,
      },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_calendar_event_update", {
      p_event_id: id,
      p_notes: setNote ? notes : null,
      p_start_time: startTime,
      p_clear_start_time: clearStartTime,
    });
    if (error) throw error;
    const result = data as {
      ok: boolean;
      event?: Parameters<typeof mapRpcCalendarEvent>[0];
    };
    if (!result.ok || !result.event) {
      return NextResponse.json({ error: "Could not update." }, { status: 404 });
    }
    return NextResponse.json({
      source: "live",
      ok: true,
      event: mapRpcCalendarEvent(result.event),
    });
  } catch {
    return NextResponse.json({ error: "Could not update." }, { status: 500 });
  }
}

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
