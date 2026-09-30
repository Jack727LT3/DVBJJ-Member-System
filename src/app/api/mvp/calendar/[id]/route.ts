import { NextResponse } from "next/server";
import { isDemoPersonId } from "@/lib/personNotesApi";
import { mapRpcCalendarEvent, mapRpcOverlay, normalizeTimeValue } from "@/lib/staffCalendar";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function mapEventRow(row: Record<string, unknown>) {
  return mapRpcCalendarEvent({
    id: String(row.id),
    kind: String(row.kind),
    title: String(row.title),
    notes: (row.notes as string | null) ?? null,
    person_id: (row.person_id as string | null) ?? null,
    person_first_name: null,
    person_last_name: null,
    person_phone: null,
    start_date: String(row.start_date),
    end_date: String(row.end_date),
    start_time: (row.start_time as string | null) ?? null,
    created_at: row.created_at ? String(row.created_at) : undefined,
  });
}

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
          note: setNote ? notes : null,
          startTime: clearStartTime ? null : startTime,
        },
      });
    }

    try {
      const supabase = getSupabaseAdmin();

      // Prefer RPC when available
      const rpc = await supabase.rpc("mvp_calendar_trial_overlay_upsert", {
        p_person_id: personId,
        p_note: notes,
        p_start_time: startTime,
        p_clear_start_time: clearStartTime,
        p_set_note: setNote,
      });
      if (!rpc.error && rpc.data && (rpc.data as { ok?: boolean }).ok) {
        const result = rpc.data as { overlay: Parameters<typeof mapRpcOverlay>[0] };
        return NextResponse.json({
          source: "live",
          ok: true,
          overlay: mapRpcOverlay(result.overlay),
        });
      }

      // Direct table upsert fallback (works even if RPC wasn't migrated yet)
      const { data: existing } = await supabase
        .from("calendar_trial_overlays")
        .select("person_id, note, start_time")
        .eq("person_id", personId)
        .maybeSingle();

      const nextNote = setNote ? (notes && notes.trim() ? notes.trim() : null) : (existing?.note ?? null);
      const nextTime = clearStartTime
        ? null
        : startTime ?? existing?.start_time ?? null;

      const { data, error } = await supabase
        .from("calendar_trial_overlays")
        .upsert(
          {
            person_id: personId,
            note: nextNote,
            start_time: nextTime,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "person_id" }
        )
        .select("person_id, note, start_time")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "Could not update calendar note." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        source: "live",
        ok: true,
        overlay: {
          personId: data.person_id as string,
          note: (data.note as string | null) ?? null,
          startTime: normalizeTimeValue((data.start_time as string | null) ?? null),
        },
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not update." },
        { status: 500 }
      );
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

    const rpc = await supabase.rpc("mvp_calendar_event_update", {
      p_event_id: id,
      p_notes: setNote ? notes : null,
      p_start_time: startTime,
      p_clear_start_time: clearStartTime,
    });
    if (!rpc.error && rpc.data && (rpc.data as { ok?: boolean }).ok) {
      const result = rpc.data as { event: Parameters<typeof mapRpcCalendarEvent>[0] };
      return NextResponse.json({
        source: "live",
        ok: true,
        event: mapRpcCalendarEvent(result.event),
      });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const patch: Record<string, unknown> = {};
    if (setNote) patch.notes = notes && notes.trim() ? notes.trim() : null;
    if (clearStartTime) patch.start_time = null;
    else if (startTime) patch.start_time = startTime;

    const { data, error } = await supabase
      .from("calendar_events")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Could not update." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      source: "live",
      ok: true,
      event: mapEventRow(data as Record<string, unknown>),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update." },
      { status: 500 }
    );
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
    if (!error && data && (data as { ok?: boolean }).ok) {
      return NextResponse.json({ source: "live", ok: true });
    }

    const del = await supabase.from("calendar_events").delete().eq("id", id);
    if (del.error) {
      return NextResponse.json({ error: del.error.message }, { status: 500 });
    }
    return NextResponse.json({ source: "live", ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not delete." },
      { status: 500 }
    );
  }
}
