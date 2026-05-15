"use client";

import { type FormEvent, useEffect, useState } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import { buildMemberFromGuestEnroll, type GuestEnrollPayload } from "@/lib/guestEnroll";
import { BELT_TIERS, formatDate, formatWhen, fullName } from "@/lib/mvpShared";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import type { MemberAgeGroup, StaffGuestRow, StaffMemberNote, StaffMemberRow } from "@/lib/staffDashboard";

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
  const [noteBody, setNoteBody] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [beltColor, setBeltColor] = useState("White");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [ageGroup, setAgeGroup] = useState<MemberAgeGroup>("adult");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    setNoteError(null);
    if (!noteBody.trim()) {
      setNoteError("Enter a note first.");
      return;
    }
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/mvp/people/${guest.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      const json = await res.json();
      if (!res.ok && !json.note) {
        setNoteError(json.error ?? "Could not save note.");
        return;
      }
      const note = json.note as StaffMemberNote;
      onGuestUpdate({ ...guest, notes: [note, ...guest.notes] });
      setNoteBody("");
    } catch {
      setNoteError("Something went wrong.");
    } finally {
      setNoteSaving(false);
    }
  }

  function startEditNote(note: StaffMemberNote) {
    setEditingNoteId(note.id);
    setEditBody(note.body);
    setEditError(null);
  }

  function cancelEditNote() {
    setEditingNoteId(null);
    setEditBody("");
    setEditError(null);
  }

  async function saveEditNote(noteId: string) {
    setEditError(null);
    if (!editBody.trim()) {
      setEditError("Note cannot be empty.");
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/mvp/people/${guest.id}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      const json = await res.json();
      if (!res.ok && !json.note) {
        setEditError(json.error ?? "Could not update note.");
        return;
      }
      const note = json.note as StaffMemberNote;
      onGuestUpdate({
        ...guest,
        notes: guest.notes.map((n) => (n.id === noteId ? note : n)),
      });
      cancelEditNote();
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
        ? [
            {
              name: parentName.trim(),
              phone: parentPhone.replace(/\D/g, ""),
            },
          ].filter((p) => p.name && p.phone.length >= 10)
        : [];
    if (ageGroup === "child" && parents.length === 0) {
      return { error: "Parent name and phone are required for child members." };
    }
    return {
      beltColor,
      monthlyPayment: payment,
      ageGroup,
      dateOfBirth: dateOfBirth.trim() || null,
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
          innerClassName="flex max-h-[min(90vh,680px)] flex-col overflow-hidden p-0 sm:max-h-[min(90vh,720px)]"
        >
          <div className="shrink-0 border-b border-black/[0.06] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="guest-profile-title" className="text-lg font-semibold text-brand-ink">
                  {fullName(guest.firstName, guest.lastName)}
                </h2>
                <p className="mt-1 text-sm leading-snug text-brand-muted">
                  Guest since <span className="text-brand-ink">{formatDate(guest.createdAt)}</span>
                  {" · "}
                  Last visit <span className="text-brand-ink">{formatWhen(guest.lastVisit)}</span>
                  {guest.completedTrial ? (
                    <>
                      {" · "}
                      <span className="font-medium text-brand-ink">Trial completed</span>
                    </>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-muted hover:text-brand-ink"
              >
                Close
              </button>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Phone</dt>
                <dd className="mt-0.5">
                  <a
                    href={`tel:${normalizePhone(guest.phone)}`}
                    className="inline-block text-sm font-medium text-brand-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2"
                  >
                    {formatPhoneDisplay(guest.phone)}
                  </a>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Email</dt>
                <dd className="mt-0.5 break-all text-sm">
                  {guest.email ? (
                    <a
                      href={`mailto:${guest.email}`}
                      className="font-medium text-brand-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2"
                    >
                      {guest.email}
                    </a>
                  ) : (
                    <span className="text-brand-ink">—</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            <h3 className="text-sm font-semibold text-brand-ink">
              Notes {guest.notes.length > 0 ? `(${guest.notes.length})` : ""}
            </h3>
            {guest.notes.length === 0 ? (
              <p className="mt-1 text-sm text-brand-muted">No notes yet.</p>
            ) : (
              <ul className={`mt-2 space-y-2 ${enrollOpen ? "max-h-28 overflow-y-auto" : "max-h-40 overflow-y-auto"}`}>
                {guest.notes.map((n) => (
                  <li
                    key={n.id}
                    className={`relative rounded-lg border border-black/[0.06] bg-neutral-50/80 p-2 text-sm ${
                      editingNoteId === n.id ? "" : "pr-12"
                    }`}
                  >
                    {editingNoteId !== n.id ? (
                      <button
                        type="button"
                        onClick={() => startEditNote(n)}
                        disabled={editingNoteId !== null}
                        className="absolute right-1.5 top-1.5 rounded border border-black/10 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-brand-muted hover:text-brand-ink disabled:opacity-50"
                      >
                        Edit
                      </button>
                    ) : null}
                    {editingNoteId === n.id ? (
                      <form
                        className="space-y-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveEditNote(n.id);
                        }}
                      >
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={2}
                          className={inputClass}
                          autoFocus
                        />
                        {editError ? <p className="text-xs text-red-700">{editError}</p> : null}
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={editSaving}
                            className="rounded bg-brand-red px-2 py-0.5 text-xs font-semibold text-white"
                          >
                            Save
                          </button>
                          <button type="button" onClick={cancelEditNote} className="rounded border border-black/10 px-2 py-0.5 text-xs">
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="text-brand-ink">{n.body}</p>
                        <p className="mt-0.5 text-[11px] text-black/45">{formatDate(n.createdAt)}</p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form className="mt-3 space-y-2" onSubmit={submitNote}>
              <textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                rows={enrollOpen ? 1 : 2}
                className={inputClass}
                placeholder="Add a note…"
                aria-label="Add note"
              />
              {noteError ? <p className="text-xs text-red-700">{noteError}</p> : null}
              <button
                type="submit"
                disabled={noteSaving}
                className="rounded-lg bg-brand-red px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:opacity-55"
              >
                {noteSaving ? "Saving…" : "Save Note"}
              </button>
            </form>
          </div>

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
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                      $ / Month
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      required
                      value={monthlyPayment}
                      onChange={(e) => setMonthlyPayment(e.target.value)}
                      className={inputClass}
                      placeholder="109"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Belt</span>
                    <select
                      value={beltColor}
                      onChange={(e) => setBeltColor(e.target.value)}
                      className={inputClass}
                    >
                      {ENROLL_BELTS.map((belt) => (
                        <option key={belt} value={belt}>
                          {belt}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <fieldset>
                  <legend className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                    Member type
                  </legend>
                  <div className="mt-1.5 flex gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-ink">
                      <input
                        type="radio"
                        name="ageGroup"
                        checked={ageGroup === "adult"}
                        onChange={() => setAgeGroup("adult")}
                        className="text-brand-red focus:ring-brand-red/30"
                      />
                      Adult
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-ink">
                      <input
                        type="radio"
                        name="ageGroup"
                        checked={ageGroup === "child"}
                        onChange={() => setAgeGroup("child")}
                        className="text-brand-red focus:ring-brand-red/30"
                      />
                      Child
                    </label>
                  </div>
                </fieldset>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                    Date of birth
                  </span>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className={inputClass}
                  />
                </label>

                {ageGroup === "child" ? (
                  <div className="space-y-2 rounded-lg border border-black/[0.06] bg-white p-3">
                    <p className="text-xs font-semibold text-brand-ink">Parent / guardian</p>
                    <input
                      type="text"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      className={inputClass}
                      placeholder="Full name"
                      required
                    />
                    <input
                      type="tel"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      className={inputClass}
                      placeholder="Phone"
                      required
                    />
                  </div>
                ) : null}

                {enrollError ? <p className="text-xs text-red-700">{enrollError}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={enrollSaving}
                    className="flex-1 rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:opacity-50"
                  >
                    {enrollSaving ? "Enrolling…" : "Confirm Enrollment"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEnrollOpen(false);
                      setEnrollError(null);
                    }}
                    className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-brand-muted hover:text-brand-ink"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </KioskSnakeBorderCard>
      </div>
    </div>
  );
}
