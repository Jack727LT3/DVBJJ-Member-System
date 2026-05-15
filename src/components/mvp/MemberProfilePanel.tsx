"use client";

import { type FormEvent, useEffect, useState } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import { formatDate, formatMemberAge, formatMoney, formatWhen, fullName } from "@/lib/mvpShared";
import { formatPhoneDisplay } from "@/lib/phone";
import { isChildMember, type StaffMemberNote, type StaffMemberRow } from "@/lib/staffDashboard";
import { normalizePhone } from "@/lib/phone";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

function memberStateLabel(state: StaffMemberRow["memberState"]) {
  if (state === "active" || state === null) return "Active";
  if (state === "delinquent") return "Flagged · Billing";
  if (state === "frozen") return "Frozen";
  if (state === "canceled") return "Canceled";
  return "—";
}

function memberStateClass(state: StaffMemberRow["memberState"]) {
  if (state === "delinquent" || state === "frozen" || state === "canceled") {
    return "text-brand-red font-medium";
  }
  return "text-brand-ink";
}

function Detail({
  label,
  value,
  valueClass,
  className = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm ${valueClass ?? "text-brand-ink"}`}>{value}</dd>
    </div>
  );
}

type MemberProfilePanelProps = {
  member: StaffMemberRow;
  onClose: () => void;
  onMemberUpdate: (member: StaffMemberRow) => void;
};

export default function MemberProfilePanel({ member, onClose, onMemberUpdate }: MemberProfilePanelProps) {
  const [noteBody, setNoteBody] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
      const res = await fetch(`/api/mvp/members/${member.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      const json = await res.json();
      if (!res.ok && !json.note) {
        setNoteError(json.error ?? "Could not save note.");
        return;
      }
      const note = json.note as { id: string; body: string; createdAt: string };
      onMemberUpdate({ ...member, notes: [note, ...member.notes] });
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
      const res = await fetch(`/api/mvp/members/${member.id}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      const json = await res.json();
      if (!res.ok && !json.note) {
        setEditError(json.error ?? "Could not update note.");
        return;
      }
      const updated = json.note as StaffMemberNote;
      onMemberUpdate({
        ...member,
        notes: member.notes.map((n) => (n.id === noteId ? { ...n, body: updated.body } : n)),
      });
      cancelEditNote();
    } catch {
      setEditError("Something went wrong.");
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-profile-title"
      onClick={onClose}
    >
      <div className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <KioskSnakeBorderCard wide innerClassName="max-h-[min(88vh,720px)] overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] pb-4">
            <div className="min-w-0 flex-1 pr-2">
              <h2 id="member-profile-title" className="text-xl font-semibold text-brand-ink">
                {fullName(member.firstName, member.lastName)}
                {isChildMember(member) ? (
                  <span className="ml-2 align-middle text-sm font-medium text-brand-muted">(Child)</span>
                ) : null}
              </h2>
              <p className={`mt-1 text-sm ${memberStateClass(member.memberState)}`}>
                {memberStateLabel(member.memberState)}
              </p>
              <p className="mt-1 text-sm text-brand-muted">{formatPhoneDisplay(member.phone)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-muted hover:bg-neutral-50 hover:text-brand-ink"
            >
              Close
            </button>
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Detail label="Age" value={formatMemberAge(member.dateOfBirth)} />
            <Detail
              label="Date Of Birth"
              value={member.dateOfBirth ? formatDate(member.dateOfBirth) : "—"}
            />
            <Detail label="Email" value={member.email ?? "—"} className="sm:col-span-2" />
            <Detail label="Belt" value={member.beltColor ?? "—"} />
            <Detail label="$ / Mo" value={formatMoney(member.monthlyPayment)} />
            <Detail label="Last Visit" value={formatWhen(member.lastVisit)} />
            <Detail label="Total Visits" value={String(member.totalVisits)} />
            <Detail label="Member Since" value={formatDate(member.joinDate)} />
            <Detail
              label="Account"
              value={memberStateLabel(member.memberState)}
              valueClass={memberStateClass(member.memberState)}
            />
          </dl>

          {isChildMember(member) && member.parents.length > 0 ? (
            <section className="mt-6 border-t border-black/[0.06] pt-5">
              <h3 className="text-sm font-semibold text-brand-ink">Parent / Guardian Contacts</h3>
              <p className="mt-1 text-xs text-brand-muted">Tap a number to call.</p>
              <ul className="mt-3 space-y-2">
                {member.parents.map((parent, index) => (
                  <li
                    key={`${parent.name}-${index}`}
                    className="rounded-lg border border-black/[0.06] bg-neutral-50/80 px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-brand-ink">{parent.name}</p>
                    <a
                      href={`tel:${normalizePhone(parent.phone)}`}
                      className="mt-0.5 inline-block text-sm font-medium text-brand-red hover:underline"
                    >
                      {formatPhoneDisplay(parent.phone)}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-6 border-t border-black/[0.06] pt-5">
            <h3 className="text-sm font-semibold text-brand-ink">
              Notes {member.notes.length > 0 ? `(${member.notes.length})` : ""}
            </h3>
            {member.notes.length === 0 ? (
              <p className="mt-2 text-sm text-brand-muted">No notes yet.</p>
            ) : (
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {member.notes.map((n) => (
                  <li
                    key={n.id}
                    className={`relative rounded-lg border border-black/[0.06] bg-neutral-50/80 p-2.5 text-sm ${
                      editingNoteId === n.id ? "" : "pr-14"
                    }`}
                  >
                    {editingNoteId !== n.id ? (
                      <button
                        type="button"
                        onClick={() => startEditNote(n)}
                        disabled={editingNoteId !== null}
                        className="absolute right-2 top-2 rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-brand-muted hover:border-brand-red/30 hover:text-brand-ink disabled:opacity-50"
                      >
                        Edit
                      </button>
                    ) : null}
                    <div className="min-w-0">
                      {editingNoteId === n.id ? (
                        <form
                          className="space-y-2"
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
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={editSaving}
                              className="rounded-md bg-brand-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-red-hover disabled:opacity-55"
                            >
                              {editSaving ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditNote}
                              disabled={editSaving}
                              className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-brand-muted hover:text-brand-ink disabled:opacity-55"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <p className="text-brand-ink">{n.body}</p>
                          <p className="mt-1 text-xs text-black/45">{formatDate(n.createdAt)}</p>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form className="mt-4 space-y-3" onSubmit={submitNote}>
              <div>
                <label className="text-xs font-medium text-brand-ink" htmlFor="profile-note">
                  Add Note
                </label>
                <textarea
                  id="profile-note"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={2}
                  className={inputClass}
                  placeholder="Quick note about this member…"
                />
              </div>
              {noteError ? <p className="text-sm text-red-700">{noteError}</p> : null}
              <button
                type="submit"
                disabled={noteSaving}
                className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:opacity-55"
              >
                {noteSaving ? "Saving…" : "Save Note"}
              </button>
            </form>
          </section>
        </KioskSnakeBorderCard>
      </div>
    </div>
  );
}
