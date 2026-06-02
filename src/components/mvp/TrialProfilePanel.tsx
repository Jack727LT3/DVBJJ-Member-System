"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import AddParentDialog from "@/components/mvp/AddParentDialog";
import PersonNotesSection from "@/components/mvp/PersonNotesSection";
import PersonParentsSection from "@/components/mvp/PersonParentsSection";
import WaiverHistorySection from "@/components/mvp/WaiverHistorySection";
import { formatDate, formatMemberAge, formatTrialDaysLeft, fullName } from "@/lib/mvpShared";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import { isTrialExpired, type StaffMemberParent, type StaffTrialRow } from "@/lib/staffDashboard";

const inputClass =
  "w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

type TrialProfilePanelProps = {
  trial: StaffTrialRow;
  onClose: () => void;
  onTrialUpdate: (trial: StaffTrialRow) => void;
  onTrialCompleted: (trial: StaffTrialRow) => void;
  contactMode?: boolean;
};

export default function TrialProfilePanel({
  trial,
  onClose,
  onTrialUpdate,
  onTrialCompleted,
  contactMode = false,
}: TrialProfilePanelProps) {
  const phoneRef = useRef<HTMLAnchorElement>(null);
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState(trial.firstName);
  const [lastName, setLastName] = useState(trial.lastName);
  const [phone, setPhone] = useState(trial.phone);
  const [email, setEmail] = useState(trial.email ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(trial.dateOfBirth ?? "");
  const [contacted, setContacted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [showAddParent, setShowAddParent] = useState(false);
  const [parents, setParents] = useState<StaffMemberParent[]>(trial.parents ?? []);

  const expired = isTrialExpired(trial);
  const showContactComplete = contactMode && expired;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!contactMode) return;
    const t = window.setTimeout(() => phoneRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [contactMode, trial.id]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    setEditSaving(true);
    try {
      const res = await fetch(`/api/mvp/people/${trial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          email: email.trim() || null,
          dateOfBirth: dateOfBirth.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok && !json.person) {
        setEditError(json.error ?? "Could not save.");
        return;
      }
      const p = json.person as Partial<typeof trial>;
      onTrialUpdate({
        ...trial,
        firstName: p.firstName ?? firstName,
        lastName: p.lastName ?? lastName,
        phone: p.phone ?? phone,
        email: p.email !== undefined ? p.email : email.trim() || null,
        dateOfBirth: p.dateOfBirth !== undefined ? p.dateOfBirth : dateOfBirth.trim() || null,
      });
      setEditing(false);
    } catch {
      setEditError("Something went wrong.");
    } finally {
      setEditSaving(false);
    }
  }

  async function completeContact() {
    if (!contacted) return;
    setCompleteError(null);
    setCompleting(true);
    try {
      const res = await fetch(`/api/mvp/trials/${trial.id}/complete-contact`, { method: "POST" });
      const json = await res.json();
      if (!res.ok && !json.ok) {
        setCompleteError(json.error ?? "Could not save.");
        return;
      }
      onTrialCompleted(trial);
      onClose();
    } catch {
      setCompleteError("Something went wrong.");
    } finally {
      setCompleting(false);
    }
  }

  const statusLabel = expired
    ? "Expired"
    : `${formatTrialDaysLeft(trial.daysRemaining)} day${trial.daysRemaining === 1 ? "" : "s"} left`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-profile-title"
      onClick={onClose}
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <KioskSnakeBorderCard
          wide
          innerClassName="flex max-h-[min(90vh,640px)] flex-col overflow-hidden p-0 sm:max-h-[min(90vh,680px)]"
        >
          <div className="shrink-0 border-b border-black/[0.06] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="trial-profile-title" className="text-lg font-semibold text-brand-ink">
                  {fullName(trial.firstName, trial.lastName)}
                </h2>
                <p className="mt-1 text-sm leading-snug text-brand-muted">
                  {trial.trialStartDate ? (
                    <>
                      Started <span className="text-brand-ink">{formatDate(trial.trialStartDate)}</span>
                      {" · "}
                    </>
                  ) : null}
                  Ended <span className="text-brand-ink">{formatDate(trial.trialEndDate)}</span>
                  {" · "}
                  <span className={expired ? "font-medium text-brand-red" : "font-medium text-brand-ink"}>
                    {statusLabel}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-2">
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-ink"
                  >
                    Edit
                  </button>
                ) : null}
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => setShowAddParent(true)}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-ink"
                  >
                    Add parent
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-muted hover:text-brand-ink"
                >
                  Close
                </button>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Phone</dt>
                <dd className="mt-0.5">
                  <a
                    ref={phoneRef}
                    href={`tel:${normalizePhone(trial.phone)}`}
                    tabIndex={0}
                    className="inline-block text-sm font-medium text-brand-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2"
                  >
                    {formatPhoneDisplay(trial.phone)}
                  </a>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Email</dt>
                <dd className="mt-0.5 break-all text-sm">
                  {trial.email ? (
                    <a
                      href={`mailto:${trial.email}`}
                      className="font-medium text-brand-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2"
                    >
                      {trial.email}
                    </a>
                  ) : (
                    <span className="text-brand-ink">—</span>
                  )}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Age</dt>
                <dd className="mt-0.5 text-sm text-brand-ink">{formatMemberAge(trial.dateOfBirth)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">DOB</dt>
                <dd className="mt-0.5 text-sm text-brand-ink">
                  {trial.dateOfBirth ? formatDate(trial.dateOfBirth) : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {editing ? (
              <form className="space-y-3" onSubmit={saveProfile}>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} placeholder="First name" required />
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} placeholder="Last name" required />
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="Phone" required />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Email" />
                <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClass} />
                {editError ? <p className="text-xs text-red-700">{editError}</p> : null}
                <div className="flex gap-2">
                  <button type="submit" disabled={editSaving} className="rounded-lg bg-brand-red px-3 py-1.5 text-sm font-semibold text-white">
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="rounded-lg border px-3 py-1.5 text-sm">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <PersonParentsSection parents={parents} />
                <WaiverHistorySection personId={trial.id} />
                <PersonNotesSection
                  personId={trial.id}
                  notes={trial.notes}
                  notesApiBase="/api/mvp/people"
                  onNotesChange={(notes) => onTrialUpdate({ ...trial, notes })}
                  compact={showContactComplete}
                />
              </>
            )}
          </div>

          {showContactComplete ? (
            <div className="shrink-0 space-y-2 border-t border-black/[0.06] bg-neutral-50/90 px-5 py-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={contacted}
                  onChange={(e) => setContacted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-black/20 text-brand-red focus:ring-brand-red/30"
                />
                <span className="text-sm leading-snug text-brand-ink">
                  I contacted them about their expired trial
                </span>
              </label>
              {completeError ? <p className="text-xs text-red-700">{completeError}</p> : null}
              <button
                type="button"
                disabled={!contacted || completing}
                onClick={() => void completeContact()}
                className="w-full rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {completing ? "Saving…" : "Mark contacted"}
              </button>
            </div>
          ) : null}
        </KioskSnakeBorderCard>
      </div>
      {showAddParent ? (
        <AddParentDialog
          personId={trial.id}
          existingParents={parents}
          onClose={() => setShowAddParent(false)}
          onSaved={(next) => {
            setParents(next);
            onTrialUpdate({ ...trial, parents: next });
          }}
        />
      ) : null}
    </div>
  );
}
