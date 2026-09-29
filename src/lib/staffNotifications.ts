import { fullName } from "./mvpShared";
import { toDateKey, type CalendarEvent } from "./staffCalendar";
import type { StaffDashboard, StaffMemberRow, StaffTrialRow } from "./staffDashboard";

function isTrialExpired(trial: StaffTrialRow) {
  return trial.daysRemaining < 0;
}

export type StaffNotificationKind =
  | "birthday"
  | "payment_failed"
  | "trial_ended"
  | "trial_started"
  | "trial_midway"
  | "trial_ending"
  | "appointment_tomorrow"
  | "appointment_today";

export type StaffNotification = {
  id: string;
  kind: StaffNotificationKind;
  title: string;
  subtitle: string;
  personId: string;
};

function isBirthdayToday(dateOfBirth: string | null, today = new Date()): boolean {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  const [, month, day] = dateOfBirth.split("-");
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return month === m && day === d;
}

function birthdayNotification(member: StaffMemberRow): StaffNotification {
  const name = fullName(member.firstName, member.lastName);
  return {
    id: `birthday-${member.id}`,
    kind: "birthday",
    title: `${name}'s birthday`,
    subtitle: "Wish them a happy birthday today",
    personId: member.id,
  };
}

function paymentFailedNotification(member: StaffMemberRow): StaffNotification {
  const name = fullName(member.firstName, member.lastName);
  return {
    id: `payment-${member.id}`,
    kind: "payment_failed",
    title: `${name} — payment failed`,
    subtitle: "Billing issue not resolved — follow up at the desk",
    personId: member.id,
  };
}

function trialEndedNotification(trial: StaffTrialRow): StaffNotification {
  const name = fullName(trial.firstName, trial.lastName);
  const days = Math.abs(trial.daysRemaining);
  const ago = days === 1 ? "1 day ago" : `${days} days ago`;
  return {
    id: `trial-ended-${trial.id}`,
    kind: "trial_ended",
    title: `${name} — trial ended`,
    subtitle: `Expired ${ago} — contact to move to Guests`,
    personId: trial.id,
  };
}

function trialStartedNotification(trial: StaffTrialRow): StaffNotification {
  const name = fullName(trial.firstName, trial.lastName);
  return {
    id: `trial-started-${trial.id}-${toDateKey(new Date())}`,
    kind: "trial_started",
    title: `${name} — trial started`,
    subtitle: "First day of their trial — welcome them in",
    personId: trial.id,
  };
}

function trialMidwayNotification(trial: StaffTrialRow): StaffNotification {
  const name = fullName(trial.firstName, trial.lastName);
  return {
    id: `trial-mid-${trial.id}`,
    kind: "trial_midway",
    title: `${name} — trial midway`,
    subtitle: "Check in on how their trial is going",
    personId: trial.id,
  };
}

function trialEndingNotification(trial: StaffTrialRow): StaffNotification {
  const name = fullName(trial.firstName, trial.lastName);
  return {
    id: `trial-ending-${trial.id}`,
    kind: "trial_ending",
    title: `${name} — trial ends today`,
    subtitle: "Last day — follow up about membership",
    personId: trial.id,
  };
}

function appointmentNotification(
  event: CalendarEvent,
  kind: "appointment_today" | "appointment_tomorrow"
): StaffNotification {
  const when = kind === "appointment_today" ? "today" : "tomorrow";
  return {
    id: `appt-${kind}-${event.id}`,
    kind,
    title: `${event.title} — ${when}`,
    subtitle:
      kind === "appointment_today"
        ? "Appointment is today"
        : "Appointment is tomorrow — confirm if needed",
    personId: event.personId ?? event.id,
  };
}

/** Unresolved failed payment = member flagged delinquent. */
export function memberHasUnresolvedPaymentFailure(member: StaffMemberRow): boolean {
  return member.memberState === "delinquent";
}

export function buildStaffNotifications(
  data: Pick<StaffDashboard, "members" | "trials"> & { calendarEvents?: CalendarEvent[] },
  today = new Date()
): StaffNotification[] {
  const items: StaffNotification[] = [];
  const todayKey = toDateKey(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  for (const member of data.members) {
    if (isBirthdayToday(member.dateOfBirth, today)) {
      items.push(birthdayNotification(member));
    }
    if (memberHasUnresolvedPaymentFailure(member)) {
      items.push(paymentFailedNotification(member));
    }
  }

  for (const trial of data.trials) {
    if (isTrialExpired(trial)) {
      items.push(trialEndedNotification(trial));
      continue;
    }
    const startKey = trial.trialStartDate ? toDateKey(trial.trialStartDate) : null;
    const endKey = toDateKey(trial.trialEndDate);

    if (startKey === todayKey) {
      items.push(trialStartedNotification(trial));
    }
    // Midway: ~halfway through a 7-day trial (3 days remaining, not start/end day)
    if (trial.daysRemaining === 3 && startKey !== todayKey && endKey !== todayKey) {
      items.push(trialMidwayNotification(trial));
    }
    if (trial.daysRemaining === 0 || endKey === todayKey) {
      items.push(trialEndingNotification(trial));
    }
  }

  for (const event of data.calendarEvents ?? []) {
    if (event.kind !== "appointment") continue;
    if (event.startDate === todayKey) {
      items.push(appointmentNotification(event, "appointment_today"));
    } else if (event.startDate === tomorrowKey) {
      items.push(appointmentNotification(event, "appointment_tomorrow"));
    }
  }

  const kindOrder: Record<StaffNotificationKind, number> = {
    trial_ending: 0,
    trial_ended: 1,
    appointment_today: 2,
    trial_started: 3,
    appointment_tomorrow: 4,
    trial_midway: 5,
    payment_failed: 6,
    birthday: 7,
  };

  return items.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.title.localeCompare(b.title));
}
