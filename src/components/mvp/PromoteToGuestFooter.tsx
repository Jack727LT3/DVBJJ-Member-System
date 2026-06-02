"use client";

import { useState } from "react";
import { fullName } from "@/lib/mvpShared";
import type { OutOfStoreLead } from "@/lib/outOfStoreLeads";
import type { StaffGuestRow } from "@/lib/staffDashboard";

type PromoteToGuestFooterProps = {
  lead: OutOfStoreLead;
  onPromoted: (guest: StaffGuestRow) => void;
};

export default function PromoteToGuestFooter({ lead, onPromoted }: PromoteToGuestFooterProps) {
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  async function promoteToGuest() {
    if (
      !confirm(
        `Move ${fullName(lead.firstName, lead.lastName)} to Guests? They can check in at the kiosk — first visit starts their trial.`
      )
    ) {
      return;
    }
    setPromoteError(null);
    setPromoting(true);
    try {
      const res = await fetch(`/api/mvp/out-of-store-leads/${lead.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: lead.firstName,
          lastName: lead.lastName,
          phone: lead.phone,
          email: lead.email,
          createdAt: lead.createdAt,
        }),
      });
      const json = await res.json();
      if (!res.ok && !json.ok) {
        setPromoteError(json.error ?? "Could not move lead.");
        return;
      }
      const guest: StaffGuestRow = json.guest ?? {
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: lead.phone,
        email: lead.email,
        createdAt: lead.createdAt,
        lastVisit: null,
        totalVisits: 0,
        dateOfBirth: null,
        ageGroup: "adult",
        completedTrial: false,
        parents: [],
        notes: [],
      };
      onPromoted(guest);
    } catch {
      setPromoteError("Something went wrong.");
    } finally {
      setPromoting(false);
    }
  }

  return (
    <>
      <h3 className="text-sm font-semibold text-brand-ink">Move to guests</h3>
      <p className="mt-1 text-sm text-brand-muted">
        They will leave Out-Of-Gym Leads and appear under Guests until their first kiosk visit starts a trial.
      </p>
      {promoteError ? <p className="mt-2 text-sm text-red-700">{promoteError}</p> : null}
      <button
        type="button"
        onClick={() => void promoteToGuest()}
        disabled={promoting}
        className="mt-3 w-full rounded-lg bg-brand-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:opacity-55"
      >
        {promoting ? "Moving…" : "Move to guest"}
      </button>
    </>
  );
}
