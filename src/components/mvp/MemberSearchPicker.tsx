"use client";

import { useMemo, useState } from "react";
import { fullName } from "@/lib/mvpShared";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import type { StaffMemberRow } from "@/lib/staffDashboard";

const inputClass =
  "w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

function memberMatchesQuery(m: StaffMemberRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = fullName(m.firstName, m.lastName).toLowerCase();
  const email = (m.email ?? "").toLowerCase();
  const phoneDigits = normalizePhone(m.phone);
  const qDigits = normalizePhone(q);
  return (
    name.includes(q) ||
    email.includes(q) ||
    (qDigits.length >= 3 && phoneDigits.includes(qDigits))
  );
}

type MemberSearchPickerProps = {
  members: StaffMemberRow[];
  value: string;
  onChange: (memberId: string) => void;
  inputId?: string;
  label?: string;
};

export default function MemberSearchPicker({
  members,
  value,
  onChange,
  inputId = "member-search-picker",
  label = "Member",
}: MemberSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = members.find((m) => m.id === value) ?? null;

  const options = useMemo(() => {
    const list = members.filter((m) => memberMatchesQuery(m, query));
    return list.slice(0, 12);
  }, [members, query]);

  function pick(id: string) {
    onChange(id);
    const m = members.find((x) => x.id === id);
    if (m) setQuery(fullName(m.firstName, m.lastName));
    setOpen(false);
  }

  return (
    <div className="relative">
      <label className="text-xs font-medium text-brand-ink" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        value={open ? query : selected ? fullName(selected.firstName, selected.lastName) : query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value.trim()) onChange("");
        }}
        onFocus={() => {
          setOpen(true);
          if (selected) setQuery("");
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
        placeholder="Search by name or phone…"
        className={`mt-1.5 ${inputClass}`}
        autoComplete="off"
      />
      {open && options.length > 0 ? (
        <ul
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {options.map((m) => (
            <li key={m.id} role="option" aria-selected={m.id === value}>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-brand-red/[0.06]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m.id)}
              >
                <span className="font-medium text-brand-ink">{fullName(m.firstName, m.lastName)}</span>
                <span className="mt-0.5 block text-xs text-brand-muted">
                  {formatPhoneDisplay(m.phone)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && query.trim() && options.length === 0 ? (
        <p className="absolute z-20 mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-brand-muted shadow-lg">
          No members match.
        </p>
      ) : null}
    </div>
  );
}
