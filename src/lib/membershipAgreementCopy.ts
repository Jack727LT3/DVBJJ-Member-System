/** DVBJJ LLC Membership Plan Agreement (from studio membership form). */

export const MEMBERSHIP_AGREEMENT_TITLE = "DVBJJ LLC – MEMBERSHIP PLAN AGREEMENT";

export const MEMBERSHIP_PLAN_OPTIONS = [
  {
    id: "adult_monthly",
    label: "Adult Membership",
    priceLabel: "$190 / month",
  },
  {
    id: "youth_monthly",
    label: "Youth Membership",
    priceLabel: "$140 / month",
  },
  {
    id: "adult_annual",
    label: "Adult Membership (Annual)",
    priceLabel: "$1,884 / year",
  },
  {
    id: "youth_annual",
    label: "Youth Membership (Annual)",
    priceLabel: "$1,428 / year",
  },
] as const;

export type MembershipPlanId = (typeof MEMBERSHIP_PLAN_OPTIONS)[number]["id"];

/** Suggested monthly rate for staff enrollment when a plan was chosen at the kiosk. */
export function suggestedMonthlyPaymentForPlan(planId: string): number | null {
  switch (planId) {
    case "adult_monthly":
      return 190;
    case "youth_monthly":
      return 140;
    case "adult_annual":
      return 157;
    case "youth_annual":
      return 119;
    default:
      return null;
  }
}

export const MEMBERSHIP_DISCOUNT_NOTE =
  "Ask about our discounts for military, teachers, and college students!";

export const MEMBERSHIP_REGISTRATION_FEE = "$200.00";
export const MEMBERSHIP_REGISTRATION_NOTE = "(Includes GI Uniform – nonrefundable)";

export const MEMBERSHIP_BILLING_HEADING = "Billing Terms";

export const MEMBERSHIP_BILLING_SECTIONS: { title: string; bullets: string[] }[] = [
  {
    title: "1. Monthly Membership",
    bullets: [
      "For Monthly subscriptions, the corresponding amount will be automatically charged every 30 days from the initial enrollment date.",
      "The membership will renew automatically every 30 days, based on the original subscription date, not the calendar month.",
      "Payments will be processed on the same day each month, matching the date of the original subscription.",
      "Providing at least 14 days' notice will cancel monthly renewals before the renewal date.",
    ],
  },
  {
    title: "2. Incomplete Payments",
    bullets: [
      "Incomplete payments must be made in full at the time they are due.",
      "Failure to complete such scheduled payments may result in interruption of training privileges until the account is resolved.",
      "Members will have up to 7 days to regularize incomplete payments.",
      "If not resolved within that period, membership may be paused or canceled at the academy's discretion.",
    ],
  },
];

export const MEMBERSHIP_ACKNOWLEDGEMENT =
  "By signing below, I confirm that I understand and agree to the membership plan outlined above and acknowledge the one-time registration fee.";
