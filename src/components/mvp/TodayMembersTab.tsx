"use client";

import { type Dispatch, type FormEvent, type SetStateAction, useMemo, useRef, useState } from "react";
import AddMembersSection from "@/components/mvp/AddMembersSection";
import CollapsibleSection from "@/components/mvp/CollapsibleSection";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import MemberProfilePanel from "@/components/mvp/MemberProfilePanel";
import MemberSearchPicker from "@/components/mvp/MemberSearchPicker";
import type { StaffCheckInRow } from "@/lib/staffDashboard";
import {
  BELT_TIERS,
  formatMoney,
  formatWhen,
  fullName,
  maskPhone,
} from "@/lib/mvpShared";
import { normalizePhone } from "@/lib/phone";
import {
  isChildMember,
  sortMembersLeastRecentFirst,
  type StaffDashboard,
  type StaffMemberRow,
} from "@/lib/staffDashboard";

const INACTIVE_MS = 7 * 24 * 60 * 60 * 1000;

type DailyFilter = "today" | "flagged" | "inactive";
type MemberSort = "alphabetical" | "belt" | "lastVisit" | "flagged" | "payment";
type MemberAgeFilter = "all" | "adults" | "children";
type SectionKey = "checkIns" | "allMembers" | "addMembers" | "memberNotes";

const FILTER_LABELS: Record<DailyFilter, string> = {
  today: "Check-Ins Today",
  flagged: "Flagged Members",
  inactive: "Inactive 7+ Days",
};

const SORT_LABELS: Record<MemberSort, string> = {
  alphabetical: "Alphabetical",
  belt: "Belt Rank",
  lastVisit: "Most Recently Visited",
  flagged: "Flagged First",
  payment: "$ / Mo (High To Low)",
};

const inputClass =
  "w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

/** ~8 table rows visible before inner scroll */
const SCROLLABLE_TABLE_MAX_H = "max-h-[22.5rem]";

function findMemberForCheckIn(members: StaffMemberRow[], row: StaffCheckInRow) {
  const phone = normalizePhone(row.phone);
  const byPhone = members.find((m) => {
    const mp = normalizePhone(m.phone);
    return mp === phone || mp.endsWith(phone) || phone.endsWith(mp);
  });
  if (byPhone) return byPhone;
  return members.find(
    (m) =>
      m.firstName.toLowerCase() === row.firstName.toLowerCase() &&
      m.lastName.toLowerCase() === row.lastName.toLowerCase()
  );
}

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isFlaggedMember(m: StaffMemberRow) {
  return Boolean(m.memberState && m.memberState !== "active");
}

function isInactiveMember(m: StaffMemberRow) {
  if (!m.lastVisit) return true;
  return Date.now() - new Date(m.lastVisit).getTime() >= INACTIVE_MS;
}

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
  return "text-brand-muted";
}

function beltRankIndex(belt: string | null) {
  if (!belt) return BELT_TIERS.length;
  const i = BELT_TIERS.findIndex((b) => b.toLowerCase() === belt.toLowerCase());
  return i === -1 ? BELT_TIERS.length : i;
}

function sortMembers(rows: StaffMemberRow[], sort: MemberSort): StaffMemberRow[] {
  const list = [...rows];
  switch (sort) {
    case "alphabetical":
      return list.sort((a, b) => {
        const ln = a.lastName.localeCompare(b.lastName);
        return ln !== 0 ? ln : a.firstName.localeCompare(b.firstName);
      });
    case "belt":
      return list.sort((a, b) => {
        const bd = beltRankIndex(a.beltColor) - beltRankIndex(b.beltColor);
        return bd !== 0 ? bd : a.lastName.localeCompare(b.lastName);
      });
    case "lastVisit":
      return list.sort((a, b) => {
        if (!a.lastVisit && !b.lastVisit) return 0;
        if (!a.lastVisit) return 1;
        if (!b.lastVisit) return -1;
        return new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime();
      });
    case "flagged": {
      const flagged = list.filter(isFlaggedMember);
      const rest = list.filter((m) => !isFlaggedMember(m));
      return [...sortMembers(flagged, "alphabetical"), ...sortMembers(rest, "alphabetical")];
    }
    case "payment":
      return list.sort((a, b) => {
        const pa = a.monthlyPayment ?? -1;
        const pb = b.monthlyPayment ?? -1;
        if (pb !== pa) return pb - pa;
        return a.lastName.localeCompare(b.lastName);
      });
    default:
      return list;
  }
}

function memberMatchesSearch(m: StaffMemberRow, query: string) {
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

function StatTile({
  label,
  value,
  alert,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition-all",
        "hover:border-brand-red/30 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red",
        active ? "border-brand-red ring-2 ring-brand-red/20" : "border-black/[0.06]",
      ].join(" ")}
      aria-pressed={active}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? "text-brand-red" : "text-brand-ink"}`}>
        {value}
      </div>
      <p className="mt-2 text-[11px] text-brand-muted">
        {active ? "Showing below · tap to clear" : "Tap to view list"}
      </p>
    </button>
  );
}

type TodayMembersTabProps = {
  data: StaffDashboard;
  members?: StaffMemberRow[];
  onMembersChange?: (members: StaffMemberRow[]) => void;
};

export default function TodayMembersTab({
  data,
  members: controlledMembers,
  onMembersChange,
}: TodayMembersTabProps) {
  const [internalMembers, setInternalMembers] = useState(data.members);
  const members = controlledMembers ?? internalMembers;
  const setMembers: Dispatch<SetStateAction<StaffMemberRow[]>> = (action) => {
    const next = typeof action === "function" ? action(members) : action;
    if (onMembersChange) onMembersChange(next);
    else setInternalMembers(next);
  };
  const [filter, setFilter] = useState<DailyFilter | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSort, setMemberSort] = useState<MemberSort>("alphabetical");
  const [memberAgeFilter, setMemberAgeFilter] = useState<MemberAgeFilter>("all");
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    checkIns: true,
    allMembers: false,
    addMembers: false,
    memberNotes: false,
  });

  const [noteMemberId, setNoteMemberId] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const membersRef = useRef<HTMLDivElement>(null);
  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null;

  const dayStart = startOfUtcDay();
  const memberCheckInsToday = data.recentCheckIns.filter(
    (r) => new Date(r.at) >= dayStart && r.status === "member"
  );
  const flaggedMembers = members.filter(isFlaggedMember);
  const inactiveMembers = members.filter(isInactiveMember);

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const applyFilter = (next: DailyFilter) => {
    if (filter === next) {
      setFilter(null);
      setOpenSections({ checkIns: true, allMembers: false, addMembers: false, memberNotes: false });
      return;
    }
    setFilter(next);
    if (next === "today") {
      setOpenSections({ checkIns: true, allMembers: false, addMembers: false, memberNotes: false });
    } else {
      setMemberSort(next === "flagged" ? "flagged" : "lastVisit");
      setOpenSections({ checkIns: false, allMembers: true, addMembers: false, memberNotes: false });
      requestAnimationFrame(() => {
        membersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const filteredMembers = useMemo(() => {
    let list = members;
    if (filter === "flagged") list = flaggedMembers;
    else if (filter === "inactive") list = inactiveMembers;
    if (memberAgeFilter === "adults") list = list.filter((m) => !isChildMember(m));
    else if (memberAgeFilter === "children") list = list.filter(isChildMember);
    list = list.filter((m) => memberMatchesSearch(m, memberSearch));
    return sortMembers(list, memberSort);
  }, [members, filter, memberSearch, memberSort, memberAgeFilter, flaggedMembers, inactiveMembers]);

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    setNoteError(null);
    if (!noteMemberId || !noteBody.trim()) {
      setNoteError("Pick a member and enter a note.");
      return;
    }
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/mvp/members/${noteMemberId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      const json = await res.json();
      if (!res.ok && !json.note) {
        setNoteError(json.error ?? "Could not save note.");
        return;
      }
      const note = json.note as { id: string; body: string; createdAt: string };
      setMembers((prev) => {
        const next = prev.map((m) =>
          m.id === noteMemberId ? { ...m, notes: [note, ...m.notes] } : m
        );
        onMembersChange?.(next);
        return next;
      });
      setNoteBody("");
    } catch {
      setNoteError("Something went wrong.");
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <p className="text-sm text-brand-muted">
        Your morning checklist — who checked in, who needs a follow-up, and member records to maintain.
      </p>

      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Check-Ins Today"
          value={data.analytics.checkInsToday}
          active={filter === "today"}
          onClick={() => applyFilter("today")}
        />
        <StatTile
          label="Flagged Members"
          value={flaggedMembers.length}
          alert={flaggedMembers.length > 0}
          active={filter === "flagged"}
          onClick={() => applyFilter("flagged")}
        />
        <StatTile
          label="Inactive 7+ Days"
          value={data.analytics.inactiveMembers7Days}
          alert={data.analytics.inactiveMembers7Days > 0}
          active={filter === "inactive"}
          onClick={() => applyFilter("inactive")}
        />
      </div>

      {filter ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-red/20 bg-brand-red/[0.04] px-4 py-3">
          <p className="text-sm text-brand-ink">
            Showing: <span className="font-semibold">{FILTER_LABELS[filter]}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setFilter(null);
              setOpenSections({ checkIns: true, allMembers: false, addMembers: false, memberNotes: false });
            }}
            className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-neutral-50"
          >
            Clear Filter
          </button>
        </div>
      ) : null}

      <CollapsibleSection
        title="Today's Member Check-Ins"
        subtitle="Current members who signed in at the kiosk today."
        count={memberCheckInsToday.length}
        open={openSections.checkIns}
        onToggle={() => toggleSection("checkIns")}
      >
        <div className={`overflow-x-auto ${SCROLLABLE_TABLE_MAX_H} overflow-y-auto`}>
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-brand-muted shadow-[0_1px_0_rgba(0,0,0,0.06)]">
              <tr>
                <th className="px-4 py-3 sm:px-6">When</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {memberCheckInsToday.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-brand-muted">
                    No member check-ins yet today.
                  </td>
                </tr>
              ) : (
                memberCheckInsToday.map((r) => {
                  const linked = findMemberForCheckIn(members, r);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => linked && setSelectedMemberId(linked.id)}
                      className={
                        linked
                          ? "cursor-pointer hover:bg-brand-red/[0.04] active:bg-brand-red/[0.07]"
                          : "hover:bg-neutral-50/80"
                      }
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-brand-muted sm:px-6">
                        {formatWhen(r.at)}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {linked ? (
                          <span className="underline decoration-brand-red/25 decoration-dotted underline-offset-2">
                            {fullName(r.firstName, r.lastName)}
                          </span>
                        ) : (
                          fullName(r.firstName, r.lastName)
                        )}
                      </td>
                      <td className="px-4 py-3 text-brand-muted">{maskPhone(r.phone)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <div ref={membersRef} className="scroll-mt-24">
        <CollapsibleSection
          title={
            filter === "flagged"
              ? "Flagged Members"
              : filter === "inactive"
                ? "Inactive Members (7+ Days)"
                : "All Members"
          }
          subtitle="Search by name, email, or phone. Sort and filter the roster."
          count={filteredMembers.length}
          open={openSections.allMembers}
          onToggle={() => toggleSection("allMembers")}
        >
          <div className="space-y-4 border-b border-black/[0.06] px-5 py-4 sm:px-6">
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="member-search">
                Search Members
              </label>
              <input
                id="member-search"
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Name, email, or phone…"
                className={`mt-1.5 ${inputClass}`}
                autoComplete="off"
              />
            </div>
            <div>
              <span className="text-xs font-medium text-brand-ink">Member Type</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {(
                  [
                    { key: "all" as const, label: "All" },
                    { key: "adults" as const, label: "Adults" },
                    { key: "children" as const, label: "Children" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMemberAgeFilter(key)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      memberAgeFilter === key
                        ? "border-brand-red/40 bg-brand-red/[0.08] text-brand-ink"
                        : "border-black/10 bg-white text-brand-muted hover:border-black/20 hover:text-brand-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-brand-ink" htmlFor="member-sort">
                Sort By
              </label>
              <select
                id="member-sort"
                value={memberSort}
                onChange={(e) => setMemberSort(e.target.value as MemberSort)}
                className={`mt-1.5 ${inputClass}`}
              >
                {(Object.keys(SORT_LABELS) as MemberSort[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={`staff-roster-scroll overflow-x-auto overflow-y-scroll ${SCROLLABLE_TABLE_MAX_H}`}>
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-brand-muted shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                <tr>
                  <th className="px-4 py-3 sm:px-6">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Belt</th>
                  <th className="px-4 py-3">$/Mo</th>
                  <th className="px-4 py-3">Last Visit</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-brand-muted">
                      No members match your search.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedMemberId(m.id)}
                      className="cursor-pointer align-top hover:bg-brand-red/[0.04] active:bg-brand-red/[0.07]"
                    >
                      <td className="px-4 py-3 font-medium sm:px-6">
                        <span className="underline decoration-brand-red/25 decoration-dotted underline-offset-2">
                          {fullName(m.firstName, m.lastName)}
                        </span>
                        {isChildMember(m) ? (
                          <span className="ml-1.5 text-xs font-normal text-brand-muted">· Child</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-brand-muted">{maskPhone(m.phone)}</td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-brand-muted">{m.email ?? "—"}</td>
                      <td className="px-4 py-3 text-brand-muted">{m.beltColor ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-brand-muted">{formatMoney(m.monthlyPayment)}</td>
                      <td className="px-4 py-3 text-brand-muted">{formatWhen(m.lastVisit)}</td>
                      <td className={`px-4 py-3 text-sm ${memberStateClass(m.memberState)}`}>
                        {memberStateLabel(m.memberState)}
                      </td>
                      <td className="px-4 py-3 text-brand-muted">{m.notes.length || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredMembers.length > 8 ? (
            <p className="border-t border-black/[0.06] px-5 py-2 text-center text-xs text-brand-muted sm:px-6">
              Scroll inside this list to see all {filteredMembers.length} members
            </p>
          ) : null}
        </CollapsibleSection>
      </div>

      <AddMembersSection
        open={openSections.addMembers}
        onToggle={() => toggleSection("addMembers")}
        onMemberAdded={(member) => {
          setMembers((prev) => sortMembersLeastRecentFirst([member, ...prev.filter((m) => m.id !== member.id)]));
          setOpenSections((s) => ({ ...s, allMembers: true }));
        }}
        onMembersImported={(imported) => {
          setMembers((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            for (const m of imported) byId.set(m.id, m);
            return sortMembersLeastRecentFirst([...byId.values()]);
          });
          setOpenSections((s) => ({ ...s, allMembers: true }));
        }}
      />

      <CollapsibleSection
        title="Add Member Note"
        subtitle="Log struggles, goals, or follow-ups — each note is saved with the date."
        open={openSections.memberNotes}
        onToggle={() => toggleSection("memberNotes")}
      >
        <div className="px-5 py-4 sm:px-6 sm:py-5">
          <form className="space-y-4" onSubmit={submitNote}>
            <MemberSearchPicker
              members={members}
              value={noteMemberId}
              onChange={setNoteMemberId}
              inputId="note-member"
              label="Member"
            />
            <div>
              <label className="text-xs font-medium" htmlFor="note-body">
                Note
              </label>
              <textarea
                id="note-body"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                rows={3}
                className={`mt-1.5 ${inputClass}`}
                placeholder="e.g. Recovering from knee injury — modify drills."
              />
            </div>
            {noteError ? <p className="text-sm text-red-700">{noteError}</p> : null}
            <button
              type="submit"
              disabled={noteSaving}
              className="rounded-lg bg-brand-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:opacity-55"
            >
              {noteSaving ? "Saving…" : "Save Note"}
            </button>
          </form>
        </div>
      </CollapsibleSection>

      {selectedMember ? (
        <MemberProfilePanel
          member={selectedMember}
          onClose={() => setSelectedMemberId(null)}
          onMemberUpdate={(updated) => {
            setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
          }}
        />
      ) : null}
    </div>
  );
}
