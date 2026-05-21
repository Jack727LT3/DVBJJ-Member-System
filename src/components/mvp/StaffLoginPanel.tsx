"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import DvbjjLogo from "@/components/DvbjjLogo";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import { setStaffAuthenticated, validateStaffCredentials } from "@/lib/staffAuth";

type StaffLoginPanelProps = {
  onAuthenticated: () => void;
};

const inputClass =
  "mt-2 w-full rounded-lg border border-black/10 px-3 py-3 text-base outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

export default function StaffLoginPanel({ onAuthenticated }: StaffLoginPanelProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateStaffCredentials(username, password)) {
      setError("Incorrect username or password.");
      return;
    }
    setError(null);
    setStaffAuthenticated();
    onAuthenticated();
  }

  return (
    <main className="flex min-h-screen flex-col bg-brand-cream font-sans text-brand-ink">
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
          <Link
            href="/"
            className="text-sm font-medium text-brand-red underline decoration-brand-red/40 underline-offset-4 hover:text-[#f4d4d8]"
          >
            ← Back To Kiosk
          </Link>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <KioskSnakeBorderCard className="w-full max-w-[420px]" innerClassName="px-8 pb-10 pt-9">
          <div className="flex justify-center border-b border-black/[0.06] pb-8">
            <DvbjjLogo variant="on-light" size="hero" />
          </div>

          <h1 className="mt-8 text-xl font-semibold tracking-tight text-brand-ink">Staff Sign In</h1>
          <p className="mt-2 text-sm leading-relaxed text-brand-muted">
            Enter staff credentials to open the dashboard on this device.
          </p>

          <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="staff-username" className="text-sm font-medium text-brand-ink">
                Username
              </label>
              <input
                id="staff-username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                autoComplete="username"
                className={inputClass}
                placeholder="Username"
              />
            </div>
            <div>
              <label htmlFor="staff-password" className="text-sm font-medium text-brand-ink">
                Password
              </label>
              <input
                id="staff-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                autoComplete="current-password"
                className={inputClass}
                placeholder="Password"
              />
            </div>

            {error ? (
              <p className="text-sm font-medium text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-lg bg-brand-red px-4 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-hover"
            >
              Sign In
            </button>
          </form>
        </KioskSnakeBorderCard>
      </div>
    </main>
  );
}
