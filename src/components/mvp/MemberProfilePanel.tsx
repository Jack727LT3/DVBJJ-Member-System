"use client";

import { type FormEvent, useEffect, useState } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import PersonNotesSection from "@/components/mvp/PersonNotesSection";
import WaiverHistorySection from "@/components/mvp/WaiverHistorySection";
import MemberAttendanceSection from "@/components/mvp/MemberAttendanceSection";
import PersonParentsSection from "@/components/mvp/PersonParentsSection";
import AddChildDialog from "@/components/mvp/AddChildDialog";
import AddParentDialog from "@/components/mvp/AddParentDialog";
import {
  beltSelectOptions,
  formatDate,
  formatMemberAge,
  formatMoney,
  formatWhen,
  fullName,
} from "@/lib/mvpShared";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import {
  STAFF_FLAG_OPTIONS,
  staffFlagLabel,
  type StaffFlagType,
} from "@/lib/staffFlags";
import { isChildMember, type MemberAgeGroup, type StaffGuestRow, type StaffMemberRow } from "@/lib/staffDashboard";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";


function memberStateLabel(state: StaffMemberRow["memberState"]) {
  if (state === "active" || state === null) return "Active";
  if (state === "delinquent") return "Flagged · Billing";
  if (state === "frozen") return "Frozen";
  if (state === "canceled") return "Canceled";
  return "—";
}

function memberStateClass(state: StaffMemberRow["memberState"]) {
  if (state === "delinquent" || state === "frozen" || state === "canceled") {
    return "text-brand-red font-medium";
  }
  return "text-brand-ink";
}

function Detail({
  label,
  value,
  valueClass,
  className = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm ${valueClass ?? "text-brand-ink"}`}>{value}</dd>
    </div>
  );
}

type MemberProfilePanelProps = {
  member: StaffMemberRow;
  onClose: () => void;
  onMemberUpdate: (member: StaffMemberRow) => void;
  onConvertedToGuest?: (guest: StaffGuestRow) => void;
  onChildAdded?: (member: StaffMemberRow) => void;
};

export default function MemberProfilePanel({
  member,
  onClose,
  onMemberUpdate,
  onConvertedToGuest,
  onChildAdded,
}: MemberProfilePanelProps) {
  const [editing, setEditing] = useState(false);
  const [showAddParent, setShowAddParent] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [convertSaving, setConvertSaving] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(member.firstName);
  const [lastName, setLastName] = useState(member.lastName);
  const [phone, setPhone] = useState(member.phone);
  const [email, setEmail] = useState(member.email ?? "");
  const [monthlyPayment, setMonthlyPayment] = useState(String(member.monthlyPayment ?? ""));
  const [beltColor, setBeltColor] = useState(member.beltColor ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(member.dateOfBirth ?? "");
  const [ageGroup, setAgeGroup] = useState<MemberAgeGroup>(member.ageGroup);
  const [parentName, setParentName] = useState(member.parents[0]?.name ?? "");
  const [parentPhone, setParentPhone] = useState(member.parents[0]?.phone ?? "");
  const [parentEmail, setParentEmail] = useState(member.parents[0]?.email ?? "");

  const [flagType, setFlagType] = useState<StaffFlagType | "">(member.staffFlagType ?? "");
  const [flagOther, setFlagOther] = useState(member.staffFlagOther ?? "");
  const [flagSaving, setFlagSaving] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  const statusLine =
    staffFlagLabel(member.staffFlagType, member.staffFlagOther) ?? memberStateLabel(member.memberState);

  async function saveEdits(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    const payment = Number.parseFloat(monthlyPayment);
    if (!Number.isFinite(payment) || payment <= 0) {
      setEditError("Enter a valid monthly payment.");
      return;
    }
    setEditSaving(true);
    try {
      const parents =
        ageGroup === "child" && parentName.trim() && parentPhone.trim()
          ? [{
              name: parentName.trim(),
              phone: parentPhone,
              email: parentEmail.trim() || null,
            }]
          : member.parents;
      const res = await fetch(`/api/mvp/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          email: email.trim() || null,
          monthlyPayment: payment,
          beltColor: beltColor || null,
          dateOfBirth: dateOfBirth.trim() || null,
          ageGroup,
          parents,
        }),
      });
      const json = await res.json();
      if (!res.ok && !json.member) {
        setEditError(json.error ?? "Could not save changes.");
        return;
      }
      const m = json.member as Partial<StaffMemberRow>;
      onMemberUpdate({
        ...member,
        firstName: m.firstName ?? firstName,
        lastName: m.lastName ?? lastName,
        phone: m.phone ?? phone,
        email: m.email !== undefined ? m.email : email.trim() || null,
        monthlyPayment: m.monthlyPayment ?? payment,
        beltColor: m.beltColor !== undefined ? m.beltColor : beltColor || null,
        dateOfBirth: m.dateOfBirth !== undefined ? m.dateOfBirth : dateOfBirth.trim() || null,
        ageGroup: m.ageGroup ?? ageGroup,
        parents: m.parents ?? parents,
        memberState: (m.memberState as StaffMemberRow["memberState"]) ?? member.memberState,
        staffFlagType: m.staffFlagType !== undefined ? m.staffFlagType : member.staffFlagType,
        staffFlagOther: m.staffFlagOther !== undefined ? m.staffFlagOther : member.staffFlagOther,
      });
      setEditing(false);
    } catch {
      setEditError("Something went wrong.");
    } finally {
      setEditSaving(false);
    }
  }

  async function saveFlag(e: FormEvent) {
    e.preventDefault();
    setFlagError(null);
    if (flagType === "other" && !flagOther.trim()) {
      setFlagError("Enter a short description for Other.");
      return;
    }
    setFlagSaving(true);
    try {
      const res = await fetch(`/api/mvp/members/${member.id}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagType: flagType || null,
          flagOther: flagType === "other" ? flagOther.trim() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok && !json.member) {
        setFlagError(json.error ?? "Could not update flag.");
        return;
      }
      const m = json.member as {
        staffFlagType: StaffFlagType | null;
        staffFlagOther: string | null;
        memberState: StaffMemberRow["memberState"];
      };
      onMemberUpdate({
        ...member,
        staffFlagType: m.staffFlagType,
        staffFlagOther: m.staffFlagOther,
        memberState: m.memberState,
      });
    } catch {
      setFlagError("Something went wrong.");
    } finally {
      setFlagSaving(false);
    }
  }

  async function cancelMembership() {
    if (
      !confirm(
        `Cancel membership for ${fullName(member.firstName, member.lastName)}? They will move to Guests and leave the member list.`
      )
    ) {
      return;
    }
    setCancelError(null);
    setCancelSaving(true);
    try {
      const res = await fetch(`/api/mvp/members/${member.id}/cancel-membership`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.guest) {
        setCancelError(json.error ?? "Could not cancel membership.");
        return;
      }
      onConvertedToGuest?.(json.guest as StaffGuestRow);
      onClose();
    } catch {
      setCancelError("Something went wrong.");
    } finally {
      setCancelSaving(false);
    }
  }

  async function convertToGuest() {
    if (!confirm(`Move ${fullName(member.firstName, member.lastName)} back to a guest account?`)) return;
    setConvertError(null);
    setConvertSaving(true);
    try {
      const res = await fetch(`/api/mvp/members/${member.id}/convert-to-guest`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.guest) {
        setConvertError(json.error ?? "Could not convert to guest.");
        return;
      }
      onConvertedToGuest?.(json.guest);
      onClose();
    } catch {
      setConvertError("Something went wrong.");
    } finally {
      setConvertSaving(false);
    }
  }

  const beltOptions = beltSelectOptions(ageGroup);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-profile-title"
      onClick={onClose}
    >
      <div className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <KioskSnakeBorderCard wide innerClassName="max-h-[min(88vh,720px)] overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] pb-4">
            <div className="min-w-0 flex-1 pr-2">
              <h2 id="member-profile-title" className="text-xl font-semibold text-brand-ink">
                {fullName(member.firstName, member.lastName)}
                {isChildMember(member) ? (
                  <span className="ml-2 align-middle text-sm font-medium text-brand-muted">(Child)</span>
                ) : null}
              </h2>
              <p className={`mt-1 text-sm ${memberStateClass(member.memberState)}`}>{statusLine}</p>
              <p className="mt-1 text-sm text-brand-muted">{formatPhoneDisplay(member.phone)}</p>
            </div>
            <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-2">
              {!editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-ink hover:bg-neutral-50"
                >
                  Edit
                </button>
              ) : null}
              {!editing ? (
                <button
                  type="button"
                  onClick={() => setShowAddParent(true)}
                  className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-ink hover:bg-neutral-50"
                >
                  Add parent
                </button>
              ) : null}
              {!editing && !isChildMember(member) ? (
                <button
                  type="button"
                  onClick={() => setShowAddChild(true)}
                  className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-ink hover:bg-neutral-50"
                >
                  Add child
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-muted hover:bg-neutral-50 hover:text-brand-ink"
              >
                Close
              </button>
            </div>
          </div>

          {editing ? (
            <form className="mt-5 space-y-4" onSubmit={saveEdits}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium text-brand-ink">
                  First name
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} required />
                </label>
                <label className="block text-xs font-medium text-brand-ink">
                  Last name
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} required />
                </label>
              </div>
              <label className="block text-xs font-medium text-brand-ink">
                Phone
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} required />
              </label>
              <label className="block text-xs font-medium text-brand-ink">
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
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
                <label className="block text-xs font-medium text-brand-ink">
                  Belt
                  <select value={beltColor} onChange={(e) => setBeltColor(e.target.value)} className={inputClass}>
                    <option value="">—</option>
                    {beltOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-medium text-brand-ink">
                Date of birth
                <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClass} />
              </label>
              <fieldset>
                <legend className="text-xs font-medium text-brand-ink">Member type</legend>
                <div className="mt-1.5 flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={ageGroup === "adult"}
                      onChange={() => setAgeGroup("adult")}
                    />
                    Adult
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={ageGroup === "child"}
                      onChange={() => setAgeGroup("child")}
                    />
                    Child
                  </label>
                </div>
              </fieldset>
              {ageGroup === "child" ? (
                <div className="space-y-2 rounded-lg border border-black/[0.06] bg-neutral-50/80 p-3">
                  <input
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className={inputClass}
                    placeholder="Parent name"
                  />
                  <input
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    className={inputClass}
                    placeholder="Parent phone"
                  />
                  <input
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    className={inputClass}
                    placeholder="Parent email (optional)"
                  />
                </div>
              ) : null}
              {editError ? <p className="text-sm text-red-700">{editError}</p> : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-55"
                >
                  {editSaving ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-brand-muted"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail label="Age" value={formatMemberAge(member.dateOfBirth)} />
                <Detail
                  label="Member type"
                  value={isChildMember(member) ? "Child" : "Adult"}
                />
                <Detail label="Date Of Birth" value={member.dateOfBirth ? formatDate(member.dateOfBirth) : "—"} />
                <Detail label="Email" value={member.email ?? "—"} className="sm:col-span-2" />
                <Detail label="Belt" value={member.beltColor ?? "—"} />
                <Detail label="$ / Mo" value={formatMoney(member.monthlyPayment)} />
                <Detail label="Last Visit" value={formatWhen(member.lastVisit)} />
                <Detail label="Total Visits" value={String(member.totalVisits)} />
                <Detail label="Member Since" value={formatDate(member.joinDate)} />
              </dl>

              {member.parents.length > 0 ? (
                <PersonParentsSection parents={member.parents} />
              ) : null}

              <MemberAttendanceSection member={member} onMemberUpdate={onMemberUpdate} />

              {member.memberState !== "canceled" ? (
                <section className="mt-6 border-t border-black/[0.06] pt-5">
                  <h3 className="text-sm font-semibold text-brand-ink">Membership</h3>
                  <p className="mt-1 text-sm text-brand-muted">
                    Canceling removes them from the member roster and places them in Guests.
                  </p>
                  {cancelError ? <p className="mt-2 text-sm text-red-700">{cancelError}</p> : null}
                  <button
                    type="button"
                    onClick={() => void cancelMembership()}
                    disabled={cancelSaving}
                    className="mt-3 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-brand-red shadow-sm hover:bg-red-50 disabled:opacity-55"
                  >
                    {cancelSaving ? "Canceling…" : "Cancel membership"}
                  </button>
                </section>
              ) : (
                <section className="mt-6 border-t border-black/[0.06] pt-5">
                  <h3 className="text-sm font-semibold text-brand-ink">Account status</h3>
                  <p className="mt-1 text-sm text-brand-muted">
                    This member is canceled. You can move them back to a guest account to re-engage.
                  </p>
                  {convertError ? <p className="mt-2 text-sm text-red-700">{convertError}</p> : null}
                  <button
                    type="button"
                    onClick={() => void convertToGuest()}
                    disabled={convertSaving}
                    className="mt-3 rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50 disabled:opacity-55"
                  >
                    {convertSaving ? "Converting…" : "Change to guest"}
                  </button>
                </section>
              )}

              <section className="mt-6 border-t border-black/[0.06] pt-5">
                <h3 className="text-sm font-semibold text-brand-ink">Staff flag</h3>
                <form className="mt-3 space-y-3" onSubmit={saveFlag}>
                  <select
                    value={flagType}
                    onChange={(e) => setFlagType(e.target.value as StaffFlagType | "")}
                    className={inputClass}
                  >
                    <option value="">No flag</option>
                    {STAFF_FLAG_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {flagType === "other" ? (
                    <input
                      value={flagOther}
                      onChange={(e) => setFlagOther(e.target.value)}
                      className={inputClass}
                      placeholder="Describe flag…"
                      maxLength={200}
                    />
                  ) : null}
                  {flagError ? <p className="text-sm text-red-700">{flagError}</p> : null}
                  <button
                    type="submit"
                    disabled={flagSaving}
                    className="rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50 disabled:opacity-55"
                  >
                    {flagSaving ? "Saving…" : "Update flag"}
                  </button>
                </form>
              </section>

              <WaiverHistorySection personId={member.id} />

              <PersonNotesSection
                personId={member.id}
                notes={member.notes}
                notesApiBase="/api/mvp/members"
                onNotesChange={(notes) => onMemberUpdate({ ...member, notes })}
                placeholder="Quick note about this member…"
              />
            </>
          )}
        </KioskSnakeBorderCard>
      </div>
      {showAddParent ? (
        <AddParentDialog
          personId={member.id}
          existingParents={member.parents}
          onClose={() => setShowAddParent(false)}
          onSaved={(parents) => onMemberUpdate({ ...member, parents })}
        />
      ) : null}
      {showAddChild ? (
        <AddChildDialog
          parentMember={member}
          onClose={() => setShowAddChild(false)}
          onChildAdded={(child) => onChildAdded?.(child)}
        />
      ) : null}
    </div>
  );
}
