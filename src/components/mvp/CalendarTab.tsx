"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
import TrialProfilePanel from "@/components/mvp/TrialProfilePanel";
import GuestProfilePanel from "@/components/mvp/GuestProfilePanel";
import {
  assignEventLanes,
  barLabel,
  eventCoversDay,
  loadDemoCalendarEvents,
  loadDemoOverlays,
  saveDemoCalendarEvents,
  saveDemoOverlays,
  segmentClass,
  segmentToneForDay,
  toDateKey,
  trialsToCalendarEvents,
  type CalendarEvent,
  type CalendarEventKind,
  type CalendarTrialOverlay,
} from "@/lib/staffCalendar";
import { formatPhoneDisplay } from "@/lib/phone";
import type { OutOfStoreLead } from "@/lib/outOfStoreLeads";
import type { StaffGuestRow, StaffMemberRow, StaffTrialRow } from "@/lib/staffDashboard";
import { sortTrialsByUrgency } from "@/lib/staffDashboard";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LANE_HEIGHT = 15;
const LANE_GAP = 1;
/** How many lanes fit in the week row before scrolling. */
const VIEWPORT_LANES = 4;

type CalendarTabProps = {
  trials: StaffTrialRow[];
  guests: StaffGuestRow[];
  onTrialsChange?: (trials: StaffTrialRow[]) => void;
  onGuestsChange?: (guests: StaffGuestRow[]) => void;
  onMemberEnrolled?: (member: StaffMemberRow) => void;
  onCalendarEventsChange?: (events: CalendarEvent[]) => void;
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
  onTrialsChange,
  onGuestsChange,
  onMemberEnrolled,
  onCalendarEventsChange,
  schedulePrefill = null,
  onSchedulePrefillConsumed,
}: CalendarTabProps) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [manualEvents, setManualEvents] = useState<CalendarEvent[]>([]);
  const [overlays, setOverlays] = useState<CalendarTrialOverlay[]>([]);
  const [source, setSource] = useState<"live" | "demo">("demo");
  const [loading, setLoading] = useState(true);
  const [outOfStoreLeads, setOutOfStoreLeads] = useState<OutOfStoreLead[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [profileTrialId, setProfileTrialId] = useState<string | null>(null);
  const [profileGuestId, setProfileGuestId] = useState<string | null>(null);

  const profileTrial = profileTrialId ? trials.find((t) => t.id === profileTrialId) ?? null : null;
  const profileGuest = profileGuestId ? guests.find((g) => g.id === profileGuestId) ?? null : null;

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

  const trialEvents = useMemo(() => trialsToCalendarEvents(trials, overlays), [trials, overlays]);

  const allEvents = useMemo(() => {
    const byId = new Map<string, CalendarEvent>();
    for (const e of manualEvents) byId.set(e.id, e);
    for (const e of trialEvents) byId.set(e.id, e);
    return [...byId.values()];
  }, [manualEvents, trialEvents]);

  useEffect(() => {
    onCalendarEventsChange?.(manualEvents.filter((e) => e.kind === "appointment"));
  }, [manualEvents, onCalendarEventsChange]);

  const rangeFrom = toDateKey(gridStart);
  const rangeTo = toDateKey(gridEnd);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/mvp/calendar?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as {
        source: "live" | "demo";
        events: CalendarEvent[];
        trialOverlays?: CalendarTrialOverlay[];
      };
      setSource(json.source);
      if (json.source === "live") {
        setManualEvents(json.events ?? []);
        setOverlays(json.trialOverlays ?? []);
      } else {
        setManualEvents(loadDemoCalendarEvents());
        setOverlays(loadDemoOverlays());
      }
    } catch {
      setSource("demo");
      setManualEvents(loadDemoCalendarEvents());
      setOverlays(loadDemoOverlays());
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
                            const showTime =
                              ev.kind === "appointment" || tone === "start" || tone === "single";
                            return (
                              <button
                                key={dayKey}
                                type="button"
                                title={barLabel(ev, Boolean(ev.startTime))}
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
                                {isFirst ? barLabel(ev, showTime) : "\u00a0"}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
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
          trial={
            selected.kind === "active_trial" && selected.personId
              ? trials.find((t) => t.id === selected.personId) ?? null
              : null
          }
          guest={
            selected.personId ? guests.find((g) => g.id === selected.personId) ?? null : null
          }
          todayKey={todayKey}
          deleting={deleting}
          onClose={() => setSelected(null)}
          onDelete={() => void handleDelete(selected)}
          onTrialExtended={(updated) => {
            onTrialsChange?.(sortTrialsByUrgency(trials.map((t) => (t.id === updated.id ? updated : t))));
            setSelected({
              ...selected,
              endDate: updated.trialEndDate.slice(0, 10),
              startDate: updated.trialStartDate
                ? updated.trialStartDate.slice(0, 10)
                : selected.startDate,
            });
          }}
          onEventPatched={(next) => {
            if (next.kind === "active_trial" && next.personId) {
              setOverlays((prev) => {
                const row: CalendarTrialOverlay = {
                  personId: next.personId!,
                  note: next.notes,
                  startTime: next.startTime,
                };
                const merged = [...prev.filter((o) => o.personId !== next.personId), row];
                if (source === "demo") saveDemoOverlays(merged);
                return merged;
              });
            } else {
              setManualEvents((prev) => {
                const merged = prev.map((e) => (e.id === next.id ? next : e));
                if (source === "demo") saveDemoCalendarEvents(merged);
                return merged;
              });
            }
            setSelected(next);
          }}
          onOpenProfile={() => {
            if (selected.kind === "active_trial" && selected.personId) {
              setProfileTrialId(selected.personId);
              setSelected(null);
              return;
            }
            if (selected.personId && guests.some((g) => g.id === selected.personId)) {
              setProfileGuestId(selected.personId);
              setSelected(null);
            }
          }}
        />
      ) : null}

      {profileTrial ? (
        <TrialProfilePanel
          trial={profileTrial}
          onClose={() => setProfileTrialId(null)}
          onTrialUpdate={(t) => {
            onTrialsChange?.(sortTrialsByUrgency(trials.map((x) => (x.id === t.id ? t : x))));
          }}
          onTrialCompleted={(t) => {
            onTrialsChange?.(trials.filter((x) => x.id !== t.id));
            setProfileTrialId(null);
          }}
          onTrialEnrolled={(m) => {
            onTrialsChange?.(trials.filter((x) => x.id !== m.id));
            onMemberEnrolled?.(m);
            setProfileTrialId(null);
          }}
          onTrialMovedToGuest={(g) => {
            onTrialsChange?.(trials.filter((x) => x.id !== g.id));
            onGuestsChange?.([g, ...guests.filter((x) => x.id !== g.id)]);
            setProfileTrialId(null);
          }}
        />
      ) : null}

      {profileGuest ? (
        <GuestProfilePanel
          guest={profileGuest}
          onClose={() => setProfileGuestId(null)}
          onGuestUpdate={(g) => {
            onGuestsChange?.(guests.map((x) => (x.id === g.id ? g : x)));
          }}
          onGuestEnrolled={(m) => {
            onGuestsChange?.(guests.filter((x) => x.id !== m.id));
            onMemberEnrolled?.(m);
            setProfileGuestId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function EventDetailSheet({
  event,
  trial,
  guest,
  todayKey,
  deleting,
  onClose,
  onDelete,
  onTrialExtended,
  onEventPatched,
  onOpenProfile,
}: {
  event: CalendarEvent;
  trial: StaffTrialRow | null;
  guest: StaffGuestRow | null;
  todayKey: string;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
  onTrialExtended: (trial: StaffTrialRow) => void;
  onEventPatched: (event: CalendarEvent) => void;
  onOpenProfile: () => void;
}) {
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendDate, setExtendDate] = useState(event.endDate);
  const [extendSaving, setExtendSaving] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(event.notes ?? "");
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeDraft, setTimeDraft] = useState(event.startTime ?? "");
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const phone = trial?.phone ?? guest?.phone ?? event.personPhone ?? null;
  const canOpenProfile = Boolean(trial || guest);

  useEffect(() => {
    setExtendOpen(false);
    setExtendDate(event.endDate);
    setExtendError(null);
    setNoteOpen(false);
    setNoteDraft(event.notes ?? "");
    setTimeOpen(false);
    setTimeDraft(event.startTime ?? "");
    setMetaError(null);
  }, [event.id, event.endDate, event.notes, event.startTime]);

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

  async function patchMeta(body: Record<string, unknown>) {
    setMetaSaving(true);
    setMetaError(null);
    try {
      const res = await fetch(`/api/mvp/calendar/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setMetaError(json.error ?? "Could not save.");
        return false;
      }
      if (json.overlay) {
        onEventPatched({
          ...event,
          notes: "note" in json.overlay ? json.overlay.note : event.notes,
          startTime:
            "startTime" in json.overlay ? json.overlay.startTime ?? null : event.startTime,
        });
      } else if (json.event) {
        onEventPatched({
          ...event,
          ...json.event,
          notes: json.event.notes !== undefined ? json.event.notes : event.notes,
          startTime: json.event.startTime !== undefined ? json.event.startTime : event.startTime,
        });
      } else {
        onEventPatched({
          ...event,
          notes: "notes" in body ? (body.notes as string | null) : event.notes,
          startTime: body.clearStartTime
            ? null
            : typeof body.startTime === "string"
              ? body.startTime
              : event.startTime,
        });
      }
      return true;
    } catch {
      setMetaError("Something went wrong.");
      return false;
    } finally {
      setMetaSaving(false);
    }
  }

  async function submitExtend(e: FormEvent) {
    e.preventDefault();
    if (!trial) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(extendDate)) {
      setExtendError("Pick a valid end date.");
      return;
    }
    setExtendSaving(true);
    setExtendError(null);
    try {
      const res = await fetch(`/api/mvp/trials/${trial.id}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trialEndDate: extendDate }),
      });
      const json = await res.json();
      if (!res.ok && !json.trial) {
        setExtendError(json.error ?? "Could not extend trial.");
        return;
      }
      const end = (json.trial?.trialEndDate as string) ?? `${extendDate}T23:59:59.999Z`;
      const start = (json.trial?.trialStartDate as string | null) ?? trial.trialStartDate;
      const daysRemaining =
        typeof json.trial?.daysRemaining === "number"
          ? json.trial.daysRemaining
          : Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86400000));
      onTrialExtended({
        ...trial,
        trialEndDate: end,
        trialStartDate: start,
        daysRemaining,
      });
      setExtendOpen(false);
    } catch {
      setExtendError("Something went wrong.");
    } finally {
      setExtendSaving(false);
    }
  }

  const showStartTimeAction = event.kind === "appointment" || event.kind === "active_trial" || event.kind === "scheduled_trial";

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
          {canOpenProfile ? (
            <button
              type="button"
              onClick={onOpenProfile}
              className="mt-1 text-left text-lg font-semibold text-brand-ink underline decoration-brand-red/30 underline-offset-2 hover:decoration-brand-red"
            >
              {event.title}
            </button>
          ) : (
            <h3 className="mt-1 text-lg font-semibold text-brand-ink">{event.title}</h3>
          )}
          {phone ? (
            <a href={`tel:${phone}`} className="mt-1 block text-sm text-brand-muted hover:text-brand-ink">
              {formatPhoneDisplay(phone)}
            </a>
          ) : null}
          <p className="mt-1 text-sm text-brand-muted">
            {range}
            {event.startTime ? ` · ${event.startTime}` : ""}
          </p>
          {event.notes ? (
            <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-brand-ink">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-muted">
                Calendar note
              </span>
              <span className="mt-0.5 block">{event.notes}</span>
            </p>
          ) : null}

          <div className="mt-4 space-y-2">
            {!noteOpen ? (
              <button
                type="button"
                onClick={() => {
                  setNoteDraft(event.notes ?? "");
                  setNoteOpen(true);
                }}
                className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-neutral-50"
              >
                {event.notes ? "Edit calendar note" : "Add calendar note"}
              </button>
            ) : (
              <form
                className="space-y-2 rounded-lg border border-black/10 bg-neutral-50 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void patchMeta({ notes: noteDraft }).then((ok) => {
                    if (ok) setNoteOpen(false);
                  });
                }}
              >
                <p className="text-sm font-semibold text-brand-ink">Calendar note</p>
                <p className="text-[11px] text-brand-muted">Only shows on this calendar event — not on their profile.</p>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={metaSaving}
                    className="flex-1 rounded-lg bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {metaSaving ? "Saving…" : "Save note"}
                  </button>
                  <button type="button" onClick={() => setNoteOpen(false)} className="rounded-lg border border-black/10 px-4 py-2 text-sm">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {showStartTimeAction ? (
              !timeOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setTimeDraft(event.startTime ?? "");
                    setTimeOpen(true);
                  }}
                  className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-neutral-50"
                >
                  {event.startTime ? "Edit start time" : "Add start time"}
                </button>
              ) : (
                <form
                  className="space-y-2 rounded-lg border border-black/10 bg-neutral-50 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void patchMeta(
                      timeDraft
                        ? { startTime: timeDraft }
                        : { clearStartTime: true }
                    ).then((ok) => {
                      if (ok) setTimeOpen(false);
                    });
                  }}
                >
                  <p className="text-sm font-semibold text-brand-ink">Start time</p>
                  <p className="text-[11px] text-brand-muted">Shows next to their name on the calendar bar.</p>
                  <input
                    type="time"
                    value={timeDraft}
                    onChange={(e) => setTimeDraft(e.target.value)}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={metaSaving}
                      className="flex-1 rounded-lg bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {metaSaving ? "Saving…" : "Save time"}
                    </button>
                    <button type="button" onClick={() => setTimeOpen(false)} className="rounded-lg border border-black/10 px-4 py-2 text-sm">
                      Cancel
                    </button>
                  </div>
                </form>
              )
            ) : null}

            {event.kind === "active_trial" && trial ? (
              !extendOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setExtendDate(trial.trialEndDate.slice(0, 10));
                    setExtendError(null);
                    setExtendOpen(true);
                  }}
                  className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-neutral-50"
                >
                  Extend Trial
                </button>
              ) : (
                <form className="space-y-2 rounded-lg border border-black/10 bg-neutral-50 p-3" onSubmit={(e) => void submitExtend(e)}>
                  <p className="text-sm font-semibold text-brand-ink">New trial end date</p>
                  <input
                    type="date"
                    value={extendDate}
                    onChange={(e) => setExtendDate(e.target.value)}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15"
                    required
                  />
                  {extendError ? <p className="text-xs text-red-700">{extendError}</p> : null}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={extendSaving}
                      className="flex-1 rounded-lg bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {extendSaving ? "Saving…" : "Save new end date"}
                    </button>
                    <button type="button" onClick={() => setExtendOpen(false)} className="rounded-lg border border-black/10 px-4 py-2 text-sm">
                      Cancel
                    </button>
                  </div>
                </form>
              )
            ) : null}
          </div>

          {metaError ? <p className="mt-2 text-xs text-red-700">{metaError}</p> : null}

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
