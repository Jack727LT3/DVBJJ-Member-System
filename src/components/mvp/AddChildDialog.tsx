"use client";

import { type FormEvent, useState } from "react";
import { beltSelectOptions, fullName } from "@/lib/mvpShared";
import type { StaffMemberParent, StaffMemberRow } from "@/lib/staffDashboard";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

type AddChildDialogProps = {
  parentMember: StaffMemberRow;
  onClose: () => void;
  onChildAdded: (member: StaffMemberRow) => void;
};

export default function AddChildDialog({ parentMember, onClose, onChildAdded }: AddChildDialogProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [beltColor, setBeltColor] = useState("White");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardian: StaffMemberParent = {
    name: fullName(parentMember.firstName, parentMember.lastName),
    phone: parentMember.phone,
    email: parentMember.email ?? null,
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payment = Number.parseFloat(monthlyPayment);
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    if (!Number.isFinite(payment) || payment <= 0) {
      setError("Enter a valid monthly payment.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/mvp/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: parentMember.phone,
          email: parentMember.email ?? undefined,
          monthlyPayment: payment,
          beltColor,
          ageGroup: "child",
          dateOfBirth: dateOfBirth.trim() || null,
          parents: [guardian],
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.member) {
        setError(json.error ?? "Could not add child.");
        return;
      }
      onChildAdded(json.member as StaffMemberRow);
      onClose();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-child-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-black/[0.08] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-child-title" className="text-lg font-semibold text-brand-ink">
          Add child member
        </h3>
        <p className="mt-1 text-sm text-brand-muted">
          Creates a child on the same phone as {fullName(parentMember.firstName, parentMember.lastName)}. Guardian:{" "}
          {guardian.name}.
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-xs font-medium text-brand-ink">
            First name
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} required />
          </label>
          <label className="block text-xs font-medium text-brand-ink">
            Last name
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} required />
          </label>
          <label className="block text-xs font-medium text-brand-ink">
            Date of birth
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs font-medium text-brand-ink">
            Belt
            <select value={beltColor} onChange={(e) => setBeltColor(e.target.value)} className={inputClass}>
              {beltSelectOptions("child").map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-brand-ink">
            $ / Month
            <input
              type="number"
              min={1}
              value={monthlyPayment}
              onChange={(e) => setMonthlyPayment(e.target.value)}
              className={inputClass}
              required
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-55"
            >
              {saving ? "Saving…" : "Add child"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-brand-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
