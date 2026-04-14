"use client";

import { type FormEvent, useRef, useState } from "react";
import { formatLastTrainedLine } from "@/lib/lastTrained";
import { normalizePhone } from "@/lib/phone";
import {
  KIOSK_MEMBERSHIP_ATTENTION_BODY,
  KIOSK_MEMBERSHIP_ATTENTION_TITLE,
} from "@/lib/statusResolver";
import DvbjjLogo from "@/components/DvbjjLogo";

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
};

type Outcome =
  | { kind: "membershipHold" }
  | { kind: "active"; firstName: string; lastTrainedLine: string }
  | { kind: "trial"; title: string; body: string }
  | { kind: "message"; title: string; body: string }
  | { kind: "guestWelcome"; firstName: string };

const GUEST_WELCOME_TAGLINE =
  "We're glad you're here—your journey with DVBJJ starts today. See the front desk if you need anything before class.";

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

/** Both last name and phone (enough digits) are required before we search. */
function isSearchComplete(lastName: string, phone: string) {
  const ln = sanitizeName(lastName);
  const digits = normalizePhone(phone);
  return ln.length > 0 && digits.length >= 4;
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
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const [firstNameGuest, setFirstNameGuest] = useState("");
  const [lastNameGuest, setLastNameGuest] = useState("");
  const [phoneGuest, setPhoneGuest] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  const [results, setResults] = useState<KioskSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  type FlowMode = "landing" | "memberSearch" | "guestForm" | "outcome";
  const [mode, setMode] = useState<FlowMode>("landing");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const [bothFieldsHint, setBothFieldsHint] = useState<string | null>(null);
  const [lastLookupKey, setLastLookupKey] = useState<string | null>(null);

  function lookupQueryKey(ln: string, ph: string) {
    return `${sanitizeName(ln)}|${normalizePhone(ph)}`;
  }

  function clearMemberSearchState() {
    setLastName("");
    setPhone("");
    setResults([]);
    setSearchError(null);
    setBothFieldsHint(null);
    setLastLookupKey(null);
  }

  function clearGuestFormState() {
    setFirstNameGuest("");
    setLastNameGuest("");
    setPhoneGuest("");
    setGuestEmail("");
  }

  const goToLanding = () => {
    clearResetTimer();
    setOutcome(null);
    clearMemberSearchState();
    clearGuestFormState();
    setSearchError(null);
    setMode("landing");
  };

  const resetAfterOutcome = () => {
    goToLanding();
  };

  const runLookup = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();

    if (mode !== "memberSearch") return;

    if (!isSearchComplete(lastName, phone)) {
      setBothFieldsHint("Please enter both your last name and phone number so we can find you.");
      return;
    }

    setBothFieldsHint(null);
    setSearchError(null);
    setSearchLoading(true);

    const notFoundMsg = "Member profile not found. Try again.";

    try {
      const res = await fetch("/api/kiosk/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          lastName: sanitizeName(lastName),
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
          return;
        }
      }

      if (!res.ok) {
        const serverMsg = typeof json.error === "string" ? json.error : null;
        setSearchError(res.status === 400 && serverMsg ? serverMsg : notFoundMsg);
        setResults([]);
        setLastLookupKey(null);
        return;
      }

      setSearchError(null);
      setResults((json.results ?? []) as KioskSearchResult[]);
      setLastLookupKey(lookupQueryKey(lastName, phone));
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

      setOutcome({ kind: "guestWelcome", firstName: welcomeFirst });
      setMode("outcome");
      startAutoReset();
    } catch {
      setSearchError(guestFailMsg);
    } finally {
      setSearchLoading(false);
    }
  };

  const openContinueAsGuest = () => {
    setFirstNameGuest("");
    setLastNameGuest(sanitizeName(lastName));
    setPhoneGuest(phone.trim());
    setGuestEmail("");
    setSearchError(null);
    setMode("guestForm");
  };

  const startMemberFlow = () => {
    clearMemberSearchState();
    setMode("memberSearch");
  };

  const startGuestFlow = () => {
    clearGuestFormState();
    setSearchError(null);
    setMode("guestForm");
  };

  const currentLookupKey = lookupQueryKey(lastName, phone);
  const showNotFoundContinueGuest =
    mode === "memberSearch" &&
    !searchLoading &&
    lastLookupKey !== null &&
    lastLookupKey === currentLookupKey &&
    results.length === 0 &&
    !searchError;

  const outcomeCardClass =
    "max-w-xl w-full rounded-2xl border border-black/[0.06] bg-white p-8 shadow-[0_24px_80px_-20px_rgba(12,12,14,0.18)] border-l-4";

  const headerStatus =
    mode === "outcome"
      ? "Thanks for checking in"
      : mode === "guestForm"
        ? "Guest Check In"
        : mode === "memberSearch"
          ? "Member Check In"
          : "Welcome";

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
          <div className="text-xs text-[#a8a6a3] sm:text-right">{headerStatus}</div>
        </div>
      </header>

      {mode === "outcome" && outcome ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
          {outcome.kind === "membershipHold" ? (
            <div className={`${outcomeCardClass} border-l-brand-red`}>
              <div className="text-2xl font-semibold text-brand-ink">{KIOSK_MEMBERSHIP_ATTENTION_TITLE}</div>
              <p className="mt-3 text-base leading-relaxed text-brand-muted">{KIOSK_MEMBERSHIP_ATTENTION_BODY}</p>
            </div>
          ) : null}

          {outcome.kind === "active" ? (
            <div className={`${outcomeCardClass} border-l-brand-red`}>
              <div className="text-2xl font-semibold text-brand-ink">Welcome, {outcome.firstName}!</div>
              <p className="mt-4 text-lg leading-relaxed text-brand-muted">{outcome.lastTrainedLine}</p>
              <p className="mt-2 text-sm text-brand-muted">You&apos;re checked in. Have a great class.</p>
            </div>
          ) : null}

          {outcome.kind === "trial" ? (
            <div className={`${outcomeCardClass} border-l-brand-red`}>
              <div className="text-2xl font-semibold text-brand-ink">{outcome.title}</div>
              <p className="mt-4 text-xl font-semibold text-brand-red">{outcome.body}</p>
              <p className="mt-3 text-sm text-brand-muted">You&apos;re checked in for today.</p>
            </div>
          ) : null}

          {outcome.kind === "message" ? (
            <div className={`${outcomeCardClass} border-l-brand-red`}>
              <div className="text-2xl font-semibold text-brand-ink">{outcome.title}</div>
              {outcome.body ? (
                <p className="mt-4 text-lg leading-relaxed text-brand-muted">{outcome.body}</p>
              ) : null}
            </div>
          ) : null}

          {outcome.kind === "guestWelcome" ? (
            <div className={`${outcomeCardClass} border-l-brand-red`}>
              <div className="text-2xl font-semibold text-brand-ink">Welcome, {outcome.firstName}!</div>
              <p className="mt-4 text-lg leading-relaxed text-brand-muted">{GUEST_WELCOME_TAGLINE}</p>
              <p className="mt-3 text-sm text-brand-muted">You&apos;re checked in for today.</p>
            </div>
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
      ) : mode === "guestForm" ? (
        <div className="flex flex-1 flex-col px-5 py-8">
          <div className="mx-auto w-full max-w-xl">
            <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm border-l-4 border-l-brand-red sm:p-8">
              <div className="flex justify-center border-b border-black/[0.06] pb-6">
                <DvbjjLogo variant="on-light" size="hero" />
              </div>

              <h1 className="mt-6 text-xl font-semibold tracking-tight text-brand-ink">Guest Check In</h1>
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
                onClick={goToLanding}
                className="mt-6 text-sm font-medium text-brand-muted underline decoration-brand-muted/50 underline-offset-4 hover:text-brand-ink"
              >
                ← Back to sign in options
              </button>
            </div>
          </div>
        </div>
      ) : mode === "memberSearch" ? (
        <div className="flex flex-1 flex-col px-5 py-8">
          <div className="mx-auto w-full max-w-xl">
            <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm border-l-4 border-l-brand-red sm:p-8">
              <div className="flex justify-center border-b border-black/[0.06] pb-6">
                <DvbjjLogo variant="on-light" size="hero" />
              </div>

              <h1 className="mt-6 text-xl font-semibold tracking-tight text-brand-ink">Member Check In</h1>
              <p className="mt-2 text-sm leading-relaxed text-brand-muted">
                Enter your last name and phone number, then tap <span className="font-medium text-brand-ink">Enter</span>{" "}
                to look up your profile.
              </p>

              <form className="mt-6 space-y-5" onSubmit={runLookup}>
                <div>
                  <label className="text-sm font-medium text-brand-ink" htmlFor="kiosk-last">
                    Last Name
                  </label>
                  <input
                    id="kiosk-last"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      setBothFieldsHint(null);
                    }}
                    autoComplete="family-name"
                    className={inputClass}
                    placeholder="Last Name"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-brand-ink" htmlFor="kiosk-phone">
                    Phone Number
                  </label>
                  <input
                    id="kiosk-phone"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setBothFieldsHint(null);
                    }}
                    inputMode="tel"
                    autoComplete="tel"
                    className={inputClass}
                    placeholder="(555) 123-4567"
                  />
                </div>

                {bothFieldsHint ? (
                  <p className="text-sm font-medium text-brand-red" role="alert">
                    {bothFieldsHint}
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

              {showNotFoundContinueGuest ? (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium text-brand-ink">Member profile not found. Try again.</p>
                  <p className="text-sm text-brand-muted">New here? You can continue as a guest instead.</p>
                  <button
                    type="button"
                    onClick={openContinueAsGuest}
                    className="mt-1 w-full rounded-lg border border-black/20 bg-white px-4 py-3 text-base font-medium text-brand-ink shadow-sm transition-colors hover:border-black/35 hover:bg-black/[0.02]"
                  >
                    Continue as guest
                  </button>
                </div>
              ) : null}

              {searchError ? <div className="mt-3 text-sm font-medium text-red-700">{searchError}</div> : null}

              {results.length > 0 || searchLoading ? (
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm text-brand-muted">
                      {searchLoading ? "Searching…" : results.length > 0 ? "Tap your profile to check in." : null}
                    </div>
                  </div>

                  {results.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-black/10">
                      {results.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleCheckInResult(r)}
                          disabled={searchLoading}
                          className="flex w-full items-center justify-between gap-3 border-b border-black/10 px-4 py-4 text-left last:border-b-0 hover:bg-neutral-100 active:bg-neutral-200/80 disabled:opacity-60"
                        >
                          <div>
                            <div className="text-base font-semibold text-brand-ink">{fullName(r)}</div>
                            <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-brand-muted">
                              {r.status === "member"
                                ? "Member"
                                : r.status === "trial"
                                  ? "Trial"
                                  : r.status === "guest"
                                    ? "Guest"
                                    : "Lead"}
                            </div>
                          </div>
                          <div className="text-sm text-brand-muted whitespace-nowrap">{r.phoneMasked}</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={goToLanding}
                className="mt-8 text-sm font-medium text-brand-muted underline decoration-brand-muted/50 underline-offset-4 hover:text-brand-ink"
              >
                ← Back to sign in options
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
          <div className="w-full max-w-xl">
            <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm border-l-4 border-l-brand-red sm:p-8">
              <div className="flex justify-center border-b border-black/[0.06] pb-6">
                <DvbjjLogo variant="on-light" size="hero" />
              </div>

              <h1 className="mt-6 text-center text-xl font-semibold tracking-tight text-brand-ink">Welcome!</h1>
              <p className="mt-2 text-center text-sm leading-relaxed text-brand-muted">
                Choose how you&apos;d like to check in today.
              </p>

              <div className="mt-8 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={startMemberFlow}
                  className="w-full rounded-lg bg-brand-red px-4 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-hover"
                >
                  Member
                </button>
                <button
                  type="button"
                  onClick={startGuestFlow}
                  className="w-full rounded-lg border-2 border-black/15 bg-white px-4 py-3.5 text-base font-medium text-brand-ink shadow-sm transition-colors hover:border-black/25 hover:bg-black/[0.02]"
                >
                  Guest
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
