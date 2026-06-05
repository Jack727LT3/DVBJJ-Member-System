"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import AddParentDialog from "@/components/mvp/AddParentDialog";
import PersonNotesSection from "@/components/mvp/PersonNotesSection";
import PersonParentsSection from "@/components/mvp/PersonParentsSection";
import WaiverHistorySection from "@/components/mvp/WaiverHistorySection";
import { buildMemberFromTrialEnroll, type GuestEnrollPayload } from "@/lib/guestEnroll";
import { beltSelectOptions, formatDate, formatMemberAge, formatTrialDaysLeft, fullName } from "@/lib/mvpShared";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import {
  isTrialExpired,
  type MemberAgeGroup,
  type StaffGuestRow,
  type StaffMemberParent,
  type StaffMemberRow,
  type StaffTrialRow,
} from "@/lib/staffDashboard";

const inputClass =
  "w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

type TrialProfilePanelProps = {
  trial: StaffTrialRow;
  onClose: () => void;
  onTrialUpdate: (trial: StaffTrialRow) => void;
  onTrialCompleted: (trial: StaffTrialRow) => void;
  onTrialEnrolled?: (member: StaffMemberRow) => void;
  onTrialMovedToGuest?: (guest: StaffGuestRow) => void;
  contactMode?: boolean;
};

export default function TrialProfilePanel({
  trial,
  onClose,
  onTrialUpdate,
  onTrialCompleted,
  onTrialEnrolled,
  onTrialMovedToGuest,
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
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [beltColor, setBeltColor] = useState("White");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [ageGroup, setAgeGroup] = useState<MemberAgeGroup>("adult");
  const [enrollDob, setEnrollDob] = useState(trial.dateOfBirth ?? "");
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [moveToGuestSaving, setMoveToGuestSaving] = useState(false);
  const [moveToGuestError, setMoveToGuestError] = useState<string | null>(null);

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

  function buildEnrollPayload(): GuestEnrollPayload | { error: string } {
    const payment = Number.parseFloat(monthlyPayment);
    if (!Number.isFinite(payment) || payment <= 0) {
      return { error: "Enter a valid monthly payment." };
    }
    const enrollParents = ageGroup === "child" ? parents : [];
    if (ageGroup === "child" && enrollParents.length === 0) {
      return { error: "Add a parent or guardian for child members before enrolling." };
    }
    return {
      beltColor,
      monthlyPayment: payment,
      ageGroup,
      dateOfBirth: enrollDob.trim() || null,
      parents: enrollParents,
    };
  }

  function guestFromTrial(completedTrial = true): StaffGuestRow {
    return {
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
      completedTrial,
      parents: parents,
      notes: trial.notes,
    };
  }

  async function moveToGuest() {
    if (
      !confirm(
        `Move ${fullName(trial.firstName, trial.lastName)} to Guests? Their trial will end and they'll be marked as trial completed.`
      )
    ) {
      return;
    }
    setMoveToGuestError(null);
    setMoveToGuestSaving(true);
    try {
      const res = await fetch(`/api/mvp/trials/${trial.id}/convert-to-guest`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setMoveToGuestError(json.error ?? "Could not move to guest.");
        return;
      }
      const guest: StaffGuestRow =
        json.source === "demo"
          ? guestFromTrial(true)
          : {
              id: json.guest.id,
              firstName: json.guest.firstName,
              lastName: json.guest.lastName,
              phone: json.guest.phone,
              email: json.guest.email,
              createdAt: json.guest.createdAt,
              lastVisit: json.guest.lastVisit,
              totalVisits: json.guest.totalVisits ?? 0,
              dateOfBirth: json.guest.dateOfBirth,
              ageGroup: json.guest.ageGroup ?? "adult",
              completedTrial: Boolean(json.guest.completedTrial),
              parents: trial.parents ?? [],
              notes: trial.notes,
            };
      onTrialMovedToGuest?.(guest);
      onClose();
    } catch {
      setMoveToGuestError("Something went wrong.");
    } finally {
      setMoveToGuestSaving(false);
    }
  }

  async function submitEnroll(e: FormEvent) {
    e.preventDefault();
    setEnrollError(null);
    const payload = buildEnrollPayload();
    if ("error" in payload) {
      setEnrollError(payload.error);
      return;
    }
    setEnrollSaving(true);
    try {
      const res = await fetch(`/api/mvp/trials/${trial.id}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setEnrollError(json.error ?? "Could not enroll member.");
        return;
      }
      const member =
        json.source === "demo"
          ? buildMemberFromTrialEnroll(trial, payload)
          : (json.member as StaffMemberRow);
      onTrialEnrolled?.(member);
    } catch {
      setEnrollError("Something went wrong.");
    } finally {
      setEnrollSaving(false);
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
                  compact={showContactComplete || enrollOpen}
                />
              </>
            )}
          </div>

          {!editing && !showContactComplete ? (
            <div className="shrink-0 border-t border-black/[0.06] bg-neutral-50/90 px-5 py-3">
              {!enrollOpen ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={moveToGuestSaving}
                    onClick={() => void moveToGuest()}
                    className="w-full rounded-lg border border-black/10 bg-neutral-200 px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {moveToGuestSaving ? "Moving…" : "Move To Guest"}
                  </button>
                  {moveToGuestError ? <p className="text-xs text-red-700">{moveToGuestError}</p> : null}
                  <button
                    type="button"
                    onClick={() => setEnrollOpen(true)}
                    className="w-full rounded-lg bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"
                  >
                    Enroll As Member
                  </button>
                </div>
              ) : (
                <form className="space-y-3" onSubmit={submitEnroll}>
                  <p className="text-sm font-semibold text-brand-ink">New member details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">$ / Month</span>
                      <input
                        type="number"
                        min={1}
                        required
                        value={monthlyPayment}
                        onChange={(e) => setMonthlyPayment(e.target.value)}
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Belt</span>
                      <select value={beltColor} onChange={(e) => setBeltColor(e.target.value)} className={inputClass}>
                        {beltSelectOptions(ageGroup).map((belt) => (
                          <option key={belt} value={belt}>
                            {belt}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <fieldset>
                    <legend className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Member type</legend>
                    <div className="mt-1 flex gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={ageGroup === "adult"} onChange={() => setAgeGroup("adult")} />
                        Adult
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={ageGroup === "child"} onChange={() => setAgeGroup("child")} />
                        Child
                      </label>
                    </div>
                  </fieldset>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Date of birth</span>
                    <input type="date" value={enrollDob} onChange={(e) => setEnrollDob(e.target.value)} className={inputClass} />
                  </label>
                  {enrollError ? <p className="text-xs text-red-700">{enrollError}</p> : null}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={enrollSaving}
                      className="flex-1 rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {enrollSaving ? "Enrolling…" : "Confirm Enrollment"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnrollOpen(false)}
                      className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}

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
