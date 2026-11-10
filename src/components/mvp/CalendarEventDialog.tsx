"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import ModalPortal from "@/components/mvp/ModalPortal";
import type { CalendarEvent, CalendarEventKind } from "@/lib/staffCalendar";
import { fullName } from "@/lib/mvpShared";
import { normalizePhone } from "@/lib/phone";
import type { StaffGuestRow } from "@/lib/staffDashboard";
import type { OutOfStoreLead } from "@/lib/outOfStoreLeads";

const inputClass =
  "mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

const MANUAL_KEY = "manual";

type CalendarEventDialogProps = {
  open: boolean;
  initialDate: string;
  initialKind?: CalendarEventKind;
  prefillPerson?: { id: string; name: string; source: "guest" | "lead" } | null;
  guests: StaffGuestRow[];
  outOfStoreLeads: OutOfStoreLead[];
  onClose: () => void;
  onSaved: (event: CalendarEvent, meta?: { source?: "live" | "demo"; guest?: StaffGuestRow }) => void;
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
  const [personKey, setPersonKey] = useState(MANUAL_KEY);
  const [manualFirst, setManualFirst] = useState("");
  const [manualLast, setManualLast] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind === "scheduled_trial" ? "scheduled_trial" : "appointment");
    setStartDate(initialDate);
    setNotes("");
    setError(null);
    setManualFirst("");
    setManualLast("");
    setManualPhone("");
    if (prefillPerson) {
      setPersonKey(`${prefillPerson.source}:${prefillPerson.id}`);
      setTitle(prefillPerson.name);
    } else {
      setPersonKey(initialKind === "scheduled_trial" ? MANUAL_KEY : "");
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

  const isManual = personKey === MANUAL_KEY;

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    let personId: string | null =
      personKey.includes(":") && !isManual ? personKey.split(":")[1]! : null;
    let createdGuest: StaffGuestRow | undefined;
    let eventTitle = title.trim();

    if (kind === "scheduled_trial" && isManual) {
      if (!manualFirst.trim() || !manualLast.trim() || normalizePhone(manualPhone).length < 4) {
        setError("Enter first name, last name, and phone for the new person.");
        return;
      }
      eventTitle = fullName(manualFirst.trim(), manualLast.trim());
      setSaving(true);
      try {
        const guestRes = await fetch("/api/mvp/guests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: manualFirst.trim(),
            lastName: manualLast.trim(),
            phone: manualPhone,
          }),
        });
        const guestJson = await guestRes.json();
        if (!guestRes.ok || !guestJson.guest) {
          setError(guestJson.error ?? "Could not create person.");
          setSaving(false);
          return;
        }
        createdGuest = guestJson.guest as StaffGuestRow;
        personId = createdGuest.id;
      } catch {
        setError("Could not create person.");
        setSaving(false);
        return;
      }
    } else if (kind === "scheduled_trial" && !personId) {
      setError("Pick a person or add them manually.");
      return;
    }

    if (!eventTitle) {
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
          title: eventTitle,
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
      onSaved(json.event as CalendarEvent, {
        source: json.source === "live" ? "live" : "demo",
        guest: createdGuest,
      });
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
          className="flex h-[min(90vh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 px-5 pt-5">
            <h2 className="text-lg font-semibold text-brand-ink">Add to calendar</h2>
            <p className="mt-1 min-h-[2.5rem] text-sm text-brand-muted">
              {kind === "scheduled_trial"
                ? "Grey until the start day, then a full 7-day trial bar."
                : "Appointments show on a single day — useful for guest / lead visits."}
            </p>
          </div>

          <form className="mt-3 flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
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
                    onClick={() => {
                      setKind("scheduled_trial");
                      if (!personKey) setPersonKey(MANUAL_KEY);
                    }}
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

              <label className="block text-xs font-medium text-brand-ink">
                {kind === "scheduled_trial" ? "Person" : "Link person (optional)"}
                <select
                  value={personKey}
                  onChange={(e) => {
                    setPersonKey(e.target.value);
                    if (e.target.value === MANUAL_KEY) {
                      if (!title.trim()) setTitle("");
                      return;
                    }
                    const opt = personOptions.find((o) => o.key === e.target.value);
                    if (opt) setTitle(opt.label.split(" · ")[0] ?? opt.label);
                  }}
                  className={inputClass}
                  required={kind === "scheduled_trial"}
                >
                  {kind === "scheduled_trial" ? (
                    <option value={MANUAL_KEY}>+ Add person manually…</option>
                  ) : (
                    <option value="">None</option>
                  )}
                  {kind !== "scheduled_trial" ? (
                    <option value={MANUAL_KEY}>+ Add person manually…</option>
                  ) : null}
                  {personOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <div
                className={`space-y-2 rounded-xl border border-black/[0.06] bg-neutral-50/80 p-3 ${
                  isManual && (kind === "scheduled_trial" || personKey === MANUAL_KEY)
                    ? ""
                    : "invisible pointer-events-none"
                }`}
                aria-hidden={!(isManual && (kind === "scheduled_trial" || personKey === MANUAL_KEY))}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                  New person
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-brand-ink">
                    First name
                    <input
                      value={manualFirst}
                      onChange={(e) => {
                        setManualFirst(e.target.value);
                        setTitle(fullName(e.target.value, manualLast));
                      }}
                      className={inputClass}
                      required={kind === "scheduled_trial" && isManual}
                      tabIndex={isManual ? undefined : -1}
                    />
                  </label>
                  <label className="block text-xs font-medium text-brand-ink">
                    Last name
                    <input
                      value={manualLast}
                      onChange={(e) => {
                        setManualLast(e.target.value);
                        setTitle(fullName(manualFirst, e.target.value));
                      }}
                      className={inputClass}
                      required={kind === "scheduled_trial" && isManual}
                      tabIndex={isManual ? undefined : -1}
                    />
                  </label>
                </div>
                <label className="block text-xs font-medium text-brand-ink">
                  Phone
                  <input
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    className={inputClass}
                    inputMode="tel"
                    required={kind === "scheduled_trial" && isManual}
                    tabIndex={isManual ? undefined : -1}
                  />
                </label>
              </div>

              <label
                className={`block text-xs font-medium text-brand-ink ${
                  !isManual || kind === "appointment" ? "" : "invisible pointer-events-none"
                }`}
              >
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                  required={!isManual || kind === "appointment"}
                  tabIndex={!isManual || kind === "appointment" ? undefined : -1}
                />
              </label>

              <label className="block text-xs font-medium text-brand-ink">
                Notes (optional)
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
              </label>

              <p className={`min-h-[1rem] text-xs text-red-700 ${error ? "" : "invisible"}`}>
                {error ?? " "}
              </p>
            </div>

            <div className="flex shrink-0 gap-2 border-t border-black/[0.06] px-5 py-3">
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
