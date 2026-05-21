"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DvbjjLogo from "@/components/DvbjjLogo";
import OnboardingLeadsTab from "@/components/mvp/OnboardingLeadsTab";
import StaffLoginPanel from "@/components/mvp/StaffLoginPanel";
import StaffNotificationBell from "@/components/mvp/StaffNotificationBell";
import TodayMembersTab from "@/components/mvp/TodayMembersTab";
import {
  sortMembersLeastRecentFirst,
  sortTrialsByUrgency,
  type StaffDashboard,
  type StaffMemberRow,
} from "@/lib/staffDashboard";
import { clearStaffAuthentication, isStaffAuthenticated } from "@/lib/staffAuth";
import { clearDismissedNotifications } from "@/lib/staffNotificationDismissals";
import { buildStaffNotifications, type StaffNotification } from "@/lib/staffNotifications";

type StaffTab = "today" | "onboarding";

type StaffDashboardClientProps = {
  data: StaffDashboard;
};

export default function StaffDashboardClient({ data }: StaffDashboardClientProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<StaffTab>("today");
  const [members, setMembers] = useState<StaffMemberRow[]>(() => data.members);
  const [trials, setTrials] = useState(() => sortTrialsByUrgency(data.trials));

  useEffect(() => {
    setAuthenticated(isStaffAuthenticated());
    setAuthChecked(true);
  }, []);

  const notifications = useMemo(
    () => buildStaffNotifications({ members, trials }),
    [members, trials]
  );

  function handleMemberEnrolled(member: StaffMemberRow) {
    setMembers((prev) => sortMembersLeastRecentFirst([member, ...prev.filter((m) => m.id !== member.id)]));
  }

  function handleNotificationSelect(notification: StaffNotification) {
    if (notification.kind === "trial_ended") {
      setActiveTab("onboarding");
      return;
    }
    setActiveTab("today");
  }

  function handleSignOut() {
    clearStaffAuthentication();
    clearDismissedNotifications();
    setAuthenticated(false);
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-cream text-sm text-brand-muted">
        Loading…
      </div>
    );
  }

  if (!authenticated) {
    return <StaffLoginPanel onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-cream font-sans text-brand-ink">
      <header className="border-b border-white/10 bg-brand-ink text-[#f4f2ee]">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <DvbjjLogo variant="on-dark" size="header" className="shrink-0" />
            <div className="hidden h-8 w-px bg-white/15 sm:block" aria-hidden />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a8a6a3]">Staff</p>
              <p className="text-sm font-medium text-[#f4f2ee]">Member & Activity Dashboard</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <StaffNotificationBell
              notifications={notifications}
              onNotificationSelect={handleNotificationSelect}
            />
            <div className="flex flex-col items-end gap-1">
              <Link
                href="/"
                className="text-sm font-medium text-brand-red underline decoration-brand-red/40 underline-offset-4 hover:text-[#f4d4d8]"
              >
                ← Back To Kiosk
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-[11px] font-medium text-[#a8a6a3] underline decoration-[#a8a6a3]/40 underline-offset-2 hover:text-[#f4f2ee]"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        {data.message ? (
          <div
            className="mb-6 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950"
            role="status"
          >
            {data.message}
          </div>
        ) : null}

        <nav
          className="mb-8 flex gap-1 rounded-xl border border-black/[0.06] bg-white p-1 shadow-sm"
          aria-label="Staff dashboard sections"
        >
          <button
            type="button"
            onClick={() => setActiveTab("today")}
            className={[
              "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === "today"
                ? "bg-brand-ink text-white shadow-sm"
                : "text-brand-muted hover:bg-black/[0.03] hover:text-brand-ink",
            ].join(" ")}
          >
            Member Directory
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("onboarding")}
            className={[
              "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === "onboarding"
                ? "bg-brand-ink text-white shadow-sm"
                : "text-brand-muted hover:bg-black/[0.03] hover:text-brand-ink",
            ].join(" ")}
          >
            Member Onboarding
          </button>
        </nav>

        {activeTab === "today" ? (
          <TodayMembersTab data={data} members={members} onMembersChange={setMembers} />
        ) : (
          <OnboardingLeadsTab
            data={data}
            trials={trials}
            onTrialsChange={setTrials}
            onMemberEnrolled={handleMemberEnrolled}
          />
        )}

        <footer className="mt-10 space-y-3 border-t border-black/[0.06] pt-8 text-center text-xs text-brand-muted">
          <p>
            Data source:{" "}
            <span className="font-medium capitalize text-brand-ink">{data.source}</span>
            {data.source === "demo" ? " (connect Supabase for live data)" : ""}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link href="/admin" className="underline decoration-black/20 underline-offset-2 hover:text-brand-ink">
              Full Admin (Search, Flags, Notes)
            </Link>
          </div>
          <p className="text-black/40">Staff dashboard requires sign-in on this device.</p>
        </footer>
      </div>
    </div>
  );
}
