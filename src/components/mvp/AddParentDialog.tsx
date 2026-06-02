"use client";

import { type FormEvent, useState } from "react";
import type { StaffMemberParent } from "@/lib/staffDashboard";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

type AddParentDialogProps = {
  personId: string;
  existingParents: StaffMemberParent[];
  onClose: () => void;
  onSaved: (parents: StaffMemberParent[]) => void;
};

export default function AddParentDialog({
  personId,
  existingParents,
  onClose,
  onSaved,
}: AddParentDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Parent name is required.");
      return;
    }
    if (normalizePhone(phone).length < 10) {
      setError("Enter a valid phone number.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/mvp/people/${personId}/parents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok && !json.parents) {
        setError(json.error ?? "Could not save parent.");
        return;
      }
      const parents = (json.parents ?? []) as StaffMemberParent[];
      onSaved(parents.length > 0 ? parents : [...existingParents, {
        name: name.trim(),
        phone: normalizePhone(phone),
        email: email.trim() || null,
      }]);
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
      aria-labelledby="add-parent-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-black/[0.08] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-parent-title" className="text-lg font-semibold text-brand-ink">
          Add parent / guardian
        </h3>
        <p className="mt-1 text-sm text-brand-muted">Phone is required. Email is optional.</p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-xs font-medium text-brand-ink">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
          </label>
          <label className="block text-xs font-medium text-brand-ink">
            Phone
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              required
            />
          </label>
          <label className="block text-xs font-medium text-brand-ink">
            Email <span className="font-normal text-brand-muted">(optional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-55"
            >
              {saving ? "Saving…" : "Save"}
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
