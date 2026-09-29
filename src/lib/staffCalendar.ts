import { addDays, eachDayOfInterval, format, parseISO, startOfDay } from "date-fns";
import type { StaffTrialRow } from "@/lib/staffDashboard";

export type CalendarEventKind = "appointment" | "scheduled_trial" | "active_trial";

export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  notes: string | null;
  personId: string | null;
  personFirstName?: string | null;
  personLastName?: string | null;
  personPhone?: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  /** HH:mm (24h) for display on first day / appointments */
  startTime: string | null;
  createdAt?: string;
};

export type CalendarTrialOverlay = {
  personId: string;
  note: string | null;
  startTime: string | null;
};

export type DaySegmentTone = "start" | "middle" | "end" | "single" | "scheduled" | "appointment";

const DEMO_STORAGE_KEY = "dvbjj-calendar-events";
const DEMO_OVERLAY_KEY = "dvbjj-calendar-trial-overlays";

export function toDateKey(d: Date | string): string {
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    return format(parseISO(d), "yyyy-MM-dd");
  }
  return format(d, "yyyy-MM-dd");
}

export function parseDateKey(key: string): Date {
  return startOfDay(parseISO(key.slice(0, 10)));
}

/** Normalize DB time / ISO / HH:mm to HH:mm */
export function normalizeTimeValue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
  try {
    return format(parseISO(s), "HH:mm");
  } catch {
    return null;
  }
}

/** Compact display like 4:30p */
export function formatCalendarTime(time: string | null | undefined): string | null {
  const hm = normalizeTimeValue(time);
  if (!hm) return null;
  const [hStr, mStr] = hm.split(":");
  let h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const suffix = h >= 12 ? "p" : "a";
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${suffix}` : `${h}:${String(m).padStart(2, "0")}${suffix}`;
}

export function timeFromIsoTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return null;
    // Ignore pure midnight placeholders (date-only casts)
    if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) return null;
    return format(d, "HH:mm");
  } catch {
    return null;
  }
}

export function trialEndDateKey(trial: StaffTrialRow): string {
  return toDateKey(trial.trialEndDate);
}

export function trialStartDateKey(trial: StaffTrialRow): string {
  if (trial.trialStartDate) return toDateKey(trial.trialStartDate);
  return toDateKey(addDays(parseDateKey(trialEndDateKey(trial)), -6));
}

export function trialsToCalendarEvents(
  trials: StaffTrialRow[],
  overlays: CalendarTrialOverlay[] = []
): CalendarEvent[] {
  const byPerson = new Map(overlays.map((o) => [o.personId, o]));
  return trials.map((t) => {
    const overlay = byPerson.get(t.id);
    return {
      id: `trial-${t.id}`,
      kind: "active_trial" as const,
      title: `${t.firstName} ${t.lastName}`.trim(),
      notes: overlay?.note ?? null,
      personId: t.id,
      personFirstName: t.firstName,
      personLastName: t.lastName,
      personPhone: t.phone,
      startDate: trialStartDateKey(t),
      endDate: trialEndDateKey(t),
      startTime: overlay?.startTime ?? timeFromIsoTimestamp(t.trialStartDate) ?? null,
    };
  });
}

export function segmentToneForDay(event: CalendarEvent, dayKey: string, todayKey: string): DaySegmentTone {
  if (event.kind === "appointment") return "appointment";
  if (event.kind === "scheduled_trial" && event.startDate > todayKey) {
    return "scheduled";
  }
  if (event.startDate === event.endDate) return "single";
  if (dayKey === event.startDate) return "start";
  if (dayKey === event.endDate) return "end";
  return "middle";
}

export function segmentClass(tone: DaySegmentTone): string {
  switch (tone) {
    case "start":
    case "single":
      return "bg-emerald-500 text-white";
    case "end":
      return "bg-brand-red text-white";
    case "scheduled":
      return "bg-neutral-300 text-brand-ink";
    case "appointment":
      return "bg-sky-500 text-white";
    case "middle":
    default:
      return "bg-violet-500 text-white";
  }
}

export function eventCoversDay(event: CalendarEvent, dayKey: string): boolean {
  return event.startDate <= dayKey && event.endDate >= dayKey;
}

export function eventsForDay(events: CalendarEvent[], dayKey: string): CalendarEvent[] {
  return events.filter((e) => eventCoversDay(e, dayKey));
}

function lanePriority(kind: CalendarEvent["kind"]): number {
  if (kind === "appointment") return 0;
  if (kind === "scheduled_trial") return 1;
  return 2;
}

export function assignEventLanes(events: CalendarEvent[]): Map<string, number> {
  const sorted = [...events].sort((a, b) => {
    const p = lanePriority(a.kind) - lanePriority(b.kind);
    if (p !== 0) return p;
    if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
    return a.endDate.localeCompare(b.endDate);
  });
  const laneEnd: string[] = [];
  const lanes = new Map<string, number>();
  for (const ev of sorted) {
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane]! >= ev.startDate) lane += 1;
    laneEnd[lane] = ev.endDate;
    lanes.set(ev.id, lane);
  }
  return lanes;
}

export function loadDemoCalendarEvents(): CalendarEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return defaultDemoEvents();
    const parsed = JSON.parse(raw) as CalendarEvent[];
    return Array.isArray(parsed)
      ? parsed.map((e) => ({ ...e, startTime: e.startTime ?? null }))
      : defaultDemoEvents();
  } catch {
    return defaultDemoEvents();
  }
}

export function saveDemoCalendarEvents(events: CalendarEvent[]) {
  if (typeof window === "undefined") return;
  const onlyManual = events.filter((e) => e.kind !== "active_trial");
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(onlyManual));
}

export function loadDemoOverlays(): CalendarTrialOverlay[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_OVERLAY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CalendarTrialOverlay[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDemoOverlays(overlays: CalendarTrialOverlay[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEMO_OVERLAY_KEY, JSON.stringify(overlays));
}

function defaultDemoEvents(): CalendarEvent[] {
  const today = startOfDay(new Date());
  const futureStart = toDateKey(addDays(today, 5));
  return [
    {
      id: "demo-appt-1",
      kind: "appointment",
      title: "Guest tour — Sam",
      notes: "Walkthrough at 5pm",
      personId: null,
      startDate: toDateKey(addDays(today, 2)),
      endDate: toDateKey(addDays(today, 2)),
      startTime: "17:00",
    },
    {
      id: "demo-sched-1",
      kind: "scheduled_trial",
      title: "Alex Rivera",
      notes: "Future trial from out-of-gym lead",
      personId: null,
      startDate: futureStart,
      endDate: toDateKey(addDays(today, 11)),
      startTime: null,
    },
  ];
}

export function mapRpcCalendarEvent(raw: {
  id: string;
  kind: string;
  title: string;
  notes: string | null;
  person_id: string | null;
  person_first_name?: string | null;
  person_last_name?: string | null;
  person_phone?: string | null;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  created_at?: string;
}): CalendarEvent {
  return {
    id: raw.id,
    kind: raw.kind === "scheduled_trial" ? "scheduled_trial" : "appointment",
    title: raw.title,
    notes: raw.notes,
    personId: raw.person_id,
    personFirstName: raw.person_first_name,
    personLastName: raw.person_last_name,
    personPhone: raw.person_phone ?? null,
    startDate: toDateKey(raw.start_date),
    endDate: toDateKey(raw.end_date),
    startTime: normalizeTimeValue(raw.start_time ?? null),
    createdAt: raw.created_at,
  };
}

export function mapRpcOverlay(raw: {
  person_id: string;
  note: string | null;
  start_time: string | null;
}): CalendarTrialOverlay {
  return {
    personId: raw.person_id,
    note: raw.note,
    startTime: normalizeTimeValue(raw.start_time),
  };
}

export function daysInSpan(startKey: string, endKey: string): Date[] {
  return eachDayOfInterval({ start: parseDateKey(startKey), end: parseDateKey(endKey) });
}

export function barLabel(event: CalendarEvent, showTime: boolean): string {
  const time = showTime ? formatCalendarTime(event.startTime) : null;
  return time ? `${event.title} · ${time}` : event.title;
}
