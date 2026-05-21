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
            notes: [],
          },
        ],
      }),
      today
    );

    expect(notifications).toHaveLength(3);
    expect(notifications.map((n) => n.kind)).toEqual(["trial_ended", "payment_failed", "birthday"]);
  });

  it("ignores active members and active trials", () => {
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
          },
        ],
        trials: [
          {
            id: "t2",
            firstName: "Sam",
            lastName: "Lee",
            phone: "7275550201",
            email: null,
            trialStartDate: null,
            trialEndDate: "2026-05-28",
            daysRemaining: 7,
            notes: [],
          },
        ],
      }),
      today
    );

    expect(notifications).toHaveLength(0);
  });
});
