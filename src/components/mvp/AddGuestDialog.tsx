"use client";

import { type FormEvent, useState } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import ModalPortal from "@/components/mvp/ModalPortal";
import { normalizePhone } from "@/lib/phone";
import type { StaffGuestRow } from "@/lib/staffDashboard";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

type AddGuestDialogProps = {
  open: boolean;
  onClose: () => void;
  onGuestAdded: (guest: StaffGuestRow) => void;
};

export default function AddGuestDialog({ open, onClose, onGuestAdded }: AddGuestDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  if (!open) return null;

  function resetForm() {
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setFormError(null);
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
      const res = await fetch("/api/mvp/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone,
          email: email.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error ?? "Could not add guest.");
        return;
      }

      onGuestAdded(json.guest as StaffGuestRow);
      handleClose();
    } catch {
      setFormError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-guest-title"
        onClick={handleClose}
      >
        <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
          <KioskSnakeBorderCard wide innerClassName="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] pb-4">
              <div>
                <h2 id="add-guest-title" className="text-xl font-semibold text-brand-ink">
                  Add guest
                </h2>
                <p className="mt-1 text-sm text-brand-muted">
                  Someone who has not started a trial yet — their first kiosk check-in begins the 7-day trial.
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

            <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
              <div>
                <label className="text-xs font-medium text-brand-ink" htmlFor="guest-add-first">
                  First name
                </label>
                <input
                  id="guest-add-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink" htmlFor="guest-add-last">
                  Last name
                </label>
                <input
                  id="guest-add-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                  autoComplete="family-name"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink" htmlFor="guest-add-phone">
                  Phone
                </label>
                <input
                  id="guest-add-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink" htmlFor="guest-add-email">
                  Email <span className="text-brand-muted">(optional)</span>
                </label>
                <input
                  id="guest-add-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  inputMode="email"
                  autoComplete="email"
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
                  {submitting ? "Saving…" : "Add guest"}
                </button>
              </div>
            </form>
          </KioskSnakeBorderCard>
        </div>
      </div>
    </ModalPortal>
  );
}
