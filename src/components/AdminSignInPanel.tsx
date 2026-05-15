"use client";

import Link from "next/link";
import DvbjjLogo from "@/components/DvbjjLogo";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";

export default function AdminSignInPanel({
  email,
  onEmailChange,
  onSubmit,
  sendStatus,
  sendError,
  previewNotice,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
  sendStatus: "idle" | "sending" | "sent" | "error";
  sendError: string;
  previewNotice?: string | null;
}) {
  const submitDisabled = sendStatus === "sending" || Boolean(previewNotice);

  return (
    <main className="min-h-screen flex flex-col bg-brand-cream font-sans text-brand-ink">
      <header className="border-b border-white/10 bg-brand-ink text-[#f4f2ee]">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <DvbjjLogo variant="on-dark" size="header" className="shrink-0" />
            <div className="hidden h-8 w-px bg-white/15 sm:block" aria-hidden />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a8a6a3]">Staff</p>
              <p className="text-sm font-medium text-[#f4f2ee]">Member system · Secure sign-in</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:py-14">
        <KioskSnakeBorderCard
          className="w-full max-w-[420px] shadow-[0_24px_80px_-20px_rgba(12,12,14,0.25)]"
          innerClassName="px-8 pb-10 pt-9 sm:px-10 sm:pt-10"
        >
            <div className="flex justify-center border-b border-black/[0.06] pb-8">
              <DvbjjLogo variant="on-light" size="hero" />
            </div>

            {previewNotice ? (
              <div className="mt-6 rounded-lg border border-amber-200/90 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950">
                {previewNotice}
              </div>
            ) : null}

            <h1 className="mt-8 text-xl font-semibold tracking-tight text-brand-ink">Sign in</h1>
            <p className="mt-2 text-sm leading-relaxed text-brand-muted">
              We&apos;ll email you a one-time link. No password to remember.
            </p>

            <div className="mt-7">
              <label htmlFor="admin-email" className="text-sm font-medium text-brand-ink">
                Work email
              </label>
              <input
                id="admin-email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                inputMode="email"
                autoComplete="email"
                className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3.5 py-3 text-base text-brand-ink shadow-inner shadow-black/[0.02] outline-none ring-brand-red/0 transition-[border-color,box-shadow] placeholder:text-black/35 focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15"
                placeholder="you@domain.com"
              />
            </div>

            <button
              type="button"
              onClick={onSubmit}
              disabled={submitDisabled}
              className="mt-6 w-full rounded-lg bg-brand-red px-4 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-hover disabled:cursor-not-allowed disabled:opacity-55"
            >
              {sendStatus === "sending" ? "Sending link…" : "Email me a sign-in link"}
            </button>

            {sendStatus === "sent" ? (
              <div className="mt-4 rounded-lg border border-emerald-200/90 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-950">
                Check your inbox and tap the link to open the dashboard.
              </div>
            ) : null}

            {sendStatus === "error" ? (
              <div className="mt-4 text-sm font-medium text-red-700">{sendError}</div>
            ) : null}

            <p className="mt-8 text-center text-xs text-brand-muted">
              <Link
                href="/"
                className="font-medium text-brand-red underline decoration-brand-red/35 underline-offset-[5px] transition-colors hover:text-brand-red-hover hover:decoration-brand-red-hover/50"
              >
                Back to Member Check In
              </Link>
            </p>
        </KioskSnakeBorderCard>
      </div>
    </main>
  );
}
