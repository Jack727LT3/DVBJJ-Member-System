"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import CalendarEventDialog from "@/components/mvp/CalendarEventDialog";
import ModalPortal from "@/components/mvp/ModalPortal";
import {
  assignEventLanes,
  eventCoversDay,
  loadDemoCalendarEvents,
  saveDemoCalendarEvents,
  segmentClass,
  segmentToneForDay,
  toDateKey,
  trialsToCalendarEvents,
  type CalendarEvent,
  type CalendarEventKind,
} from "@/lib/staffCalendar";
import { fullName } from "@/lib/mvpShared";
import type { OutOfStoreLead } from "@/lib/outOfStoreLeads";
import type { StaffGuestRow, StaffTrialRow } from "@/lib/staffDashboard";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LANE_HEIGHT = 15;
const LANE_GAP = 1;
/** How many lanes fit in the week row before scrolling. */
const VIEWPORT_LANES = 4;

type CalendarTabProps = {
  trials: StaffTrialRow[];
  guests: StaffGuestRow[];
  /** Optional: open dialog immediately for a lead/guest (from Out-of-gym). */
  schedulePrefill?: {
    id: string;
    name: string;
    source: "guest" | "lead";
    kind?: CalendarEventKind;
  } | null;
  onSchedulePrefillConsumed?: () => void;
};

type DialogState = {
  date: string;
  kind: CalendarEventKind;
  prefill: { id: string; name: string; source: "guest" | "lead" } | null;
};

export default function CalendarTab({
  trials,
  guests,
  schedulePrefill = null,
  onSchedulePrefillConsumed,
}: CalendarTabProps) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [manualEvents, setManualEvents] = useState<CalendarEvent[]>([]);
  const [source, setSource] = useState<"live" | "demo">("demo");
  const [loading, setLoading] = useState(true);
  const [outOfStoreLeads, setOutOfStoreLeads] = useState<OutOfStoreLead[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const today = startOfDay(new Date());
  const todayKey = toDateKey(today);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);

  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart.getTime(), gridEnd.getTime()]
  );

  const weeks = useMemo(() => {
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [days]);

  const trialEvents = useMemo(() => trialsToCalendarEvents(trials), [trials]);

  const allEvents = useMemo(() => {
    const byId = new Map<string, CalendarEvent>();
    for (const e of manualEvents) byId.set(e.id, e);
    for (const e of trialEvents) byId.set(e.id, e);
    return [...byId.values()];
  }, [manualEvents, trialEvents]);

  const rangeFrom = toDateKey(gridStart);
  const rangeTo = toDateKey(gridEnd);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/mvp/calendar?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as { source: "live" | "demo"; events: CalendarEvent[] };
      setSource(json.source);
      if (json.source === "live") {
        setManualEvents(json.events ?? []);
      } else {
        setManualEvents(loadDemoCalendarEvents());
      }
    } catch {
      setSource("demo");
      setManualEvents(loadDemoCalendarEvents());
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/mvp/out-of-store-leads", { cache: "no-store" });
        const json = (await res.json()) as { leads: OutOfStoreLead[] };
        setOutOfStoreLeads(json.leads ?? []);
      } catch {
        setOutOfStoreLeads([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!schedulePrefill) return;
    setDialog({
      date: todayKey,
      kind: schedulePrefill.kind ?? "scheduled_trial",
      prefill: {
        id: schedulePrefill.id,
        name: schedulePrefill.name,
        source: schedulePrefill.source,
      },
    });
    onSchedulePrefillConsumed?.();
  }, [schedulePrefill, todayKey, onSchedulePrefillConsumed]);

  function openAdd(date: Date, kind: CalendarEventKind = "appointment") {
    setDialog({ date: toDateKey(date), kind, prefill: null });
  }

  function handleSaved(event: CalendarEvent) {
    setManualEvents((prev) => {
      const next = [event, ...prev.filter((e) => e.id !== event.id)];
      if (source === "demo") saveDemoCalendarEvents(next);
      return next;
    });
  }

  async function handleDelete(event: CalendarEvent) {
    if (event.kind === "active_trial") {
      setSelected(null);
      return;
    }
    if (!confirm(`Remove “${event.title}” from the calendar?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/mvp/calendar/${event.id}`, { method: "DELETE" });
      setManualEvents((prev) => {
        const next = prev.filter((e) => e.id !== event.id);
        if (source === "demo") saveDemoCalendarEvents(next);
        return next;
      });
      setSelected(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-brand-ink">Calendar</h2>
          <p className="mt-1 max-w-xl text-sm text-brand-muted">
            Trials and appointments for guests &amp; out-of-gym leads. Bars span the full trial window —
            green on day one, purple in the middle, red on the last day. Future trials stay grey until they start.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openAdd(today, "appointment")}
          className="shrink-0 rounded-xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
        >
          Add to calendar
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCursor((c) => addMonths(c, -1))}
              className="rounded-lg border border-black/10 px-2.5 py-1.5 text-sm text-brand-ink hover:bg-black/[0.03]"
              aria-label="Previous month"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setCursor(startOfMonth(new Date()))}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-brand-ink hover:bg-black/[0.03]"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setCursor((c) => addMonths(c, 1))}
              className="rounded-lg border border-black/10 px-2.5 py-1.5 text-sm text-brand-ink hover:bg-black/[0.03]"
              aria-label="Next month"
            >
              ›
            </button>
            <h3 className="ml-2 text-base font-semibold text-brand-ink sm:text-lg">
              {format(cursor, "MMMM yyyy")}
            </h3>
          </div>
          {loading ? <span className="text-xs text-brand-muted">Loading…</span> : null}
        </div>

        <div className="grid grid-cols-7 border-b border-black/[0.06] bg-neutral-50/80">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-brand-muted"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="divide-y divide-black/[0.06]">
          {weeks.map((week) => {
            const weekStartKey = toDateKey(week[0]!);
            const weekEndKey = toDateKey(week[6]!);
            const weekEvents = allEvents.filter(
              (e) => e.startDate <= weekEndKey && e.endDate >= weekStartKey
            );
            const lanes = assignEventLanes(weekEvents);
            const laneCount = weekEvents.reduce((m, e) => Math.max(m, (lanes.get(e.id) ?? 0) + 1), 0);
            const contentHeight = Math.max(laneCount, 1) * (LANE_HEIGHT + LANE_GAP) + 6;
            const viewportHeight = VIEWPORT_LANES * (LANE_HEIGHT + LANE_GAP) + 6;
            const needsScroll = laneCount > VIEWPORT_LANES;

            return (
              <div key={weekStartKey} className="relative">
                <div className="grid grid-cols-7">
                  {week.map((day) => {
                    const key = toDateKey(day);
                    const inMonth = isSameMonth(day, cursor);
                    const isToday = isSameDay(day, today);
                    const dayEvents = allEvents.filter((e) => eventCoversDay(e, key));
                    const apptCount = dayEvents.filter((e) => e.kind === "appointment").length;
                    const scheduledCount = dayEvents.filter((e) => e.kind === "scheduled_trial").length;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => openAdd(day)}
                        className={[
                          "flex items-start justify-between gap-0.5 border-r border-black/[0.04] px-1.5 pb-1 pt-1.5 text-left last:border-r-0",
                          "transition-colors hover:bg-black/[0.02] focus:outline-none focus-visible:bg-black/[0.03]",
                          !inMonth ? "bg-neutral-50/50" : "bg-white",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                            isToday
                              ? "bg-brand-ink text-white"
                              : inMonth
                                ? "text-brand-ink"
                                : "text-brand-muted/50",
                          ].join(" ")}
                        >
                          {format(day, "d")}
                        </span>
                        <span className="flex min-w-0 flex-wrap items-center justify-end gap-0.5 pt-0.5">
                          {apptCount > 0 ? (
                            <span
                              className="rounded bg-sky-500 px-1 text-[9px] font-bold leading-4 text-white"
                              title={`${apptCount} appointment${apptCount === 1 ? "" : "s"}`}
                            >
                              {apptCount}a
                            </span>
                          ) : null}
                          {scheduledCount > 0 ? (
                            <span
                              className="rounded bg-neutral-400 px-1 text-[9px] font-bold leading-4 text-white"
                              title={`${scheduledCount} scheduled trial${scheduledCount === 1 ? "" : "s"}`}
                            >
                              {scheduledCount}s
                            </span>
                          ) : null}
                          {dayEvents.length > VIEWPORT_LANES ? (
                            <span className="text-[9px] font-medium text-brand-muted">
                              {dayEvents.length}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div
                  className={[
                    "relative border-t border-black/[0.03]",
                    needsScroll ? "overflow-y-auto overscroll-contain" : "overflow-hidden",
                  ].join(" ")}
                  style={{ maxHeight: viewportHeight }}
                  onWheel={(e) => e.stopPropagation()}
                >
                  <div className="relative grid grid-cols-7" style={{ height: contentHeight }}>
                    {week.map((day) => {
                      const key = toDateKey(day);
                      const inMonth = isSameMonth(day, cursor);
                      return (
                        <button
                          key={`cell-${key}`}
                          type="button"
                          onClick={() => openAdd(day)}
                          className={[
                            "border-r border-black/[0.04] last:border-r-0 hover:bg-black/[0.02]",
                            !inMonth ? "bg-neutral-50/40" : "bg-white",
                          ].join(" ")}
                          aria-label={`Add on ${key}`}
                        />
                      );
                    })}

                    {weekEvents.map((ev) => {
                      const lane = lanes.get(ev.id) ?? 0;
                      const clippedStart =
                        ev.startDate < weekStartKey
                          ? 0
                          : week.findIndex((d) => toDateKey(d) >= ev.startDate);
                      const clippedEnd =
                        ev.endDate > weekEndKey
                          ? 6
                          : week.findIndex((d) => toDateKey(d) === ev.endDate);
                      const from = clippedStart < 0 ? 0 : clippedStart;
                      const to = clippedEnd < 0 ? 6 : clippedEnd;
                      if (from > to) return null;

                      const leftPct = (from / 7) * 100;
                      const widthPct = ((to - from + 1) / 7) * 100;
                      const top = 2 + lane * (LANE_HEIGHT + LANE_GAP);

                      const segments: string[] = [];
                      for (let i = from; i <= to; i++) segments.push(toDateKey(week[i]!));

                      return (
                        <div
                          key={ev.id}
                          className="absolute flex px-0.5"
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            top,
                            height: LANE_HEIGHT,
                          }}
                        >
                          {segments.map((dayKey, i) => {
                            const tone = segmentToneForDay(ev, dayKey, todayKey);
                            const isFirst = i === 0;
                            const isLast = i === segments.length - 1;
                            return (
                              <button
                                key={dayKey}
                                type="button"
                                title={`${ev.title}${ev.kind === "appointment" ? " · Appointment" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected(ev);
                                }}
                                className={[
                                  "pointer-events-auto min-w-0 flex-1 truncate px-1 text-left text-[9px] font-semibold leading-[15px] transition hover:brightness-95",
                                  segmentClass(tone),
                                  isFirst ? "rounded-l" : "",
                                  isLast ? "rounded-r" : "",
                                  !isFirst ? "pl-0.5" : "",
                                ].join(" ")}
                              >
                                {isFirst ? ev.title : "\u00a0"}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {needsScroll ? (
                  <p className="border-t border-black/[0.04] bg-neutral-50/80 px-2 py-0.5 text-center text-[9px] font-medium text-brand-muted">
                    Scroll this week for {laneCount - VIEWPORT_LANES} more · appointments &amp; scheduled sit on top
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-black/[0.06] px-4 py-3 text-[11px] text-brand-muted sm:px-5">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> First day
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> Trial days
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand-red" /> Last day
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-neutral-300" /> Scheduled (not started)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Appointment
          </span>
        </div>
      </div>

      {source === "demo" ? (
        <p className="text-center text-xs text-brand-muted">
          Demo mode — calendar entries save in this browser until the calendar migration is live.
        </p>
      ) : null}

      <CalendarEventDialog
        open={dialog !== null}
        initialDate={dialog?.date ?? todayKey}
        initialKind={dialog?.kind ?? "appointment"}
        prefillPerson={dialog?.prefill ?? null}
        guests={guests}
        outOfStoreLeads={outOfStoreLeads}
        onClose={() => setDialog(null)}
        onSaved={handleSaved}
      />

      {selected ? (
        <EventDetailSheet
          event={selected}
          todayKey={todayKey}
          deleting={deleting}
          onClose={() => setSelected(null)}
          onDelete={() => void handleDelete(selected)}
        />
      ) : null}
    </div>
  );
}

function EventDetailSheet({
  event,
  todayKey,
  deleting,
  onClose,
  onDelete,
}: {
  event: CalendarEvent;
  todayKey: string;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const kindLabel =
    event.kind === "active_trial"
      ? "Active trial"
      : event.kind === "scheduled_trial"
        ? event.startDate > todayKey
          ? "Scheduled trial"
          : "Trial"
        : "Appointment";

  const range =
    event.startDate === event.endDate
      ? format(new Date(`${event.startDate}T12:00:00`), "MMM d, yyyy")
      : `${format(new Date(`${event.startDate}T12:00:00`), "MMM d")} – ${format(new Date(`${event.endDate}T12:00:00`), "MMM d, yyyy")}`;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-black/[0.06] bg-white p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">{kindLabel}</p>
          <h3 className="mt-1 text-lg font-semibold text-brand-ink">{event.title}</h3>
          <p className="mt-1 text-sm text-brand-muted">{range}</p>
          {event.notes ? <p className="mt-3 text-sm text-brand-ink">{event.notes}</p> : null}
          {event.personFirstName ? (
            <p className="mt-2 text-xs text-brand-muted">
              Linked: {fullName(event.personFirstName, event.personLastName ?? "")}
            </p>
          ) : null}

          <div className="mt-5 flex gap-2">
            {event.kind !== "active_trial" ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="flex-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-black/10 px-4 py-2.5 text-sm font-medium text-brand-ink"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
