"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { formatLastTrainedLine } from "@/lib/lastTrained";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import {
  KIOSK_MEMBERSHIP_ATTENTION_BODY,
  KIOSK_MEMBERSHIP_ATTENTION_TITLE,
} from "@/lib/statusResolver";
import DvbjjLogo from "@/components/DvbjjLogo";
import KioskInteractiveWaiver from "@/components/KioskInteractiveWaiver";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";

type KioskSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  phoneMasked: string;
  status: "lead" | "trial" | "guest" | "member";
  memberState: "active" | "delinquent" | "frozen" | "canceled" | null;
  daysLeftInTrial: number | null;
  lastCheckInAt: string | null;
};

type CheckInResponse = {
  messageTitle: string;
  messageBody: string;
  confirmation: { checkInLogged: boolean };
  /** Present when the person is on a trial after check-in; days remaining until trial end. */
  trialDaysLeft?: number | null;
};

type Outcome =
  | { kind: "membershipHold" }
  | { kind: "active"; firstName: string; lastTrainedLine: string }
  | { kind: "trial"; title: string; body: string }
  | { kind: "message"; title: string; body: string }
  | { kind: "guestWelcome"; firstName: string; trialDaysLeft: number | null };

const GUEST_WELCOME_TAGLINE = "Please see the front desk to get set up.";

function guestTrialStatusLine(trialDaysLeft: number | null): string {
  if (trialDaysLeft === null) {
    return "You're checked in for today.";
  }
  if (trialDaysLeft <= 0) {
    return "Your free trial period has ended—please see the front desk.";
  }
  return `You have ${trialDaysLeft} ${trialDaysLeft === 1 ? "day" : "days"} left on your free trial.`;
}

function fullName(p: { firstName: string; lastName: string }) {
  const fn = sanitizeName(p.firstName);
  const ln = sanitizeName(p.lastName);
  return `${fn} ${ln}`.trim();
}

/** Trim, collapse spaces, and capitalize the first letter of each word (rest lowercased). */
function sanitizeName(input: string) {
  const collapsed = input.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  return collapsed
    .split(" ")
    .map((word) => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

const AUTO_RESET_MS = 30_000;

/** Enough phone digits to look up (matches API validation). */
function isPhoneLookupComplete(phone: string) {
  return normalizePhone(phone).length >= 4;
}

function isGuestFormComplete(first: string, last: string, phone: string, email: string) {
  return (
    sanitizeName(first).length > 0 &&
    sanitizeName(last).length > 0 &&
    phone.trim().length > 0 &&
    normalizePhone(phone).length >= 4 &&
    email.trim().length > 0
  );
}

const inputClass =
  "mt-2 w-full rounded-lg border border-black/10 px-3 py-3 text-base outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

export default function KioskHome() {
  const [phone, setPhone] = useState("");

  const [firstNameGuest, setFirstNameGuest] = useState("");
  const [lastNameGuest, setLastNameGuest] = useState("");
  const [phoneGuest, setPhoneGuest] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  const [results, setResults] = useState<KioskSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  type FlowMode = "phoneEntry" | "profilePick" | "guestForm" | "guestWaiver" | "outcome";
  const [mode, setMode] = useState<FlowMode>("phoneEntry");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** After guest check-in API succeeds; shown on final welcome after waiver step. */
  const [pendingGuestFirstName, setPendingGuestFirstName] = useState<string | null>(null);
  const [pendingGuestTrialDaysLeft, setPendingGuestTrialDaysLeft] = useState<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const [phoneHint, setPhoneHint] = useState<string | null>(null);
  const [lastLookupKey, setLastLookupKey] = useState<string | null>(null);

  function lookupQueryKey(ph: string) {
    return normalizePhone(ph);
  }

  function clearPhoneLookupState() {
    setPhone("");
    setResults([]);
    setSearchError(null);
    setPhoneHint(null);
    setLastLookupKey(null);
  }

  function clearGuestFormState() {
    setFirstNameGuest("");
    setLastNameGuest("");
    setPhoneGuest("");
    setGuestEmail("");
  }

  const goToPhoneEntry = () => {
    clearResetTimer();
    setOutcome(null);
    setPendingGuestFirstName(null);
    setPendingGuestTrialDaysLeft(null);
    clearPhoneLookupState();
    clearGuestFormState();
    setSearchError(null);
    setMode("phoneEntry");
  };

  const resetAfterOutcome = () => {
    goToPhoneEntry();
  };

  const runLookup = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();

    if (mode !== "phoneEntry") return;

    if (!isPhoneLookupComplete(phone)) {
      setPhoneHint("Enter your phone number so we can find your profile.");
      return;
    }

    setPhoneHint(null);
    setSearchError(null);
    setSearchLoading(true);

    const notFoundMsg = "Something went wrong. Please try again.";

    try {
      const res = await fetch("/api/kiosk/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          phone: phone.trim(),
        }),
      });

      const text = await res.text();
      let json: { results?: unknown; error?: unknown } = {};
      if (text.trim()) {
        try {
          json = JSON.parse(text) as { results?: unknown; error?: unknown };
        } catch {
          setSearchError(notFoundMsg);
          setResults([]);
          setLastLookupKey(null);
          setSearchLoading(false);
          return;
        }
      }

      if (!res.ok) {
        const serverMsg = typeof json.error === "string" ? json.error : null;
        setSearchError(res.status === 400 && serverMsg ? serverMsg : notFoundMsg);
        setResults([]);
        setLastLookupKey(null);
        setSearchLoading(false);
        return;
      }

      setSearchError(null);
      setResults((json.results ?? []) as KioskSearchResult[]);
      setLastLookupKey(lookupQueryKey(phone));
      setMode("profilePick");
    } catch {
      setSearchError(notFoundMsg);
      setResults([]);
      setLastLookupKey(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const clearResetTimer = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const startAutoReset = () => {
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => {
      resetAfterOutcome();
    }, AUTO_RESET_MS);
  };

  const memberNeedsFrontDesk = (r: KioskSearchResult) => {
    if (r.status !== "member") return false;
    return r.memberState !== null && r.memberState !== "active";
  };

  const handleCheckInResult = async (r: KioskSearchResult) => {
    clearResetTimer();
    setSearchError(null);

    if (memberNeedsFrontDesk(r)) {
      setOutcome({ kind: "membershipHold" });
      setMode("outcome");
      startAutoReset();
      return;
    }

    setSearchLoading(true);
    try {
      const res = await fetch("/api/kiosk/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ personId: r.id }),
      });

      const json = (await res.json()) as CheckInResponse | { error?: string };
      if (!res.ok || !("messageTitle" in json)) {
        const errorField = (json as { error?: unknown }).error;
        const errMsg: string | undefined = typeof errorField === "string" ? errorField : undefined;
        throw new Error(errMsg ?? `Check-in failed (${res.status})`);
      }

      const welcomeName = sanitizeName(r.firstName) || "there";

      if (r.status === "member" && (r.memberState === "active" || r.memberState === null)) {
        setOutcome({
          kind: "active",
          firstName: welcomeName,
          lastTrainedLine: formatLastTrainedLine(r.lastCheckInAt),
        });
      } else if (r.status === "trial") {
        setOutcome({
          kind: "trial",
          title: json.messageTitle,
          body: json.messageBody,
        });
      } else {
        setOutcome({
          kind: "message",
          title: json.messageTitle,
          body: json.messageBody,
        });
      }

      setMode("outcome");
      startAutoReset();
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const submitGuestCheckIn = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!isGuestFormComplete(firstNameGuest, lastNameGuest, phoneGuest, guestEmail)) {
      setSearchError("Please fill in every field, including a valid phone and email.");
      return;
    }

    setSearchError(null);
    setSearchLoading(true);
    const welcomeFirst = sanitizeName(firstNameGuest) || "there";

    const guestFailMsg = "Couldn't complete check-in. Please see the front desk.";

    try {
      const res = await fetch("/api/kiosk/create-and-check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          firstName: sanitizeName(firstNameGuest),
          lastName: sanitizeName(lastNameGuest),
          phone: phoneGuest.trim(),
          email: guestEmail.trim(),
        }),
      });

      const text = await res.text();
      let json: CheckInResponse | { error?: string } = {} as CheckInResponse;
      if (text.trim()) {
        try {
          json = JSON.parse(text) as CheckInResponse | { error?: string };
        } catch {
          setSearchError(guestFailMsg);
          return;
        }
      }

      if (!res.ok || !("messageTitle" in json)) {
        const errorField = (json as { error?: unknown }).error;
        const errMsg: string | undefined = typeof errorField === "string" ? errorField : undefined;
        setSearchError(errMsg ?? guestFailMsg);
        return;
      }

      const okBody = json as CheckInResponse;
      let trialDays: number | null = null;
      if (typeof okBody.trialDaysLeft === "number") {
        trialDays = okBody.trialDaysLeft;
      }

      setPendingGuestFirstName(welcomeFirst);
      setPendingGuestTrialDaysLeft(trialDays);
      setMode("guestWaiver");
    } catch {
      setSearchError(guestFailMsg);
    } finally {
      setSearchLoading(false);
    }
  };

  const completeGuestWaiver = () => {
    const first = pendingGuestFirstName ?? "there";
    const trialLeft = pendingGuestTrialDaysLeft;
    setPendingGuestFirstName(null);
    setPendingGuestTrialDaysLeft(null);
    setOutcome({ kind: "guestWelcome", firstName: first, trialDaysLeft: trialLeft });
    setMode("outcome");
    startAutoReset();
  };

  const openContinueAsGuest = () => {
    setFirstNameGuest("");
    setLastNameGuest("");
    setPhoneGuest(phone.trim());
    setGuestEmail("");
    setSearchError(null);
    setMode("guestForm");
  };

  const backToPhoneEntry = () => {
    setResults([]);
    setSearchError(null);
    setLastLookupKey(null);
    setMode("phoneEntry");
  };

  const currentLookupKey = lookupQueryKey(phone);
  const showNotFoundContinueGuest =
    mode === "profilePick" &&
    !searchLoading &&
    lastLookupKey !== null &&
    lastLookupKey === currentLookupKey &&
    results.length === 0 &&
    !searchError;

  const phoneDisplayLine = formatPhoneDisplay(phone);

  const headerStatus =
    mode === "outcome"
      ? "Thanks for checking in"
      : mode === "guestWaiver"
        ? "Liability waiver"
        : mode === "guestForm"
          ? "Free trial"
          : mode === "profilePick"
            ? "Confirm your profile"
            : "Check In";

  return (
    <main className="min-h-screen flex flex-col bg-brand-cream font-sans text-brand-ink">
      <header className="border-b border-white/10 bg-brand-ink text-[#f4f2ee]">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <DvbjjLogo variant="on-dark" size="header" className="shrink-0" />
            <div className="hidden h-8 w-px bg-white/15 sm:block" aria-hidden />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a8a6a3]">Check In</p>
              <p className="text-sm font-medium text-[#f4f2ee]">Member Kiosk</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 sm:text-right">
            <div className="text-xs text-[#a8a6a3]">{headerStatus}</div>
            <Link
              href="/dashboard"
              className="text-[11px] font-medium text-[#a8a6a3] underline decoration-[#a8a6a3]/50 underline-offset-4 hover:text-[#f4f2ee]"
            >
              Staff Dashboard
            </Link>
          </div>
        </div>
      </header>

      {mode === "outcome" && outcome ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
          {outcome.kind === "membershipHold" ? (
            <KioskSnakeBorderCard fadeIn innerClassName="p-8">
              <div className="text-2xl font-semibold text-brand-ink">{KIOSK_MEMBERSHIP_ATTENTION_TITLE}</div>
              <p className="mt-3 text-base leading-relaxed text-brand-muted">{KIOSK_MEMBERSHIP_ATTENTION_BODY}</p>
            </KioskSnakeBorderCard>
          ) : null}

          {outcome.kind === "active" ? (
            <KioskSnakeBorderCard fadeIn innerClassName="p-8">
              <div className="text-2xl font-semibold text-brand-ink">Welcome, {outcome.firstName}!</div>
              <p className="mt-4 text-lg leading-relaxed text-brand-muted">{outcome.lastTrainedLine}</p>
              <p className="mt-2 text-sm text-brand-muted">You&apos;re checked in. Have a great class.</p>
            </KioskSnakeBorderCard>
          ) : null}

          {outcome.kind === "trial" ? (
            <KioskSnakeBorderCard fadeIn innerClassName="p-8">
              <div className="text-2xl font-semibold text-brand-ink">{outcome.title}</div>
              <p className="mt-4 text-xl font-semibold text-brand-red">{outcome.body}</p>
              <p className="mt-3 text-sm text-brand-muted">You&apos;re checked in for today.</p>
            </KioskSnakeBorderCard>
          ) : null}

          {outcome.kind === "message" ? (
            <KioskSnakeBorderCard fadeIn innerClassName="p-8">
              <div className="text-2xl font-semibold text-brand-ink">{outcome.title}</div>
              {outcome.body ? (
                <p className="mt-4 text-lg leading-relaxed text-brand-muted">{outcome.body}</p>
              ) : null}
            </KioskSnakeBorderCard>
          ) : null}

          {outcome.kind === "guestWelcome" ? (
            <KioskSnakeBorderCard fadeIn innerClassName="p-8">
              <div className="text-2xl font-semibold text-brand-ink">Welcome, {outcome.firstName}!</div>
              <p className="mt-4 text-lg leading-relaxed text-brand-muted">{GUEST_WELCOME_TAGLINE}</p>
              <p className="mt-3 text-sm text-brand-muted">{guestTrialStatusLine(outcome.trialDaysLeft)}</p>
            </KioskSnakeBorderCard>
          ) : null}

          <button
            type="button"
            onClick={resetAfterOutcome}
            className="mt-8 w-full max-w-xl rounded-lg bg-brand-red px-4 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-hover"
          >
            Back to sign in
          </button>
          <p className="mt-3 max-w-xl text-center text-xs text-black/40">
            This screen will return to sign in shortly.
          </p>
        </div>
      ) : mode === "guestWaiver" ? (
        <div className="flex flex-1 flex-col px-5 py-8">
          <div className="mx-auto flex h-[min(90vh,880px)] w-full max-w-xl min-h-0 flex-col">
            <KioskSnakeBorderCard
              className="flex min-h-0 flex-1 flex-col"
              innerClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
            >
              <KioskInteractiveWaiver
                firstName={firstNameGuest}
                lastName={lastNameGuest}
                phone={phoneGuest}
                email={guestEmail}
                onComplete={completeGuestWaiver}
              />
            </KioskSnakeBorderCard>
          </div>
        </div>
      ) : mode === "guestForm" ? (
        <div className="flex flex-1 flex-col px-5 py-8">
          <div className="mx-auto w-full max-w-xl">
            <KioskSnakeBorderCard className="mx-auto" innerClassName="p-6 sm:p-8">
              <div className="flex justify-center border-b border-black/[0.06] pb-6">
                <DvbjjLogo variant="on-light" size="hero" />
              </div>

              <h1 className="mt-6 text-xl font-semibold tracking-tight text-brand-ink">Start your 7 day free trial</h1>
              <p className="mt-2 text-sm leading-relaxed text-brand-muted">
                Enter your information, then tap <span className="font-medium text-brand-ink">Enter</span> to check in.
              </p>

              <form className="mt-6 space-y-5" onSubmit={submitGuestCheckIn}>
                <div>
                  <label className="text-sm font-medium text-brand-ink" htmlFor="guest-first">
                    First Name
                  </label>
                  <input
                    id="guest-first"
                    value={firstNameGuest}
                    onChange={(e) => setFirstNameGuest(e.target.value)}
                    autoComplete="given-name"
                    className={inputClass}
                    placeholder="First Name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-brand-ink" htmlFor="guest-last">
                    Last Name
                  </label>
                  <input
                    id="guest-last"
                    value={lastNameGuest}
                    onChange={(e) => setLastNameGuest(e.target.value)}
                    autoComplete="family-name"
                    className={inputClass}
                    placeholder="Last Name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-brand-ink" htmlFor="guest-phone">
                    Phone Number
                  </label>
                  <input
                    id="guest-phone"
                    value={phoneGuest}
                    onChange={(e) => setPhoneGuest(e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    className={inputClass}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-brand-ink" htmlFor="guest-email">
                    Email
                  </label>
                  <input
                    id="guest-email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    inputMode="email"
                    autoComplete="email"
                    className={inputClass}
                    placeholder="you@example.com"
                  />
                </div>

                {searchError ? (
                  <p className="text-sm font-medium text-red-700" role="alert">
                    {searchError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={searchLoading || !isGuestFormComplete(firstNameGuest, lastNameGuest, phoneGuest, guestEmail)}
                  className="w-full rounded-lg bg-brand-red px-4 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-hover disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {searchLoading ? "Checking you in…" : "Enter"}
                </button>
              </form>

              <button
                type="button"
                onClick={goToPhoneEntry}
                className="mt-6 text-sm font-medium text-brand-muted underline decoration-brand-muted/50 underline-offset-4 hover:text-brand-ink"
              >
                ← Back to phone number
              </button>
            </KioskSnakeBorderCard>
          </div>
        </div>
      ) : mode === "profilePick" ? (
        <div className="flex flex-1 flex-col px-5 py-8">
          <div className="mx-auto w-full max-w-xl">
            <KioskSnakeBorderCard className="mx-auto" innerClassName="p-6 sm:p-8">
              <div className="flex justify-center border-b border-black/[0.06] pb-6">
                <DvbjjLogo variant="on-light" size="hero" />
              </div>

              <h1 className="mt-6 text-xl font-semibold tracking-tight text-brand-ink">
                {results.length === 0
                  ? "No matching profile"
                  : results.length > 1
                    ? "Choose your profile"
                    : "Confirm it's you"}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-brand-muted">
                <span className="font-medium text-brand-ink">{phoneDisplayLine}</span>
              </p>

              {showNotFoundContinueGuest ? (
                <div className="mt-6 space-y-2">
                  <p className="text-sm font-medium text-brand-ink">No profile found for this number.</p>
                  <p className="text-sm text-brand-muted">New here? Use the same number to start your free trial.</p>
                  <button
                    type="button"
                    onClick={openContinueAsGuest}
                    className="mt-1 w-full rounded-lg border border-black/20 bg-white px-4 py-3 text-base font-medium text-brand-ink shadow-sm transition-colors hover:border-black/35 hover:bg-black/[0.02]"
                  >
                    Start your 7 day free trial now?
                  </button>
                </div>
              ) : null}

              {searchError ? <div className="mt-6 text-sm font-medium text-red-700">{searchError}</div> : null}

              {results.length > 0 ? (
                <div className="mt-6">
                  <p className="mb-3 text-sm text-brand-muted">
                    {results.length > 1 ? "Tap the row that matches you." : "Tap below to check in."}
                  </p>
                  <div className="overflow-hidden rounded-xl border border-black/10">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleCheckInResult(r)}
                        disabled={searchLoading}
                        className="flex w-full border-b border-black/10 px-4 py-4 text-left last:border-b-0 hover:bg-neutral-100 active:bg-neutral-200/80 disabled:opacity-60"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-semibold text-brand-ink">{fullName(r)}</div>
                          <div className="mt-0.5 text-sm text-brand-muted">{phoneDisplayLine}</div>
                          <div className="mt-1.5 text-xs font-medium uppercase tracking-wide text-brand-muted">
                            {r.status === "member"
                              ? "Member"
                              : r.status === "trial"
                                ? "Trial"
                                : r.status === "guest"
                                  ? "Guest"
                                  : "Lead"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={backToPhoneEntry}
                className="mt-8 text-sm font-medium text-brand-muted underline decoration-brand-muted/50 underline-offset-4 hover:text-brand-ink"
              >
                ← Edit phone number
              </button>
            </KioskSnakeBorderCard>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col px-5 py-8">
          <KioskSnakeBorderCard className="mx-auto" innerClassName="p-6 sm:p-8">
            <div className="flex justify-center border-b border-black/[0.06] pb-6">
              <DvbjjLogo variant="on-light" size="hero" />
            </div>

            <h1 className="mt-6 text-center text-xl font-semibold tracking-tight text-brand-ink">Check In</h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-brand-muted">
              Enter your phone. Tap your name to check in, or start your 7 day free trial if you&apos;re new.
            </p>

            <form className="mt-6 space-y-5" onSubmit={runLookup}>
              <div>
                <label className="text-sm font-medium text-brand-ink" htmlFor="kiosk-phone">
                  Phone number
                </label>
                <input
                  id="kiosk-phone"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPhoneHint(null);
                  }}
                  inputMode="tel"
                  autoComplete="tel"
                  autoFocus
                  className={inputClass}
                  placeholder="(555) 123-4567"
                />
              </div>

              {phoneHint ? (
                <p className="text-sm font-medium text-brand-red" role="alert">
                  {phoneHint}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={searchLoading}
                className="w-full rounded-lg bg-brand-red px-4 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-hover disabled:cursor-not-allowed disabled:opacity-55"
              >
                {searchLoading ? "Looking you up…" : "Enter"}
              </button>
            </form>

            {searchError ? <div className="mt-3 text-sm font-medium text-red-700">{searchError}</div> : null}
          </KioskSnakeBorderCard>
        </div>
      )}
    </main>
  );
}
