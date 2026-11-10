"use client";

import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import CollapsibleSection from "@/components/mvp/CollapsibleSection";
import AddGuestDialog from "@/components/mvp/AddGuestDialog";
import OutOfStoreLeadsTab from "@/components/mvp/OutOfStoreLeadsTab";
import GuestProfilePanel from "@/components/mvp/GuestProfilePanel";
import TrialProfilePanel from "@/components/mvp/TrialProfilePanel";
import { formatDate, formatTrialDaysLeft, formatWhen, fullName } from "@/lib/mvpShared";
import { normalizePhone } from "@/lib/phone";
import {
  isTrialExpired,
  sortTrialsByUrgency,
  type StaffDashboard,
  type StaffGuestRow,
  type StaffMemberRow,
  type StaffTrialRow,
} from "@/lib/staffDashboard";

/** ~8 table rows visible before inner scroll */
const SCROLLABLE_TABLE_MAX_H = "max-h-[22.5rem]";

const inputClass =
  "w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

type SectionKey = "pending" | "trials" | "outOfGym" | "guests";

type OnboardingLeadsTabProps = {
  data: StaffDashboard;
  trials: StaffTrialRow[];
  guests: StaffGuestRow[];
  onTrialsChange: Dispatch<SetStateAction<StaffTrialRow[]>>;
  onGuestsChange: Dispatch<SetStateAction<StaffGuestRow[]>>;
  onMemberEnrolled?: (member: StaffMemberRow) => void;
  onScheduleTrial?: (lead: { id: string; firstName: string; lastName: string }) => void;
};

function personMatchesSearch(
  person: { firstName: string; lastName: string; phone: string; email?: string | null },
  query: string
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = fullName(person.firstName, person.lastName).toLowerCase();
  const email = (person.email ?? "").toLowerCase();
  const phoneDigits = normalizePhone(person.phone);
  const qDigits = normalizePhone(q);
  if (name.includes(q) || email.includes(q)) return true;
  if (qDigits.length >= 3 && phoneDigits.includes(qDigits)) return true;
  return false;
}

export default function OnboardingLeadsTab({
  data,
  trials,
  guests,
  onTrialsChange,
  onGuestsChange,
  onMemberEnrolled,
  onScheduleTrial,
}: OnboardingLeadsTabProps) {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    pending: true,
    trials: true,
    outOfGym: false,
    guests: true,
  });
  const [selectedTrialId, setSelectedTrialId] = useState<string | null>(null);
  const [contactTrialId, setContactTrialId] = useState<string | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [outOfGymCount, setOutOfGymCount] = useState(0);
  const [showAddOutOfGymLead, setShowAddOutOfGymLead] = useState(false);
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [trialSearch, setTrialSearch] = useState("");

  const pendingGuests = useMemo(
    () => guests.filter((g) => Boolean(g.pendingAgreement)),
    [guests]
  );
  const pendingTrials = useMemo(
    () => trials.filter((t) => Boolean(t.pendingAgreement)),
    [trials]
  );
  const pendingCount = pendingGuests.length + pendingTrials.length;

  const filteredGuests = useMemo(
    () => guests.filter((g) => personMatchesSearch(g, guestSearch)),
    [guests, guestSearch]
  );
  const filteredTrials = useMemo(
    () => trials.filter((t) => personMatchesSearch(t, trialSearch)),
    [trials, trialSearch]
  );

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
        pendingAgreement: trial.pendingAgreement ?? null,
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

      {pendingCount > 0 ? (
        <CollapsibleSection
          title="Awaiting Payment Confirmation"
          subtitle="Signed a membership agreement at the kiosk — confirm their payment plan is started, then move them into Members."
          count={pendingCount}
          open={openSections.pending}
          onToggle={() => toggleSection("pending")}
        >
          <div className={`staff-roster-scroll overflow-x-auto overflow-y-scroll ${SCROLLABLE_TABLE_MAX_H}`}>
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-brand-muted shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                <tr>
                  <th className="px-4 py-3 sm:px-6">Name</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Signed</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {pendingGuests.map((g) => (
                  <tr
                    key={`pg-${g.id}`}
                    className="cursor-pointer align-top hover:bg-brand-red/[0.04] active:bg-brand-red/[0.07]"
                    onClick={() => setSelectedGuestId(g.id)}
                  >
                    <td className="px-4 py-3 font-medium sm:px-6">
                      <span className="underline decoration-brand-red/25 decoration-dotted underline-offset-2">
                        {fullName(g.firstName, g.lastName)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-brand-muted">{g.pendingAgreement?.planLabel ?? "—"}</td>
                    <td className="px-4 py-3 text-brand-muted">
                      {g.pendingAgreement ? formatWhen(g.pendingAgreement.signedAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-brand-ink">Guest</span>
                    </td>
                  </tr>
                ))}
                {pendingTrials.map((t) => (
                  <tr
                    key={`pt-${t.id}`}
                    className="cursor-pointer align-top hover:bg-brand-red/[0.04] active:bg-brand-red/[0.07]"
                    onClick={() => openTrialProfile(t, false)}
                  >
                    <td className="px-4 py-3 font-medium sm:px-6">
                      <span className="underline decoration-brand-red/25 decoration-dotted underline-offset-2">
                        {fullName(t.firstName, t.lastName)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-brand-muted">{t.pendingAgreement?.planLabel ?? "—"}</td>
                    <td className="px-4 py-3 text-brand-muted">
                      {t.pendingAgreement ? formatWhen(t.pendingAgreement.signedAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-brand-ink">Trial</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection
        title="Trial Members"
        subtitle="Search or scroll the full list. Sorted by urgency — expired trials first."
        count={filteredTrials.length}
        open={openSections.trials}
        onToggle={() => toggleSection("trials")}
      >
        <div className="border-b border-black/[0.06] px-5 py-4 sm:px-6">
          <label className="text-xs font-medium text-brand-ink" htmlFor="trial-search">
            Search Trials
          </label>
          <input
            id="trial-search"
            type="search"
            value={trialSearch}
            onChange={(e) => setTrialSearch(e.target.value)}
            placeholder="Name, email, or phone…"
            className={`mt-1.5 ${inputClass}`}
            autoComplete="off"
          />
        </div>
        <div className={`staff-roster-scroll overflow-x-auto overflow-y-scroll ${SCROLLABLE_TABLE_MAX_H}`}>
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-brand-muted shadow-[0_1px_0_rgba(0,0,0,0.06)]">
              <tr>
                <th className="px-4 py-3 sm:px-6">Name</th>
                <th className="px-4 py-3">Days Left</th>
                <th className="px-4 py-3">Trial Ends</th>
                <th className="w-24 px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {filteredTrials.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-brand-muted">
                    {trialSearch.trim() ? "No trials match your search." : "No active trials."}
                  </td>
                </tr>
              ) : (
                filteredTrials.map((t) => {
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
                        {t.pendingAgreement ? (
                          <span className="ml-1.5 text-xs font-medium text-brand-red">· Agreement signed</span>
                        ) : null}
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
        {filteredTrials.length > 8 ? (
          <p className="border-t border-black/[0.06] px-5 py-2 text-center text-xs text-brand-muted sm:px-6">
            Scroll inside this list to see all {filteredTrials.length} trials
          </p>
        ) : null}
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
          onScheduleTrial={onScheduleTrial}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Guests"
        subtitle="Search or scroll everyone. They stay here until staff confirms payment and enrolls them, or they start a trial from the kiosk."
        count={filteredGuests.length}
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
        <div className="border-b border-black/[0.06] px-5 py-4 sm:px-6">
          <label className="text-xs font-medium text-brand-ink" htmlFor="guest-search">
            Search Guests
          </label>
          <input
            id="guest-search"
            type="search"
            value={guestSearch}
            onChange={(e) => setGuestSearch(e.target.value)}
            placeholder="Name, email, or phone…"
            className={`mt-1.5 ${inputClass}`}
            autoComplete="off"
          />
        </div>
        <div className={`staff-roster-scroll overflow-x-auto overflow-y-scroll ${SCROLLABLE_TABLE_MAX_H}`}>
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-brand-muted shadow-[0_1px_0_rgba(0,0,0,0.06)]">
              <tr>
                <th className="px-4 py-3 sm:px-6">Name</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Visited Gym?</th>
                <th className="px-4 py-3">Last Visit</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {filteredGuests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-brand-muted">
                    {guestSearch.trim() ? "No guests match your search." : "No guest profiles yet."}
                  </td>
                </tr>
              ) : (
                filteredGuests.map((g) => (
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
                      {g.pendingAgreement ? (
                        <span className="font-medium text-brand-red">Awaiting payment</span>
                      ) : g.completedTrial ? (
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
        {filteredGuests.length > 8 ? (
          <p className="border-t border-black/[0.06] px-5 py-2 text-center text-xs text-brand-muted sm:px-6">
            Scroll inside this list to see all {filteredGuests.length} guests
          </p>
        ) : null}
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
