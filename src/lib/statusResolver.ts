export type PersonStatus = "lead" | "trial" | "guest" | "member";
export type MemberState = "active" | "delinquent" | "frozen" | "canceled" | null;

export type PersonRowForMessaging = {
  id: string;
  first_name: string;
  last_name: string;
  status: PersonStatus;
  member_state: MemberState;
  trial_end_date: string | null;
  last_check_in: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function safeName(firstName: string, lastName: string): string {
  const first = (firstName || "").trim();
  const last = (lastName || "").trim();
  return [first, last].filter(Boolean).join(" ").trim() || "Member";
}

export function getEffectiveStatusForMessaging(
  person: PersonRowForMessaging,
  now: Date
): {
  status: PersonStatus;
  member_state: MemberState;
  daysLeft?: number;
  daysAgo?: number;
} {
  const trialEndMs = toMs(person.trial_end_date);

  // "On access" rule: expired trials behave as guests.
  if (person.status === "trial" && trialEndMs !== null && trialEndMs <= now.getTime()) {
    return { status: "guest", member_state: null };
  }

  if (person.status === "trial") {
    const daysLeft = trialEndMs === null ? 0 : Math.max(0, Math.ceil((trialEndMs - now.getTime()) / MS_PER_DAY));
    return { status: "trial", member_state: null, daysLeft };
  }

  if (person.status === "member") {
    const lastCheckInMs = toMs(person.last_check_in);
    const daysAgo =
      lastCheckInMs === null ? undefined : Math.max(0, Math.floor((now.getTime() - lastCheckInMs) / MS_PER_DAY));
    return { status: "member", member_state: person.member_state, daysAgo };
  }

  return { status: person.status, member_state: null };
}

export function buildKioskLeadFirstVisitMessage(person: PersonRowForMessaging): { title: string; body: string } {
  // Parameter is intentionally unused for now (MVP message is static).
  void person;
  return {
    title: "Welcome to your first class!",
    body: `Please complete liability & code of conduct forms`,
  };
}

export function buildKioskMessage(
  person: PersonRowForMessaging,
  now: Date
): { title: string; body: string; daysLeft?: number } {
  const effective = getEffectiveStatusForMessaging(person, now);
  const name = safeName(person.first_name, person.last_name);

  if (effective.status === "member") {
    if (effective.member_state === "delinquent") {
      return { title: "Please see front desk", body: "" };
    }

    // Treat any non-delinquent non-active member_state as "please see front desk" to be safe.
    if (effective.member_state !== "active" && effective.member_state !== null) {
      return { title: "Please see front desk", body: "" };
    }

    const daysAgo = effective.daysAgo;
    const lastVisitText = daysAgo === undefined ? "First visit" : `Last visit: ${daysAgo} days ago`;
    return { title: `Welcome back, ${name}`, body: lastVisitText };
  }

  if (effective.status === "trial") {
    return {
      title: "Welcome!",
      body: `You have ${effective.daysLeft ?? 0} days left in your trial`,
      daysLeft: effective.daysLeft ?? 0,
    };
  }

  if (effective.status === "guest") {
    return { title: "Welcome!", body: "Please check in with front desk" };
  }

  // lead for messaging is handled separately for "lead first visit".
  return { title: "Welcome!", body: "Please check in with front desk" };
}

