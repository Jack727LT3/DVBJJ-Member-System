"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import AdminAuthShell from "@/components/AdminAuthShell";
import AdminDashboard from "@/components/AdminDashboard";
import AdminSignInPanel from "@/components/AdminSignInPanel";
import type { Session } from "@supabase/supabase-js";

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return url.length > 0 && key.length > 0;
}

type AnalyticsPayload = {
  total_check_ins_today: number;
  peak_hour: number | null;
  peak_hour_count: number;
  inactive_members_7plus_days: number;
  trials_expiring_soon_3_days: number;
};

export default function AdminPage() {
  const supabaseReady = isSupabaseConfigured();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<"loading" | "signed_out" | "unauthorized" | "authorized">(() =>
    supabaseReady ? "loading" : "signed_out"
  );
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [email, setEmail] = useState("");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState<string>("");

  useEffect(() => {
    if (!supabaseReady) {
      setSession(null);
      setAuthState("signed_out");
      return;
    }

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
  }, [supabaseReady]);

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
    if (!supabaseReady) {
      setSendStatus("error");
      setSendError("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to use sign-in.");
      return;
    }

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
    if (!supabaseReady) {
      setAuthState("signed_out");
      setAnalytics(null);
      router.refresh();
      return;
    }
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

  if (supabaseReady && authState === "loading") {
    const message = session?.access_token ? "Opening your dashboard…" : "Loading…";
    return (
      <AdminAuthShell title={session?.access_token ? "Signed in" : "Please wait"}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div
            className="h-9 w-9 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-white"
            aria-hidden
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
        </div>
      </AdminAuthShell>
    );
  }

  if (authState === "unauthorized") {
    return (
      <AdminAuthShell title="Access restricted">
        <div className="text-lg font-semibold text-red-700 dark:text-red-400">Unauthorized</div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Your account is not on the admin allow list for this gym.
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-6 w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-100 px-4 py-3 text-base font-medium text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          Sign out
        </button>
      </AdminAuthShell>
    );
  }

  const previewNotice = supabaseReady
    ? null
    : "Preview: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to send real magic links.";

  return (
    <AdminSignInPanel
      email={email}
      onEmailChange={setEmail}
      onSubmit={sendMagicLink}
      sendStatus={sendStatus}
      sendError={sendError}
      previewNotice={previewNotice}
    />
  );
}

