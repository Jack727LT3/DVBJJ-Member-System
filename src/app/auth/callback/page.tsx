"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error" | "ok">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get("code");
        if (!code) {
          setStatus("error");
          setErrorMsg("Missing code parameter.");
          return;
        }

        const supabaseBrowser = getSupabaseBrowser();
        const { error } = await supabaseBrowser.auth.exchangeCodeForSession(code);
        if (error) throw error;

        setStatus("ok");
        router.replace("/admin");
      } catch (err: unknown) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Failed to sign in.");
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-lg font-semibold">Signing you in...</div>
          <div className="mt-2 text-sm text-gray-600">Please wait.</div>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-lg font-semibold text-red-700">Sign-in failed</div>
          <div className="mt-2 text-sm text-gray-700">{errorMsg}</div>
        </div>
      </main>
    );
  }

  return null;
}

