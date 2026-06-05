"use client";

import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import CollapsibleSection from "@/components/mvp/CollapsibleSection";
import AddGuestDialog from "@/components/mvp/AddGuestDialog";
import OutOfStoreLeadsTab from "@/components/mvp/OutOfStoreLeadsTab";
import GuestProfilePanel from "@/components/mvp/GuestProfilePanel";
import TrialProfilePanel from "@/components/mvp/TrialProfilePanel";
import { formatDate, formatTrialDaysLeft, formatWhen, fullName } from "@/lib/mvpShared";
import {
  isTrialExpired,
  sortTrialsByUrgency,
  type StaffDashboard,
  type StaffGuestRow,
  type StaffMemberRow,
  type StaffTrialRow,
} from "@/lib/staffDashboard";

const LIST_LIMIT = 15;

type SectionKey = "trials" | "outOfGym" | "guests";

type OnboardingLeadsTabProps = {
  data: StaffDashboard;
  trials: StaffTrialRow[];
  guests: StaffGuestRow[];
  onTrialsChange: Dispatch<SetStateAction<StaffTrialRow[]>>;
  onGuestsChange: Dispatch<SetStateAction<StaffGuestRow[]>>;
  onMemberEnrolled?: (member: StaffMemberRow) => void;
};

export default function OnboardingLeadsTab({
  data,
  trials,
  guests,
  onTrialsChange,
  onGuestsChange,
  onMemberEnrolled,
}: OnboardingLeadsTabProps) {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    trials: true,
    outOfGym: false,
    guests: false,
  });
  const [selectedTrialId, setSelectedTrialId] = useState<string | null>(null);
  const [contactTrialId, setContactTrialId] = useState<string | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [outOfGymCount, setOutOfGymCount] = useState(0);
  const [showAddOutOfGymLead, setShowAddOutOfGymLead] = useState(false);
  const [showAddGuest, setShowAddGuest] = useState(false);

  const trialsShown = useMemo(() => trials.slice(0, LIST_LIMIT), [trials]);
  const guestsShown = guests.slice(0, LIST_LIMIT);

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
    onTrialsChange((prev) => prev.filter((t) => t.id !== trial.id));
    onGuestsChange((prev) => [
      {
        id: trial.id,
        firstName: trial.firstName,
        lastName: trial.lastName,
        phone: trial.phone,
        email: trial.email,
        createdAt: new Date().toISOString(),
        lastVisit: null,
        totalVisits: 0,
        dateOfBirth: trial.dateOfBirth,
        ageGroup: "adult",
        completedTrial: true,
        parents: trial.parents ?? [],
        notes: trial.notes,
      },
      ...prev,
    ]);
    setSelectedTrialId(null);
    setContactTrialId(null);
    setOpenSections((prev) => ({ ...prev, guests: true }));
  }

  function handleGuestEnrolled(member: StaffMemberRow) {
    onGuestsChange((prev) => prev.filter((g) => g.id !== member.id));
    setSelectedGuestId(null);
    onMemberEnrolled?.(member);
  }

  function handleTrialEnrolled(member: StaffMemberRow) {
    onTrialsChange((prev) => prev.filter((t) => t.id !== member.id));
    setSelectedTrialId(null);
    setContactTrialId(null);
    onMemberEnrolled?.(member);
  }

  function handleTrialMovedToGuest(guest: StaffGuestRow) {
    onTrialsChange((prev) => prev.filter((t) => t.id !== guest.id));
    onGuestsChange((prev) => [guest, ...prev.filter((g) => g.id !== guest.id)]);
    setSelectedTrialId(null);
    setContactTrialId(null);
    setOpenSections((prev) => ({ ...prev, guests: true }));
  }

  function handlePromotedToGuest(guest: StaffGuestRow) {
    onGuestsChange((prev) => {
      if (prev.some((g) => g.id === guest.id)) {
        return prev.map((g) => (g.id === guest.id ? guest : g));
      }
      return [guest, ...prev];
    });
    setOpenSections((prev) => ({ ...prev, guests: true }));
    setSelectedGuestId(guest.id);
  }

  return (
    <div className="w-full space-y-6">
      <p className="text-sm text-brand-muted">
        Customer acquisition and follow-up — trials, out-of-gym leads, and guests on the path to membership.
      </p>

      <CollapsibleSection
        title="Trial Members"
        subtitle="Sorted by urgency — expired trials first, then days remaining. Expired trials move to Guests automatically (trial completed)."
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
        title="Out-Of-Gym Leads"
        subtitle="Website, phone, or online signups — track outreach before their first visit."
        count={outOfGymCount}
        open={openSections.outOfGym}
        onToggle={() => toggleSection("outOfGym")}
        headerAside={
          <button
            type="button"
            onClick={() => setShowAddOutOfGymLead(true)}
            className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink shadow-sm hover:bg-neutral-50"
          >
            Add lead
          </button>
        }
      >
        <OutOfStoreLeadsTab
          dashboardSource={data.source}
          showAddForm={showAddOutOfGymLead}
          onAddFormClose={() => setShowAddOutOfGymLead(false)}
          onPromotedToGuest={handlePromotedToGuest}
          onCountChange={setOutOfGymCount}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Guests"
        subtitle="Visitors and kiosk guest signups — they stay here until enrolled or they start a trial from the kiosk. Completed trials are marked below."
        count={guests.length}
        open={openSections.guests}
        onToggle={() => toggleSection("guests")}
        headerAside={
          <button
            type="button"
            onClick={() => setShowAddGuest(true)}
            className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink shadow-sm hover:bg-neutral-50"
          >
            Add guest
          </button>
        }
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

      {selectedGuest ? (
        <GuestProfilePanel
          guest={selectedGuest}
          onClose={() => setSelectedGuestId(null)}
          onGuestUpdate={(updated) => {
            onGuestsChange((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
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
            onTrialsChange((prev) => sortTrialsByUrgency(prev.map((t) => (t.id === updated.id ? updated : t))));
          }}
          onTrialCompleted={handleTrialCompleted}
          onTrialEnrolled={handleTrialEnrolled}
          onTrialMovedToGuest={handleTrialMovedToGuest}
        />
      ) : null}

      <AddGuestDialog
        open={showAddGuest}
        onClose={() => setShowAddGuest(false)}
        onGuestAdded={(guest) => {
          onGuestsChange((prev) => {
            if (prev.some((g) => g.id === guest.id)) {
              return prev.map((g) => (g.id === guest.id ? guest : g));
            }
            return [guest, ...prev];
          });
          setSelectedGuestId(guest.id);
        }}
      />
    </div>
  );
}
