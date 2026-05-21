import { fullName } from "./mvpShared";
import type { StaffDashboard, StaffMemberRow, StaffTrialRow } from "./staffDashboard";

function isTrialExpired(trial: StaffTrialRow) {
  return trial.daysRemaining < 0;
}

export type StaffNotificationKind = "birthday" | "payment_failed" | "trial_ended";

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
    id: `trial-${trial.id}`,
    kind: "trial_ended",
    title: `${name} — trial ended`,
    subtitle: `Expired ${ago} — contact to move to Guests`,
    personId: trial.id,
  };
}

/** Unresolved failed payment = member flagged delinquent. */
export function memberHasUnresolvedPaymentFailure(member: StaffMemberRow): boolean {
  return member.memberState === "delinquent";
}

export function buildStaffNotifications(
  data: Pick<StaffDashboard, "members" | "trials">,
  today = new Date()
): StaffNotification[] {
  const items: StaffNotification[] = [];

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
    }
  }

  const kindOrder: Record<StaffNotificationKind, number> = {
    trial_ended: 0,
    payment_failed: 1,
    birthday: 2,
  };

  return items.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.title.localeCompare(b.title));
}
