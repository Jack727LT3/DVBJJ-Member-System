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
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  createdAt?: string;
};

export type DaySegmentTone = "start" | "middle" | "end" | "single" | "scheduled" | "appointment";

const DEMO_STORAGE_KEY = "dvbjj-calendar-events";

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

export function trialEndDateKey(trial: StaffTrialRow): string {
  return toDateKey(trial.trialEndDate);
}

export function trialStartDateKey(trial: StaffTrialRow): string {
  if (trial.trialStartDate) return toDateKey(trial.trialStartDate);
  // Fall back: end minus 6 days for a 7-day trial window
  return toDateKey(addDays(parseDateKey(trialEndDateKey(trial)), -6));
}

export function trialsToCalendarEvents(trials: StaffTrialRow[]): CalendarEvent[] {
  return trials.map((t) => ({
    id: `trial-${t.id}`,
    kind: "active_trial" as const,
    title: `${t.firstName} ${t.lastName}`.trim(),
    notes: null,
    personId: t.id,
    personFirstName: t.firstName,
    personLastName: t.lastName,
    startDate: trialStartDateKey(t),
    endDate: trialEndDateKey(t),
  }));
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
  // Lower = rendered nearer the top (appointments / scheduled first so they aren't buried).
  if (kind === "appointment") return 0;
  if (kind === "scheduled_trial") return 1;
  return 2;
}

/** Assign vertical lanes so overlapping events don't stack on top of each other within a week. */
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
    return Array.isArray(parsed) ? parsed : defaultDemoEvents();
  } catch {
    return defaultDemoEvents();
  }
}

export function saveDemoCalendarEvents(events: CalendarEvent[]) {
  if (typeof window === "undefined") return;
  const onlyManual = events.filter((e) => e.kind !== "active_trial");
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(onlyManual));
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
    },
    {
      id: "demo-sched-1",
      kind: "scheduled_trial",
      title: "Alex Rivera",
      notes: "Future trial from out-of-gym lead",
      personId: null,
      startDate: futureStart,
      endDate: toDateKey(addDays(today, 11)),
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
  start_date: string;
  end_date: string;
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
    startDate: toDateKey(raw.start_date),
    endDate: toDateKey(raw.end_date),
    createdAt: raw.created_at,
  };
}

export function daysInSpan(startKey: string, endKey: string): Date[] {
  return eachDayOfInterval({ start: parseDateKey(startKey), end: parseDateKey(endKey) });
}
