import { describe, expect, it } from "vitest";
import {
  buildKioskLeadFirstVisitMessage,
  buildKioskMessage,
  getEffectiveStatusForMessaging,
  KIOSK_MEMBERSHIP_ATTENTION_BODY,
  KIOSK_MEMBERSHIP_ATTENTION_TITLE,
  type PersonRowForMessaging,
} from "./statusResolver";

describe("statusResolver", () => {
  it("treats expired trials as guests (on access)", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    const person: PersonRowForMessaging = {
      id: "1",
      first_name: "John",
      last_name: "Doe",
      status: "trial",
      member_state: null,
      trial_end_date: new Date("2026-01-01T23:59:59.000Z").toISOString(),
      last_check_in: null,
    };

    const eff = getEffectiveStatusForMessaging(person, now);
    expect(eff.status).toBe("guest");
  });

  it("computes days left for active trials", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const trialEnd = new Date(now.getTime() + 2.1 * 24 * 60 * 60 * 1000);
    const person: PersonRowForMessaging = {
      id: "1",
      first_name: "Jane",
      last_name: "Smith",
      status: "trial",
      member_state: null,
      trial_end_date: trialEnd.toISOString(),
      last_check_in: null,
    };

    const eff = getEffectiveStatusForMessaging(person, now);
    expect(eff.status).toBe("trial");
    expect(eff.daysLeft).toBe(3);
  });

  it("shows front-desk message for billing-flagged members (DB: delinquent)", () => {
    const now = new Date();
    const person: PersonRowForMessaging = {
      id: "1",
      first_name: "Alex",
      last_name: "Rossi",
      status: "member",
      member_state: "delinquent",
      trial_end_date: null,
      last_check_in: now.toISOString(),
    };

    const msg = buildKioskMessage(person, now);
    expect(msg.title).toBe(KIOSK_MEMBERSHIP_ATTENTION_TITLE);
    expect(msg.body).toBe(KIOSK_MEMBERSHIP_ATTENTION_BODY);
  });

  it("shows same front-desk message for frozen members", () => {
    const now = new Date();
    const person: PersonRowForMessaging = {
      id: "1",
      first_name: "Alex",
      last_name: "Rossi",
      status: "member",
      member_state: "frozen",
      trial_end_date: null,
      last_check_in: now.toISOString(),
    };

    const msg = buildKioskMessage(person, now);
    expect(msg.title).toBe(KIOSK_MEMBERSHIP_ATTENTION_TITLE);
    expect(msg.body).toBe(KIOSK_MEMBERSHIP_ATTENTION_BODY);
  });

  it("shows last visit days ago for active members", () => {
    const now = new Date("2026-01-08T00:00:00.000Z");
    const lastVisit = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const person: PersonRowForMessaging = {
      id: "1",
      first_name: "Taylor",
      last_name: "Lee",
      status: "member",
      member_state: "active",
      trial_end_date: null,
      last_check_in: lastVisit.toISOString(),
    };

    const msg = buildKioskMessage(person, now);
    expect(msg.title).toContain("Welcome back");
    expect(msg.body).toBe("Last visit: 5 days ago");
  });

  it("lead first visit message is static", () => {
    const person: PersonRowForMessaging = {
      id: "1",
      first_name: "Sam",
      last_name: "Patel",
      status: "lead",
      member_state: null,
      trial_end_date: null,
      last_check_in: null,
    };

    const msg = buildKioskLeadFirstVisitMessage(person);
    expect(msg.title).toBe("Welcome to your first class!");
    expect(msg.body).toContain("liability");
  });
});

