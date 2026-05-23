"use client";

import { type FormEvent, useEffect, useState } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import PersonNotesSection from "@/components/mvp/PersonNotesSection";
import WaiverHistorySection from "@/components/mvp/WaiverHistorySection";
import { buildMemberFromGuestEnroll, type GuestEnrollPayload } from "@/lib/guestEnroll";
import { BELT_TIERS, formatDate, formatMemberAge, formatWhen, fullName } from "@/lib/mvpShared";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import type { MemberAgeGroup, StaffGuestRow, StaffMemberRow } from "@/lib/staffDashboard";

const inputClass =
  "w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

const ENROLL_BELTS = [...BELT_TIERS].reverse();

type GuestProfilePanelProps = {
  guest: StaffGuestRow;
  onClose: () => void;
  onGuestUpdate: (guest: StaffGuestRow) => void;
  onGuestEnrolled: (member: StaffMemberRow) => void;
};

export default function GuestProfilePanel({
  guest,
  onClose,
  onGuestUpdate,
  onGuestEnrolled,
}: GuestProfilePanelProps) {
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState(guest.firstName);
  const [lastName, setLastName] = useState(guest.lastName);
  const [phone, setPhone] = useState(guest.phone);
  const [email, setEmail] = useState(guest.email ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(guest.dateOfBirth ?? "");

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [beltColor, setBeltColor] = useState("White");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [ageGroup, setAgeGroup] = useState<MemberAgeGroup>("adult");
  const [enrollDob, setEnrollDob] = useState(guest.dateOfBirth ?? "");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    setEditSaving(true);
    try {
      const res = await fetch(`/api/mvp/people/${guest.id}`, {
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
      const p = json.person as Partial<StaffGuestRow>;
      onGuestUpdate({
        ...guest,
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
    const parents =
      ageGroup === "child"
        ? [{ name: parentName.trim(), phone: parentPhone.replace(/\D/g, "") }].filter(
            (p) => p.name && p.phone.length >= 10
          )
        : [];
    if (ageGroup === "child" && parents.length === 0) {
      return { error: "Parent name and phone are required for child members." };
    }
    return {
      beltColor,
      monthlyPayment: payment,
      ageGroup,
      dateOfBirth: enrollDob.trim() || null,
      parents,
    };
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
      const res = await fetch(`/api/mvp/guests/${guest.id}/enroll`, {
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
          ? buildMemberFromGuestEnroll(guest, payload)
          : (json.member as StaffMemberRow);
      onGuestEnrolled(member);
    } catch {
      setEnrollError("Something went wrong.");
    } finally {
      setEnrollSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-profile-title"
      onClick={onClose}
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <KioskSnakeBorderCard
          wide
          innerClassName="flex max-h-[min(90vh,720px)] flex-col overflow-hidden p-0"
        >
          <div className="shrink-0 border-b border-black/[0.06] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="guest-profile-title" className="text-lg font-semibold text-brand-ink">
                  {fullName(guest.firstName, guest.lastName)}
                </h2>
                <p className="mt-1 text-sm leading-snug text-brand-muted">
                  Guest since <span className="text-brand-ink">{formatDate(guest.createdAt)}</span>
                  {guest.completedTrial ? (
                    <>
                      {" · "}
                      <span className="font-medium text-brand-ink">Trial completed</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-ink hover:bg-neutral-50"
                  >
                    Edit
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
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {editing ? (
              <form className="space-y-4" onSubmit={saveProfile}>
                <label className="block text-xs font-medium">
                  First name
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} required />
                </label>
                <label className="block text-xs font-medium">
                  Last name
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} required />
                </label>
                <label className="block text-xs font-medium">
                  Phone
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} required />
                </label>
                <label className="block text-xs font-medium">
                  Email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </label>
                <label className="block text-xs font-medium">
                  Date of birth
                  <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClass} />
                </label>
                {editError ? <p className="text-xs text-red-700">{editError}</p> : null}
                <div className="flex gap-2">
                  <button type="submit" disabled={editSaving} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white">
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="rounded-lg border px-4 py-2 text-sm">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Phone</dt>
                    <dd className="mt-0.5">
                      <a href={`tel:${normalizePhone(guest.phone)}`} className="text-sm font-medium text-brand-ink hover:underline">
                        {formatPhoneDisplay(guest.phone)}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Email</dt>
                    <dd className="mt-0.5 break-all text-sm text-brand-ink">{guest.email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Age</dt>
                    <dd className="mt-0.5 text-sm text-brand-ink">{formatMemberAge(guest.dateOfBirth)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Date of birth</dt>
                    <dd className="mt-0.5 text-sm text-brand-ink">
                      {guest.dateOfBirth ? formatDate(guest.dateOfBirth) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Last visit</dt>
                    <dd className="mt-0.5 text-sm text-brand-ink">{formatWhen(guest.lastVisit)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Total visits</dt>
                    <dd className="mt-0.5 text-sm text-brand-ink">{guest.totalVisits}</dd>
                  </div>
                </dl>

                <WaiverHistorySection personId={guest.id} />

                <PersonNotesSection
                  personId={guest.id}
                  notes={guest.notes}
                  notesApiBase="/api/mvp/people"
                  onNotesChange={(notes) => onGuestUpdate({ ...guest, notes })}
                  compact={enrollOpen}
                />
              </>
            )}
          </div>

          {!editing ? (
            <div className="shrink-0 border-t border-black/[0.06] bg-neutral-50/90 px-5 py-3">
              {!enrollOpen ? (
                <button
                  type="button"
                  onClick={() => setEnrollOpen(true)}
                  className="w-full rounded-lg bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"
                >
                  Enroll As Member
                </button>
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
                        {ENROLL_BELTS.map((belt) => (
                          <option key={belt} value={belt}>
                            {belt}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
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
        </KioskSnakeBorderCard>
      </div>
    </div>
  );
}
