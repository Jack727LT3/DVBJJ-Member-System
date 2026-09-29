import { describe, expect, it } from "vitest";
import { buildStaffNotifications } from "./staffNotifications";
import type { StaffDashboard } from "./staffDashboard";

const today = new Date("2026-05-21T12:00:00.000Z");

function minimalData(
  overrides: Partial<Pick<StaffDashboard, "members" | "trials">> = {}
): Pick<StaffDashboard, "members" | "trials"> {
  return {
    members: overrides.members ?? [],
    trials: overrides.trials ?? [],
  };
}

describe("buildStaffNotifications", () => {
  it("includes birthday, delinquent payment, and expired trial", () => {
    const notifications = buildStaffNotifications(
      minimalData({
        members: [
          {
            id: "m1",
            firstName: "Alex",
            lastName: "Rivera",
            phone: "7275550100",
            email: null,
            joinDate: "2025-01-01",
            lastVisit: null,
            totalVisits: 1,
            memberState: "delinquent",
            beltColor: null,
            monthlyPayment: 109,
            ageGroup: "adult",
            dateOfBirth: "1990-05-21",
            parents: [],
            notes: [],
            staffFlagType: null,
            staffFlagOther: null,
          },
        ],
        trials: [
          {
            id: "t1",
            firstName: "Dana",
            lastName: "Castillo",
            phone: "7275550200",
            email: null,
            trialStartDate: null,
            trialEndDate: "2026-05-18",
            daysRemaining: -3,
            dateOfBirth: null,
            parents: [],
            notes: [],
          },
        ],
      }),
      today
    );

    expect(notifications).toHaveLength(3);
    expect(notifications.map((n) => n.kind)).toEqual(["trial_ended", "payment_failed", "birthday"]);
  });

  it("flags trial start, midway, ending, and appointments", () => {
    const notifications = buildStaffNotifications(
      {
        members: [],
        trials: [
          {
            id: "t-start",
            firstName: "Sam",
            lastName: "Lee",
            phone: "7275550201",
            email: null,
            trialStartDate: "2026-05-21T15:00:00.000Z",
            trialEndDate: "2026-05-28",
            daysRemaining: 6,
            dateOfBirth: null,
            parents: [],
            notes: [],
          },
          {
            id: "t-mid",
            firstName: "Mid",
            lastName: "Way",
            phone: "7275550202",
            email: null,
            trialStartDate: "2026-05-18T12:00:00.000Z",
            trialEndDate: "2026-05-25",
            daysRemaining: 3,
            dateOfBirth: null,
            parents: [],
            notes: [],
          },
          {
            id: "t-end",
            firstName: "Last",
            lastName: "Day",
            phone: "7275550203",
            email: null,
            trialStartDate: "2026-05-14T12:00:00.000Z",
            trialEndDate: "2026-05-21",
            daysRemaining: 0,
            dateOfBirth: null,
            parents: [],
            notes: [],
          },
        ],
        calendarEvents: [
          {
            id: "a1",
            kind: "appointment",
            title: "Tour",
            notes: null,
            personId: null,
            startDate: "2026-05-21",
            endDate: "2026-05-21",
            startTime: "17:00",
          },
          {
            id: "a2",
            kind: "appointment",
            title: "Guest",
            notes: null,
            personId: null,
            startDate: "2026-05-22",
            endDate: "2026-05-22",
            startTime: null,
          },
        ],
      },
      today
    );

    expect(notifications.map((n) => n.kind).sort()).toEqual(
      [
        "appointment_today",
        "appointment_tomorrow",
        "trial_ending",
        "trial_midway",
        "trial_started",
      ].sort()
    );
  });

  it("ignores active members and quiet trials", () => {
    const notifications = buildStaffNotifications(
      minimalData({
        members: [
          {
            id: "m2",
            firstName: "Pat",
            lastName: "Morgan",
            phone: "7275553302",
            email: null,
            joinDate: "2025-01-01",
            lastVisit: null,
            totalVisits: 1,
            memberState: "active",
            beltColor: null,
            monthlyPayment: 109,
            ageGroup: "adult",
            dateOfBirth: "1990-06-15",
            parents: [],
            notes: [],
            staffFlagType: null,
            staffFlagOther: null,
          },
        ],
        trials: [
          {
            id: "t2",
            firstName: "Sam",
            lastName: "Lee",
            phone: "7275550201",
            email: null,
            trialStartDate: "2026-05-19T12:00:00.000Z",
            trialEndDate: "2026-05-26",
            daysRemaining: 5,
            dateOfBirth: null,
            parents: [],
            notes: [],
          },
        ],
      }),
      today
    );

    expect(notifications).toHaveLength(0);
  });
});
