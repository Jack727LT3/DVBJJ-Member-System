"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import AdminDashboard from "@/components/AdminDashboard";
import type { Session } from "@supabase/supabase-js";

type AnalyticsPayload = {
  total_check_ins_today: number;
  peak_hour: number | null;
  peak_hour_count: number;
  inactive_members_7plus_days: number;
  trials_expiring_soon_3_days: number;
};

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<"loading" | "signed_out" | "unauthorized" | "authorized">("loading");
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [email, setEmail] = useState("");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const supabaseBrowser = getSupabaseBrowser();

    const load = async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setAuthState(data.session ? "loading" : "signed_out");
    };

    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthState(newSession ? "loading" : "signed_out");
    });

    load().catch(() => {});

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setAnalytics(null);
      return;
    }

    const run = async () => {
      const res = await fetch("/api/admin/analytics", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 401) {
        setAuthState("unauthorized");
        setAnalytics(null);
        return;
      }

      if (!res.ok) {
        // Keep the UI simple; treat any other failure as "loading" to avoid leaking details.
        setAuthState("loading");
        return;
      }

      const json = (await res.json()) as AnalyticsPayload;
      setAnalytics(json);
      setAuthState("authorized");
    };

    run();
  }, [session?.access_token]);

  const sendMagicLink = async () => {
    setSendError("");
    setSendStatus("sending");
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const emailTrimmed = email.trim().toLowerCase();
      if (!emailTrimmed) throw new Error("Email is required.");

      const supabaseBrowser = getSupabaseBrowser();
      const { error } = await supabaseBrowser.auth.signInWithOtp({
        email: emailTrimmed,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;
      setSendStatus("sent");
    } catch (err: unknown) {
      setSendStatus("error");
      setSendError(err instanceof Error ? err.message : "Failed to send magic link.");
    }
  };

  const signOut = async () => {
    const supabaseBrowser = getSupabaseBrowser();
    await supabaseBrowser.auth.signOut();
    setAuthState("signed_out");
    setAnalytics(null);
    router.refresh();
  };

  if (authState === "authorized" && analytics && session?.access_token) {
    return (
      <AdminDashboard
        accessToken={session.access_token}
        initialAnalytics={analytics}
        onSignOut={signOut}
      />
    );
  }

  if (authState === "unauthorized") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full border rounded p-6">
          <div className="text-lg font-semibold text-red-700">Unauthorized</div>
          <div className="mt-2 text-sm text-gray-700">
            Your account is not allowed to access this dashboard.
          </div>
          <button
            onClick={signOut}
            className="mt-4 w-full px-4 py-3 rounded bg-gray-200 hover:bg-gray-300"
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full border rounded p-6">
        <div className="text-2xl font-bold">Admin Sign In</div>
        <div className="mt-2 text-sm text-gray-600">
          Use a magic link to access the dashboard.
        </div>

        <div className="mt-5">
          <label className="text-sm text-gray-700 font-medium">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            autoComplete="email"
            className="mt-2 w-full px-3 py-2 border rounded"
            placeholder="you@domain.com"
          />
        </div>

        <button
          onClick={sendMagicLink}
          disabled={sendStatus === "sending"}
          className="mt-4 w-full px-4 py-3 rounded bg-black text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {sendStatus === "sending" ? "Sending..." : "Send magic link"}
        </button>

        {sendStatus === "sent" ? (
          <div className="mt-3 text-sm text-green-700">
            Check your email for the sign-in link.
          </div>
        ) : null}

        {sendStatus === "error" ? (
          <div className="mt-3 text-sm text-red-700">{sendError}</div>
        ) : null}
      </div>
    </main>
  );
}

