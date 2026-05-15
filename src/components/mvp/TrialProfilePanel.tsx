"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import { formatDate, formatTrialDaysLeft, fullName } from "@/lib/mvpShared";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import { isTrialExpired, type StaffMemberNote, type StaffTrialRow } from "@/lib/staffDashboard";

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
  const [noteBody, setNoteBody] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [contacted, setContacted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

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

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    setNoteError(null);
    if (!noteBody.trim()) {
      setNoteError("Enter a note first.");
      return;
    }
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/mvp/people/${trial.id}/notes`, {
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
      onTrialUpdate({ ...trial, notes: [note, ...trial.notes] });
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
      const res = await fetch(`/api/mvp/people/${trial.id}/notes/${noteId}`, {
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
      onTrialUpdate({
        ...trial,
        notes: trial.notes.map((n) => (n.id === noteId ? { ...n, body: updated.body } : n)),
      });
      cancelEditNote();
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
            </dl>
          </div>


          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            <h3 className="text-sm font-semibold text-brand-ink">
              Notes {trial.notes.length > 0 ? `(${trial.notes.length})` : ""}
            </h3>
            {trial.notes.length === 0 ? (
              <p className="mt-1 text-sm text-brand-muted">No notes yet.</p>
            ) : (
              <ul
                className={`mt-2 space-y-2 ${showContactComplete ? "max-h-28 overflow-y-auto" : "max-h-40 overflow-y-auto"}`}
              >
                {trial.notes.map((n) => (
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
                id="trial-profile-note"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                rows={showContactComplete ? 1 : 2}
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
                  Contacted about expired trial — move to Guests (trial completed)
                </span>
              </label>
              {completeError ? <p className="text-xs text-red-700">{completeError}</p> : null}
              <button
                type="button"
                disabled={!contacted || completing}
                onClick={() => void completeContact()}
                className="w-full rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {completing ? "Saving…" : "Confirm & Move To Guests"}
              </button>
            </div>
          ) : null}
        </KioskSnakeBorderCard>
      </div>
    </div>
  );
}
