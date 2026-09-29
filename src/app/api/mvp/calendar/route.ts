import { NextResponse } from "next/server";
import { mapRpcCalendarEvent, mapRpcOverlay } from "@/lib/staffCalendar";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  try {
    const supabase = getSupabaseAdmin();
    await supabase.rpc("mvp_calendar_activate_due_trials");
    const [eventsRpc, overlaysRpc] = await Promise.all([
      supabase.rpc("mvp_calendar_events_list", { p_from: from, p_to: to }),
      supabase.rpc("mvp_calendar_trial_overlays_list"),
    ]);
    if (eventsRpc.error) throw eventsRpc.error;
    const rows = Array.isArray(eventsRpc.data) ? eventsRpc.data : [];
    const overlaysRaw = Array.isArray(overlaysRpc.data) ? overlaysRpc.data : [];
    return NextResponse.json({
      source: "live",
      events: rows.map((r) => mapRpcCalendarEvent(r as Parameters<typeof mapRpcCalendarEvent>[0])),
      trialOverlays: overlaysRaw.map((r) =>
        mapRpcOverlay(r as Parameters<typeof mapRpcOverlay>[0])
      ),
    });
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
  const endDate = typeof b.endDate === "string" ? b.endDate.slice(0, 10) : startDate;
  const notes = typeof b.notes === "string" ? b.notes : null;
  const personId = typeof b.personId === "string" && b.personId.length > 0 ? b.personId : null;
  const startTime =
    typeof b.startTime === "string" && /^\d{2}:\d{2}/.test(b.startTime) ? b.startTime.slice(0, 5) : null;

  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "Title and start date are required." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_calendar_event_create", {
      p_kind: kind,
      p_title: title,
      p_start_date: startDate,
      p_end_date: endDate || startDate,
      p_person_id: personId,
      p_notes: notes,
      p_start_time: startTime,
    });
    if (error) throw error;
    const result = data as {
      ok: boolean;
      error?: string;
      event?: Parameters<typeof mapRpcCalendarEvent>[0];
    };
    if (!result.ok || !result.event) {
      const msg =
        result.error === "person_not_eligible"
          ? "Only guests or out-of-gym leads can be scheduled for a trial."
          : result.error === "person_not_found"
            ? "Person not found."
            : "Could not create event.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({
      source: "live",
      ok: true,
      event: mapRpcCalendarEvent(result.event),
    });
  } catch {
    const event = {
      id: `demo-cal-${Date.now()}`,
      kind: kind as "appointment" | "scheduled_trial",
      title,
      notes,
      personId,
      startDate,
      endDate:
        kind === "scheduled_trial"
          ? (() => {
              const d = new Date(`${startDate}T12:00:00`);
              d.setDate(d.getDate() + 6);
              return d.toISOString().slice(0, 10);
            })()
          : endDate || startDate,
      startTime,
    };
    return NextResponse.json({ source: "demo", ok: true, event });
  }
}
