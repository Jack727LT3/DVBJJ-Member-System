"use client";

import { useCallback, useEffect, useState } from "react";
import { formatWhen } from "@/lib/mvpShared";
import type { StaffMemberRow } from "@/lib/staffDashboard";

type AttendanceRow = { id: string; at: string };

type MemberAttendanceSectionProps = {
  member: StaffMemberRow;
  onMemberUpdate: (member: StaffMemberRow) => void;
};

export default function MemberAttendanceSection({ member, onMemberUpdate }: MemberAttendanceSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkInSaving, setCheckInSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mvp/members/${member.id}/attendance`, { cache: "no-store" });
      const json = await res.json();
      setRows((json.checkIns ?? []) as AttendanceRow[]);
    } catch {
      setError("Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }, [member.id]);

  useEffect(() => {
    if (expanded) void loadHistory();
  }, [expanded, loadHistory]);

  async function signInToday() {
    setCheckInSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/mvp/members/${member.id}/check-in`, { method: "POST" });
      const json = await res.json();
      if (!res.ok && !json.lastVisit) {
        setError(json.error ?? "Could not sign in.");
        return;
      }
      onMemberUpdate({
        ...member,
        lastVisit: json.lastVisit ?? new Date().toISOString(),
        totalVisits: json.totalVisits ?? member.totalVisits + 1,
      });
      if (expanded) void loadHistory();
    } catch {
      setError("Something went wrong.");
    } finally {
      setCheckInSaving(false);
    }
  }

  async function removeCheckIn(checkInId: string) {
    if (!confirm("Remove this check-in from attendance?")) return;
    setRemovingId(checkInId);
    setError(null);
    try {
      const res = await fetch(`/api/mvp/members/${member.id}/attendance/${checkInId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok && !json.ok) {
        setError(json.error ?? "Could not remove check-in.");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== checkInId));
      onMemberUpdate({
        ...member,
        lastVisit: json.lastVisit ?? null,
        totalVisits: json.totalVisits ?? Math.max(0, member.totalVisits - 1),
      });
    } catch {
      setError("Something went wrong.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="mt-6 border-t border-black/[0.06] pt-5">
      <h3 className="text-sm font-semibold text-brand-ink">Attendance</h3>
      <p className="mt-1 text-sm text-brand-muted">
        Last visit: {formatWhen(member.lastVisit)} · Total: {member.totalVisits}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void signInToday()}
          disabled={checkInSaving || member.memberState === "canceled"}
          className="rounded-lg bg-brand-red px-3 py-2 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:opacity-55"
        >
          {checkInSaving ? "Signing in…" : "Sign in for today"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50"
        >
          {expanded ? "Hide history" : "View attendance"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {expanded ? (
        <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-black/[0.06]">
          {loading ? (
            <p className="px-3 py-4 text-sm text-brand-muted">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-4 text-sm text-brand-muted">No check-ins recorded yet.</p>
          ) : (
            <ul className="divide-y divide-black/[0.06] text-sm">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-brand-ink">
                  <span>{formatWhen(r.at)}</span>
                  <button
                    type="button"
                    onClick={() => void removeCheckIn(r.id)}
                    disabled={removingId === r.id}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-black/10 text-brand-muted hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    aria-label={`Remove check-in ${formatWhen(r.at)}`}
                    title="Remove this check-in"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
