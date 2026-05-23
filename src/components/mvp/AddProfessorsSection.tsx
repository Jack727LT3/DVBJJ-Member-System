"use client";

import { type FormEvent, useState } from "react";
import CollapsibleSection from "@/components/mvp/CollapsibleSection";
import { fullName } from "@/lib/mvpShared";
import type { StaffProfessorRow } from "@/lib/staffDashboard";

const inputClass =
  "w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

type AddProfessorsSectionProps = {
  open: boolean;
  onToggle: () => void;
  onProfessorAdded: (professor: StaffProfessorRow) => void;
};

export default function AddProfessorsSection({
  open,
  onToggle,
  onProfessorAdded,
}: AddProfessorsSectionProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/mvp/professors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, phone, email }),
      });
      const json = await res.json();
      if (!res.ok || !json.professor) {
        setError(json.error ?? "Could not add professor.");
        return;
      }
      const professor = json.professor as StaffProfessorRow;
      onProfessorAdded(professor);
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setSuccess(`${fullName(professor.firstName, professor.lastName)} added as professor/coach.`);
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      title="Add Professors"
      subtitle="Coach or professor accounts for staff check-in — not billed as members."
      open={open}
      onToggle={onToggle}
    >
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="prof-first">
                First Name
              </label>
              <input
                id="prof-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className={`mt-1.5 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="prof-last">
                Last Name
              </label>
              <input
                id="prof-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className={`mt-1.5 ${inputClass}`}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-brand-ink" htmlFor="prof-phone">
              Phone
            </label>
            <input
              id="prof-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className={`mt-1.5 ${inputClass}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-brand-ink" htmlFor="prof-email">
              Email <span className="font-normal text-brand-muted">(optional)</span>
            </label>
            <input
              id="prof-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-800">{success}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-55"
          >
            {saving ? "Adding…" : "Add Professor"}
          </button>
        </form>
      </div>
    </CollapsibleSection>
  );
}
