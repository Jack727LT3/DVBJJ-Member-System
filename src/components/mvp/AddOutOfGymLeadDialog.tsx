"use client";

import { type FormEvent, useState } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import ModalPortal from "@/components/mvp/ModalPortal";
import type { OutOfStoreLead } from "@/lib/outOfStoreLeads";
import { parseLeadCsv } from "@/lib/parseLeadCsv";
import { normalizePhone } from "@/lib/phone";

const INQUIRY_OPTIONS = [
  "Website",
  "Phone call",
  "Online signup",
  "Social media",
  "Referral",
  "Other",
] as const;

const inputClass =
  "mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

type AddOutOfGymLeadDialogProps = {
  open: boolean;
  source: "live" | "demo";
  onClose: () => void;
  onLeadAdded: (lead: OutOfStoreLead, source: "live" | "demo") => void;
  onCsvImported: () => void;
};

export default function AddOutOfGymLeadDialog({
  open,
  source,
  onClose,
  onLeadAdded,
  onCsvImported,
}: AddOutOfGymLeadDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [inquirySource, setInquirySource] = useState<string>(INQUIRY_OPTIONS[0]);
  const [notes, setNotes] = useState("");

  if (!open) return null;

  function resetForm() {
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setInquirySource(INQUIRY_OPTIONS[0]);
    setFormError(null);
    setCsvMessage(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!firstName.trim() || !lastName.trim() || normalizePhone(phone).length < 4) {
      setFormError("First name, last name, and phone are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/mvp/out-of-store-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone,
          email: email.trim() || undefined,
          inquirySource,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error ?? "Could not add lead.");
        return;
      }

      onLeadAdded(json.lead as OutOfStoreLead, (json.source as "live" | "demo") ?? source);
      handleClose();
    } catch {
      setFormError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCsvFile(file: File) {
    setCsvMessage(null);
    setCsvImporting(true);
    try {
      const text = await file.text();
      const parsed = parseLeadCsv(text);
      if (!parsed.ok) {
        setCsvMessage(parsed.error);
        return;
      }
      const res = await fetch("/api/mvp/out-of-store-leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: parsed.leads }),
      });
      const json = await res.json();
      if (!res.ok && !json.imported) {
        setCsvMessage(json.error ?? "Import failed.");
        return;
      }
      setCsvMessage(`Imported ${json.imported ?? parsed.leads.length} lead(s).`);
      onCsvImported();
    } catch {
      setCsvMessage("Could not read CSV file.");
    } finally {
      setCsvImporting(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-oog-lead-title"
        onClick={handleClose}
      >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <KioskSnakeBorderCard wide innerClassName="max-h-[min(88vh,640px)] overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] pb-4">
            <div>
              <h2 id="add-oog-lead-title" className="text-xl font-semibold text-brand-ink">
                Add out-of-gym lead
              </h2>
              <p className="mt-1 text-sm text-brand-muted">
                Website, phone, or online signups — have not visited the gym yet.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="shrink-0 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-muted hover:bg-neutral-50 hover:text-brand-ink"
            >
              Close
            </button>
          </div>

          <div className="mt-4 flex justify-end">
            <label className="cursor-pointer rounded-lg border border-black/15 bg-white px-3 py-2 text-center text-xs font-medium text-brand-ink shadow-sm hover:bg-neutral-50">
              {csvImporting ? "Importing…" : "Upload CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={csvImporting}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleCsvFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-brand-muted">
            CSV columns: first_name, last_name, phone, email, inquiry_source, notes
          </p>
          {csvMessage ? (
            <p className="mt-2 text-sm text-brand-ink" role="status">
              {csvMessage}
            </p>
          ) : null}

          <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="oog-first">
                First name
              </label>
              <input
                id="oog-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="oog-last">
                Last name
              </label>
              <input
                id="oog-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
                autoComplete="family-name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="oog-phone">
                Phone
              </label>
              <input
                id="oog-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                inputMode="tel"
                autoComplete="tel"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="oog-email">
                Email <span className="text-brand-muted">(optional)</span>
              </label>
              <input
                id="oog-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                inputMode="email"
                autoComplete="email"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-brand-ink" htmlFor="oog-source">
                How they reached out
              </label>
              <select
                id="oog-source"
                value={inquirySource}
                onChange={(e) => setInquirySource(e.target.value)}
                className={inputClass}
              >
                {INQUIRY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-brand-ink" htmlFor="oog-notes">
                Notes <span className="text-brand-muted">(optional)</span>
              </label>
              <textarea
                id="oog-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="What they asked about, best time to call, etc."
              />
            </div>

            {formError ? (
              <p className="sm:col-span-2 text-sm font-medium text-red-700" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-brand-red px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-hover disabled:opacity-55 sm:w-auto sm:min-w-[200px]"
              >
                {submitting ? "Saving…" : "Add lead"}
              </button>
            </div>
          </form>
        </KioskSnakeBorderCard>
      </div>
      </div>
    </ModalPortal>
  );
}
