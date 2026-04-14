"use client";

import { useEffect, useMemo, useState } from "react";

type AnalyticsPayload = {
  total_check_ins_today: number;
  peak_hour: number | null;
  peak_hour_count: number;
  inactive_members_7plus_days: number;
  trials_expiring_soon_3_days: number;
};

type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  join_date: string;
  last_visit: string | null;
  total_visits: number;
  member_state: "active" | "delinquent" | "frozen" | "canceled" | null;
};

type TrialRow = {
  id: string;
  first_name: string;
  last_name: string;
  trial_end_date: string;
  days_remaining: number;
};

type GuestRow = {
  id: string;
  first_name: string;
  last_name: string;
  created_at: string;
  last_visit: string | null;
};

type LeadRow = {
  id: string;
  first_name: string;
  last_name: string;
  created_at: string;
  contact_attempts: number;
  last_contact_date: string | null;
};

type PeopleState = {
  member: MemberRow[];
  trial: TrialRow[];
  guest: GuestRow[];
  lead: LeadRow[];
};

function fullName(first: string, last: string) {
  return `${first} ${last}`.trim();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatMemberStateLabel(state: MemberRow["member_state"]): string {
  if (state === "active") return "Active";
  if (state === "delinquent") return "Flagged (billing)";
  if (state === "frozen") return "Frozen";
  if (state === "canceled") return "Canceled";
  return "-";
}

async function authedFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export default function AdminDashboard({
  accessToken,
  initialAnalytics,
  onSignOut,
}: {
  accessToken: string;
  initialAnalytics: AnalyticsPayload | null;
  onSignOut?: () => void;
}) {
  const [status, setStatus] = useState<"member" | "trial" | "guest" | "lead">("member");
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(initialAnalytics);
  const [people, setPeople] = useState<PeopleState>({
    member: [],
    trial: [],
    guest: [],
    lead: [],
  });
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const res = await authedFetch<{ people: unknown[] }>(
          accessToken,
          `/api/admin/people?status=${status}`
        );
        setPeople((prev) => {
          switch (status) {
            case "member":
              return { ...prev, member: res.people as MemberRow[] };
            case "trial":
              return { ...prev, trial: res.people as TrialRow[] };
            case "guest":
              return { ...prev, guest: res.people as GuestRow[] };
            case "lead":
              return { ...prev, lead: res.people as LeadRow[] };
            default:
              return prev;
          }
        });
      } finally {
        setLoading(false);
      }
    };

    run().catch(() => {});
  }, [accessToken, status, refreshKey]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await authedFetch<AnalyticsPayload>(accessToken, "/api/admin/analytics");
        setAnalytics(res);
      } catch {
        // Ignore; keep what we already have.
      }
    };
    run();
  }, [accessToken, refreshKey]);

  const peakHourText = useMemo(() => {
    if (!analytics || analytics.peak_hour === null) return "-";
    return `${analytics.peak_hour}:00`;
  }, [analytics]);

  const togglePaymentFlag = async (id: string) => {
    await fetch(`/api/admin/members/${id}/flag`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setRefreshKey((k) => k + 1);
  };

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          {onSignOut ? (
            <button
              onClick={onSignOut}
              className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 text-sm whitespace-nowrap"
            >
              Sign out
            </button>
          ) : null}
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className="p-4 rounded border">
            <div className="text-sm text-gray-600">Total check-ins today</div>
            <div className="text-3xl font-semibold">{analytics?.total_check_ins_today ?? "-"}</div>
          </div>
          <div className="p-4 rounded border">
            <div className="text-sm text-gray-600">Peak hour</div>
            <div className="text-3xl font-semibold">{peakHourText}</div>
            <div className="text-sm text-gray-600">{analytics?.peak_hour_count ?? 0} check-ins</div>
          </div>
          <div className="p-4 rounded border">
            <div className="text-sm text-gray-600">Members inactive for 7+ days</div>
            <div className="text-3xl font-semibold">{analytics?.inactive_members_7plus_days ?? "-"}</div>
          </div>
          <div className="p-4 rounded border">
            <div className="text-sm text-gray-600">Trials expiring soon (3 days)</div>
            <div className="text-3xl font-semibold">{analytics?.trials_expiring_soon_3_days ?? "-"}</div>
          </div>
        </section>

        <section className="mb-4">
          <label className="text-sm text-gray-700 font-medium mr-2">Show</label>
          <select
            value={status}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "member" || v === "trial" || v === "guest" || v === "lead") {
                setStatus(v);
              }
            }}
            className="px-3 py-2 border rounded bg-white"
          >
            <option value="member">Members</option>
            <option value="trial">Trial</option>
            <option value="guest">Guests</option>
            <option value="lead">Leads</option>
          </select>
        </section>

        <section className="border rounded overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 text-sm font-semibold">
            {status === "member"
              ? "Members"
              : status === "trial"
                ? "Trial members"
                : status === "guest"
                  ? "Guests"
                  : "Leads"}
          </div>

          <div className="divide-y">
            {loading ? (
              <div className="p-4 text-sm text-gray-600">Loading...</div>
            ) : status === "member" ? (
              people.member.length ? (
                people.member.map((p) => {
                  const name = fullName(p.first_name, p.last_name);
                  const isPaymentFlagged = p.member_state === "delinquent";
                  const canToggleFlag = p.member_state === "active" || p.member_state === "delinquent";
                  return (
                    <div key={p.id} className="p-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold">{name}</div>
                        <div className="text-sm text-gray-600">Join: {formatDate(p.join_date)}</div>
                        <div className="text-sm text-gray-600">Last visit: {formatDateTime(p.last_visit)}</div>
                        <div className="text-sm text-gray-600">Total visits: {p.total_visits}</div>
                        <div className="text-sm text-gray-600">Status: {formatMemberStateLabel(p.member_state)}</div>
                      </div>
                      {canToggleFlag ? (
                        <button
                          type="button"
                          onClick={() => togglePaymentFlag(p.id)}
                          className="px-3 py-2 rounded bg-black text-white hover:bg-gray-800 text-sm whitespace-nowrap"
                        >
                          {isPaymentFlagged ? "Clear billing flag" : "Flag billing issue"}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500 whitespace-nowrap">Update frozen/canceled in database</span>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-sm text-gray-600">No members found.</div>
              )
            ) : status === "trial" ? (
              people.trial.length ? (
                people.trial.map((p) => (
                  <div key={p.id} className="p-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold">{fullName(p.first_name, p.last_name)}</div>
                      <div className="text-sm text-gray-600">Days left: {p.days_remaining}</div>
                      <div className="text-sm text-gray-600">Trial ends: {formatDate(p.trial_end_date)}</div>
                    </div>
                    <div className="text-sm text-gray-600 whitespace-nowrap"> </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm text-gray-600">No trial members found.</div>
              )
            ) : status === "guest" ? (
              people.guest.length ? (
                people.guest.map((p) => (
                  <div key={p.id} className="p-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold">{fullName(p.first_name, p.last_name)}</div>
                      <div className="text-sm text-gray-600">Joined: {formatDate(p.created_at)}</div>
                      <div className="text-sm text-gray-600">Last visit: {formatDateTime(p.last_visit)}</div>
                    </div>
                    <div className="text-sm text-gray-600 whitespace-nowrap"> </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm text-gray-600">No guests found.</div>
              )
            ) : people.lead.length ? (
              people.lead.map((p) => (
                <div key={p.id} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">{fullName(p.first_name, p.last_name)}</div>
                    <div className="text-sm text-gray-600">Created: {formatDate(p.created_at)}</div>
                    <div className="text-sm text-gray-600">Contact attempts: {p.contact_attempts}</div>
                    <div className="text-sm text-gray-600">Last contact: {formatDateTime(p.last_contact_date)}</div>
                  </div>
                  <div className="text-sm text-gray-600 whitespace-nowrap"> </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-sm text-gray-600">No leads found.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

