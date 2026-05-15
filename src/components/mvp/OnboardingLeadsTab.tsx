"use client";

import { useMemo, useState } from "react";
import CollapsibleSection from "@/components/mvp/CollapsibleSection";
import OutOfStoreLeadsTab from "@/components/mvp/OutOfStoreLeadsTab";
import GuestProfilePanel from "@/components/mvp/GuestProfilePanel";
import TrialProfilePanel from "@/components/mvp/TrialProfilePanel";
import { formatDate, formatTrialDaysLeft, formatWhen, fullName } from "@/lib/mvpShared";
import {
  isTrialExpired,
  sortTrialsByUrgency,
  type StaffDashboard,
  type StaffMemberRow,
  type StaffTrialRow,
} from "@/lib/staffDashboard";

const LIST_LIMIT = 15;

type SectionKey = "trials" | "outOfStore" | "guests" | "inGym";

type OnboardingLeadsTabProps = {
  data: StaffDashboard;
  onMemberEnrolled?: (member: StaffMemberRow) => void;
};

export default function OnboardingLeadsTab({ data, onMemberEnrolled }: OnboardingLeadsTabProps) {
  const [trials, setTrials] = useState(() => sortTrialsByUrgency(data.trials));
  const [guests, setGuests] = useState(data.guests);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    trials: true,
    outOfStore: false,
    guests: false,
    inGym: false,
  });
  const [selectedTrialId, setSelectedTrialId] = useState<string | null>(null);
  const [contactTrialId, setContactTrialId] = useState<string | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);

  const trialsShown = useMemo(() => trials.slice(0, LIST_LIMIT), [trials]);
  const guestsShown = guests.slice(0, LIST_LIMIT);
  const leadsShown = data.leads.slice(0, LIST_LIMIT);

  const selectedTrial = trials.find((t) => t.id === selectedTrialId) ?? null;
  const selectedGuest = guests.find((g) => g.id === selectedGuestId) ?? null;
  const contactMode = Boolean(selectedTrial && contactTrialId === selectedTrial.id);

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  function openTrialProfile(trial: StaffTrialRow, asContact: boolean) {
    setSelectedTrialId(trial.id);
    setContactTrialId(asContact ? trial.id : null);
  }

  function handleTrialCompleted(trial: StaffTrialRow) {
    setTrials((prev) => prev.filter((t) => t.id !== trial.id));
    setGuests((prev) => [
      {
        id: trial.id,
        firstName: trial.firstName,
        lastName: trial.lastName,
        phone: trial.phone,
        email: trial.email,
        createdAt: new Date().toISOString(),
        lastVisit: null,
        completedTrial: true,
        notes: trial.notes,
      },
      ...prev,
    ]);
    setSelectedTrialId(null);
    setContactTrialId(null);
    setOpenSections((prev) => ({ ...prev, guests: true }));
  }

  function handleGuestEnrolled(member: StaffMemberRow) {
    setGuests((prev) => prev.filter((g) => g.id !== member.id));
    setSelectedGuestId(null);
    onMemberEnrolled?.(member);
  }

  return (
    <div className="w-full space-y-6">
      <p className="text-sm text-brand-muted">
        Customer acquisition and follow-up — trials, leads, and guests on the path to membership.
      </p>

      <CollapsibleSection
        title="Trial Members"
        subtitle="Sorted by urgency — expired trials first, then days remaining. Contact expired trials to move them to Guests."
        count={trials.length}
        open={openSections.trials}
        onToggle={() => toggleSection("trials")}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-brand-muted">
              <tr>
                <th className="px-4 py-3 sm:px-6">Name</th>
                <th className="px-4 py-3">Days Left</th>
                <th className="px-4 py-3">Trial Ends</th>
                <th className="w-24 px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {trialsShown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-brand-muted">
                    No active trials.
                  </td>
                </tr>
              ) : (
                trialsShown.map((t) => {
                  const expired = isTrialExpired(t);
                  return (
                    <tr
                      key={t.id}
                      className="cursor-pointer align-top hover:bg-brand-red/[0.04] active:bg-brand-red/[0.07]"
                      onClick={() => openTrialProfile(t, false)}
                    >
                      <td className="px-4 py-3 font-medium sm:px-6">
                        <span className="underline decoration-brand-red/25 decoration-dotted underline-offset-2">
                          {fullName(t.firstName, t.lastName)}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 font-semibold tabular-nums ${
                          expired || t.daysRemaining <= 3 ? "text-brand-red" : "text-brand-ink"
                        }`}
                      >
                        {formatTrialDaysLeft(t.daysRemaining)}
                      </td>
                      <td className="px-4 py-3 text-brand-muted">{formatDate(t.trialEndDate)}</td>
                      <td className="px-4 py-3 text-right">
                        {expired ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTrialProfile(t, true);
                            }}
                            className="rounded-full bg-brand-red px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-brand-red-hover"
                          >
                            Contact
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Out-Of-Store Leads"
        subtitle="Website, phone, or online signups — track outreach before their first visit."
        open={openSections.outOfStore}
        onToggle={() => toggleSection("outOfStore")}
      >
        <div className="px-5 py-4 sm:px-6 sm:py-5">
          <OutOfStoreLeadsTab dashboardSource={data.source} embedded />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Guests"
        subtitle="Former trials and visitors — completed trials are marked below."
        count={guests.length}
        open={openSections.guests}
        onToggle={() => toggleSection("guests")}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-brand-muted">
              <tr>
                <th className="px-4 py-3 sm:px-6">Name</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Visited Gym?</th>
                <th className="px-4 py-3">Last Visit</th>
                <th className="px-4 py-3">Trial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {guestsShown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-brand-muted">
                    No guest profiles yet.
                  </td>
                </tr>
              ) : (
                guestsShown.map((g) => (
                  <tr
                    key={g.id}
                    className="cursor-pointer align-top hover:bg-brand-red/[0.04] active:bg-brand-red/[0.07]"
                    onClick={() => setSelectedGuestId(g.id)}
                  >
                    <td className="px-4 py-3 font-medium sm:px-6">
                      <span className="underline decoration-brand-red/25 decoration-dotted underline-offset-2">
                        {fullName(g.firstName, g.lastName)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-brand-muted">{formatDate(g.createdAt)}</td>
                    <td className="px-4 py-3">{g.lastVisit ? "Yes" : "Not yet"}</td>
                    <td className="px-4 py-3 text-brand-muted">{formatWhen(g.lastVisit)}</td>
                    <td className="px-4 py-3 text-sm">
                      {g.completedTrial ? (
                        <span className="font-medium text-brand-ink">Trial completed</span>
                      ) : (
                        <span className="text-brand-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="In-Gym Leads"
        subtitle="Added at the kiosk but not checked in yet — first visit starts their 7-day trial."
        count={data.analytics.leadCount}
        open={openSections.inGym}
        onToggle={() => toggleSection("inGym")}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-brand-muted">
              <tr>
                <th className="px-4 py-3 sm:px-6">Name</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3">Times Reached</th>
                <th className="px-4 py-3">Last Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {leadsShown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-brand-muted">
                    No in-gym leads.
                  </td>
                </tr>
              ) : (
                leadsShown.map((l) => (
                  <tr key={l.id} className="hover:bg-neutral-50/80">
                    <td className="px-4 py-3 font-medium sm:px-6">{fullName(l.firstName, l.lastName)}</td>
                    <td className="px-4 py-3 text-brand-muted">{formatDate(l.createdAt)}</td>
                    <td className="px-4 py-3 tabular-nums">{l.contactAttempts}</td>
                    <td className="px-4 py-3 text-brand-muted">{formatDate(l.lastContactDate)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {selectedGuest ? (
        <GuestProfilePanel
          guest={selectedGuest}
          onClose={() => setSelectedGuestId(null)}
          onGuestUpdate={(updated) => {
            setGuests((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
          }}
          onGuestEnrolled={handleGuestEnrolled}
        />
      ) : null}

      {selectedTrial ? (
        <TrialProfilePanel
          trial={selectedTrial}
          contactMode={contactMode}
          onClose={() => {
            setSelectedTrialId(null);
            setContactTrialId(null);
          }}
          onTrialUpdate={(updated) => {
            setTrials((prev) => sortTrialsByUrgency(prev.map((t) => (t.id === updated.id ? updated : t))));
          }}
          onTrialCompleted={handleTrialCompleted}
        />
      ) : null}
    </div>
  );
}
