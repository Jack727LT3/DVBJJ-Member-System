"use client";

import { type FormEvent, useState } from "react";
import CollapsibleSection from "@/components/mvp/CollapsibleSection";
import { BELT_TIERS } from "@/lib/mvpShared";
import type { MemberAgeGroup, StaffMemberRow } from "@/lib/staffDashboard";

const inputClass =
  "w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

const BELT_OPTIONS = ["", ...[...BELT_TIERS].reverse()];

type AddMembersSectionProps = {
  open: boolean;
  onToggle: () => void;
  onMemberAdded: (member: StaffMemberRow) => void;
};

export default function AddMembersSection({ open, onToggle, onMemberAdded }: AddMembersSectionProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [beltColor, setBeltColor] = useState("");
  const [ageGroup, setAgeGroup] = useState<MemberAgeGroup>("adult");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function resetForm() {
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setMonthlyPayment("");
    setBeltColor("");
    setAgeGroup("adult");
    setDateOfBirth("");
    setParentName("");
    setParentPhone("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/mvp/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          email,
          monthlyPayment,
          beltColor: beltColor || null,
          ageGroup,
          dateOfBirth: dateOfBirth.trim() || null,
          parents:
            ageGroup === "child"
              ? [{ name: parentName.trim(), phone: parentPhone }]
              : [],
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.member) {
        setError(json.error ?? "Could not add member.");
        return;
      }
      const member = json.member as StaffMemberRow;
      onMemberAdded(member);
      resetForm();
      setSuccess(
        json.source === "demo"
          ? `${member.firstName} ${member.lastName} added (demo — run Supabase migration 0013 for live saves).`
          : `${member.firstName} ${member.lastName} added to the roster.`
      );
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      title="Add Members"
      subtitle="Enter member info manually — same basics as a new trial signup, plus membership details."
      open={open}
      onToggle={onToggle}
    >
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="add-first">
                First Name
              </label>
              <input
                id="add-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
                className={`mt-1.5 ${inputClass}`}
                placeholder="First name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="add-last">
                Last Name
              </label>
              <input
                id="add-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
                className={`mt-1.5 ${inputClass}`}
                placeholder="Last name"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-brand-ink" htmlFor="add-phone">
              Phone Number
            </label>
            <input
              id="add-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              required
              className={`mt-1.5 ${inputClass}`}
              placeholder="(555) 123-4567"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-brand-ink" htmlFor="add-email">
              Email
            </label>
            <input
              id="add-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              autoComplete="email"
              required
              className={`mt-1.5 ${inputClass}`}
              placeholder="member@example.com"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="add-payment">
                $ / Month
              </label>
              <input
                id="add-payment"
                type="number"
                min={1}
                step={1}
                value={monthlyPayment}
                onChange={(e) => setMonthlyPayment(e.target.value)}
                required
                className={`mt-1.5 ${inputClass}`}
                placeholder="109"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="add-belt">
                Belt Color <span className="font-normal text-brand-muted">(optional)</span>
              </label>
              <select
                id="add-belt"
                value={beltColor}
                onChange={(e) => setBeltColor(e.target.value)}
                className={`mt-1.5 ${inputClass}`}
              >
                {BELT_OPTIONS.map((belt) => (
                  <option key={belt || "none"} value={belt}>
                    {belt || "— None —"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset>
            <legend className="text-xs font-medium text-brand-ink">Member type</legend>
            <div className="mt-1.5 flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-ink">
                <input
                  type="radio"
                  name="add-age-group"
                  checked={ageGroup === "adult"}
                  onChange={() => setAgeGroup("adult")}
                  className="text-brand-red focus:ring-brand-red/30"
                />
                Adult
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-ink">
                <input
                  type="radio"
                  name="add-age-group"
                  checked={ageGroup === "child"}
                  onChange={() => setAgeGroup("child")}
                  className="text-brand-red focus:ring-brand-red/30"
                />
                Child
              </label>
            </div>
          </fieldset>

          <div>
            <label className="text-xs font-medium text-brand-ink" htmlFor="add-dob">
              Date of birth <span className="font-normal text-brand-muted">(optional)</span>
            </label>
            <input
              id="add-dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
          </div>

          {ageGroup === "child" ? (
            <div className="space-y-3 rounded-lg border border-black/[0.06] bg-neutral-50/80 p-4">
              <p className="text-xs font-semibold text-brand-ink">Parent / guardian</p>
              <input
                type="text"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                className={inputClass}
                placeholder="Full name"
                required
              />
              <input
                type="tel"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                className={inputClass}
                placeholder="Phone"
                required
              />
            </div>
          ) : null}

          {error ? (
            <p className="text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-sm font-medium text-emerald-800" role="status">
              {success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-55"
          >
            {saving ? "Adding…" : "Add Member"}
          </button>
        </form>
      </div>
    </CollapsibleSection>
  );
}
