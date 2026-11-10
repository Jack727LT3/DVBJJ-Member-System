import { NextResponse } from "next/server";
import { mapRpcCalendarEvent, mapRpcOverlay } from "@/lib/staffCalendar";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function scheduledEndDate(startDate: string): string {
  const d = new Date(`${startDate}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  try {
    const supabase = getSupabaseAdmin();
    await supabase.rpc("mvp_calendar_activate_due_trials");

    let events: ReturnType<typeof mapRpcCalendarEvent>[] = [];
    const eventsRpc = await supabase.rpc("mvp_calendar_events_list", { p_from: from, p_to: to });
    if (!eventsRpc.error && Array.isArray(eventsRpc.data)) {
      events = eventsRpc.data.map((r) =>
        mapRpcCalendarEvent(r as Parameters<typeof mapRpcCalendarEvent>[0])
      );
    } else {
      // Direct table fallback if RPC missing
      let q = supabase.from("calendar_events").select("*").order("start_date", { ascending: true });
      if (from) q = q.gte("end_date", from);
      if (to) q = q.lte("start_date", to);
      // Correct range: end_date >= from AND start_date <= to
      q = supabase
        .from("calendar_events")
        .select("*")
        .gte("end_date", from ?? "1900-01-01")
        .lte("start_date", to ?? "2100-01-01")
        .order("start_date", { ascending: true });
      const direct = await q;
      if (direct.error) throw direct.error;
      events = (direct.data ?? []).map((r) =>
        mapRpcCalendarEvent({
          id: String(r.id),
          kind: String(r.kind),
          title: String(r.title),
          notes: (r.notes as string | null) ?? null,
          person_id: (r.person_id as string | null) ?? null,
          start_date: String(r.start_date),
          end_date: String(r.end_date),
          start_time: (r.start_time as string | null) ?? null,
          created_at: r.created_at ? String(r.created_at) : undefined,
        })
      );
    }

    let trialOverlays: ReturnType<typeof mapRpcOverlay>[] = [];
    const overlaysRpc = await supabase.rpc("mvp_calendar_trial_overlays_list");
    if (!overlaysRpc.error && Array.isArray(overlaysRpc.data)) {
      trialOverlays = overlaysRpc.data.map((r) =>
        mapRpcOverlay(r as Parameters<typeof mapRpcOverlay>[0])
      );
    } else {
      const direct = await supabase.from("calendar_trial_overlays").select("*");
      if (!direct.error && Array.isArray(direct.data)) {
        trialOverlays = direct.data.map((r) =>
          mapRpcOverlay({
            person_id: String(r.person_id),
            note: (r.note as string | null) ?? null,
            start_time: (r.start_time as string | null) ?? null,
          })
        );
      }
    }

    return NextResponse.json({ source: "live", events, trialOverlays });
  } catch {
    return NextResponse.json({ source: "demo", events: [], trialOverlays: [] });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const kind = b.kind === "scheduled_trial" ? "scheduled_trial" : "appointment";
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const startDate = typeof b.startDate === "string" ? b.startDate.slice(0, 10) : "";
  const endDate =
    typeof b.endDate === "string" ? b.endDate.slice(0, 10) : startDate;
  const notes = typeof b.notes === "string" ? b.notes : null;
  const personId = typeof b.personId === "string" && b.personId.length > 0 ? b.personId : null;
  const startTime =
    typeof b.startTime === "string" && /^\d{2}:\d{2}/.test(b.startTime) ? b.startTime.slice(0, 5) : null;

  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "Title and start date are required." }, { status: 400 });
  }

  const resolvedEnd = kind === "scheduled_trial" ? scheduledEndDate(startDate) : endDate || startDate;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_calendar_event_create", {
      p_kind: kind,
      p_title: title,
      p_start_date: startDate,
      p_end_date: resolvedEnd,
      p_person_id: personId,
      p_notes: notes,
      p_start_time: startTime,
    });
    if (!error && data && (data as { ok?: boolean }).ok) {
      const result = data as { event: Parameters<typeof mapRpcCalendarEvent>[0] };
      return NextResponse.json({
        source: "live",
        ok: true,
        event: mapRpcCalendarEvent(result.event),
      });
    }

    // Direct insert fallback so trials persist even if RPC is missing/outdated
    const { data: row, error: insertErr } = await supabase
      .from("calendar_events")
      .insert({
        kind,
        title,
        notes: notes && notes.trim() ? notes.trim() : null,
        person_id: personId,
        start_date: startDate,
        end_date: resolvedEnd,
        start_time: startTime,
      })
      .select("*")
      .single();

    if (insertErr || !row) {
      throw insertErr ?? new Error("insert failed");
    }

    return NextResponse.json({
      source: "live",
      ok: true,
      event: mapRpcCalendarEvent({
        id: String(row.id),
        kind: String(row.kind),
        title: String(row.title),
        notes: (row.notes as string | null) ?? null,
        person_id: (row.person_id as string | null) ?? null,
        start_date: String(row.start_date),
        end_date: String(row.end_date),
        start_time: (row.start_time as string | null) ?? null,
        created_at: row.created_at ? String(row.created_at) : undefined,
      }),
    });
  } catch {
    const event = {
      id: `demo-cal-${Date.now()}`,
      kind: kind as "appointment" | "scheduled_trial",
      title,
      notes,
      personId,
      startDate,
      endDate: resolvedEnd,
      startTime,
    };
    return NextResponse.json({ source: "demo", ok: true, event });
  }
}
