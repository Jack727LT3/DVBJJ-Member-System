"use client";

import { type FormEvent, useState } from "react";
import { formatDate } from "@/lib/mvpShared";
import type { StaffMemberNote } from "@/lib/staffDashboard";

const inputClass =
  "w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

type PersonNotesSectionProps = {
  personId: string;
  notes: StaffMemberNote[];
  notesApiBase: string;
  onNotesChange: (notes: StaffMemberNote[]) => void;
  compact?: boolean;
  placeholder?: string;
};

export default function PersonNotesSection({
  personId,
  notes,
  notesApiBase,
  onNotesChange,
  compact = false,
  placeholder = "Add a note…",
}: PersonNotesSectionProps) {
  const [noteBody, setNoteBody] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    setNoteError(null);
    if (!noteBody.trim()) {
      setNoteError("Enter a note first.");
      return;
    }
    setNoteSaving(true);
    try {
      const res = await fetch(`${notesApiBase}/${personId}/notes`, {
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
      onNotesChange([note, ...notes]);
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
      const res = await fetch(`${notesApiBase}/${personId}/notes/${noteId}`, {
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
      onNotesChange(notes.map((n) => (n.id === noteId ? { ...n, body: updated.body } : n)));
      cancelEditNote();
    } catch {
      setEditError("Something went wrong.");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteNote(noteId: string) {
    setDeletingId(noteId);
    try {
      const res = await fetch(`${notesApiBase}/${personId}/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        setNoteError(json.error ?? "Could not delete note.");
        return;
      }
      onNotesChange(notes.filter((n) => n.id !== noteId));
      if (editingNoteId === noteId) cancelEditNote();
    } catch {
      setNoteError("Something went wrong.");
    } finally {
      setDeletingId(null);
    }
  }

  const listMaxH = compact ? "max-h-28" : "max-h-56";

  return (
    <section className={compact ? "" : "mt-6 border-t border-black/[0.06] pt-5"}>
      <h3 className="text-sm font-semibold text-brand-ink">
        Notes {notes.length > 0 ? `(${notes.length})` : ""}
      </h3>
      {notes.length === 0 ? (
        <p className="mt-2 text-sm text-brand-muted">No notes yet.</p>
      ) : (
        <ul className={`mt-3 space-y-2 overflow-y-auto ${listMaxH}`}>
          {notes.map((n) => (
            <li
              key={n.id}
              className={`relative rounded-lg border border-black/[0.06] bg-neutral-50/80 p-2.5 text-sm ${
                editingNoteId === n.id ? "" : "pr-20"
              }`}
            >
              {editingNoteId !== n.id ? (
                <div className="absolute right-2 top-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => startEditNote(n)}
                    disabled={editingNoteId !== null || deletingId !== null}
                    className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-brand-muted hover:text-brand-ink disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteNote(n.id)}
                    disabled={deletingId === n.id || editingNoteId !== null}
                    aria-label="Delete note"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-black/10 bg-white text-sm font-semibold text-brand-muted hover:border-red-200 hover:text-red-700 disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
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
                        className="rounded-md bg-brand-red px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-55"
                      >
                        {editSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditNote}
                        disabled={editSaving}
                        className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-brand-muted"
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
        <textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          rows={compact ? 1 : 2}
          className={inputClass}
          placeholder={placeholder}
          aria-label="Add note"
        />
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
  );
}
