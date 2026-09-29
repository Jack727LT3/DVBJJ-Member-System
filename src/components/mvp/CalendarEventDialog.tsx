"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import ModalPortal from "@/components/mvp/ModalPortal";
import type { CalendarEvent, CalendarEventKind } from "@/lib/staffCalendar";
import { fullName } from "@/lib/mvpShared";
import type { StaffGuestRow } from "@/lib/staffDashboard";
import type { OutOfStoreLead } from "@/lib/outOfStoreLeads";

const inputClass =
  "mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

type CalendarEventDialogProps = {
  open: boolean;
  initialDate: string;
  initialKind?: CalendarEventKind;
  prefillPerson?: { id: string; name: string; source: "guest" | "lead" } | null;
  guests: StaffGuestRow[];
  outOfStoreLeads: OutOfStoreLead[];
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
};

export default function CalendarEventDialog({
  open,
  initialDate,
  initialKind = "appointment",
  prefillPerson = null,
  guests,
  outOfStoreLeads,
  onClose,
  onSaved,
}: CalendarEventDialogProps) {
  const [kind, setKind] = useState<"appointment" | "scheduled_trial">(
    initialKind === "scheduled_trial" ? "scheduled_trial" : "appointment"
  );
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [startDate, setStartDate] = useState(initialDate);
  const [personKey, setPersonKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind === "scheduled_trial" ? "scheduled_trial" : "appointment");
    setStartDate(initialDate);
    setNotes("");
    setError(null);
    if (prefillPerson) {
      setPersonKey(`${prefillPerson.source}:${prefillPerson.id}`);
      setTitle(prefillPerson.name);
    } else {
      setPersonKey("");
      setTitle("");
    }
  }, [open, initialDate, initialKind, prefillPerson]);

  const personOptions = useMemo(() => {
    const guestOpts = guests.map((g) => ({
      key: `guest:${g.id}`,
      id: g.id,
      label: `${fullName(g.firstName, g.lastName)} · Guest`,
    }));
    const leadOpts = outOfStoreLeads.map((l) => ({
      key: `lead:${l.id}`,
      id: l.id,
      label: `${fullName(l.firstName, l.lastName)} · Out-of-gym`,
    }));
    return [...guestOpts, ...leadOpts];
  }, [guests, outOfStoreLeads]);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const personId = personKey.includes(":") ? personKey.split(":")[1]! : null;
    if (kind === "scheduled_trial" && !personId) {
      setError("Pick a guest or out-of-gym lead for the trial.");
      return;
    }
    if (!title.trim()) {
      setError("Add a title.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/mvp/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          startDate,
          endDate: startDate,
          notes: notes.trim() || null,
          personId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.event) {
        setError(json.error ?? "Could not save.");
        return;
      }
      onSaved(json.event as CalendarEvent);
      onClose();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-white p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-semibold text-brand-ink">
            {kind === "scheduled_trial" ? "Schedule trial" : "Add to calendar"}
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            {kind === "scheduled_trial"
              ? "Grey on the calendar until the start day, then a full 7-day trial bar."
              : "Appointments show on a single day — useful for guest / lead visits."}
          </p>

          <form className="mt-4 space-y-3" onSubmit={submit}>
            <fieldset>
              <legend className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Type</legend>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setKind("appointment")}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                    kind === "appointment" ? "bg-brand-ink text-white" : "border border-black/10 text-brand-ink"
                  }`}
                >
                  Appointment
                </button>
                <button
                  type="button"
                  onClick={() => setKind("scheduled_trial")}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                    kind === "scheduled_trial" ? "bg-brand-ink text-white" : "border border-black/10 text-brand-ink"
                  }`}
                >
                  Trial (7 days)
                </button>
              </div>
            </fieldset>

            <label className="block text-xs font-medium text-brand-ink">
              Date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
                required
              />
            </label>

            {kind === "scheduled_trial" || personOptions.length > 0 ? (
              <label className="block text-xs font-medium text-brand-ink">
                {kind === "scheduled_trial" ? "Person" : "Link person (optional)"}
                <select
                  value={personKey}
                  onChange={(e) => {
                    setPersonKey(e.target.value);
                    const opt = personOptions.find((o) => o.key === e.target.value);
                    if (opt && !title.trim()) setTitle(opt.label.split(" · ")[0] ?? opt.label);
                  }}
                  className={inputClass}
                  required={kind === "scheduled_trial"}
                >
                  <option value="">{kind === "scheduled_trial" ? "Select…" : "None"}</option>
                  {personOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block text-xs font-medium text-brand-ink">
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
            </label>

            <label className="block text-xs font-medium text-brand-ink">
              Notes (optional)
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
            </label>

            {error ? <p className="text-xs text-red-700">{error}</p> : null}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-brand-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-black/10 px-4 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
