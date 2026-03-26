"use client";

import { useEffect, useRef, useState } from "react";

type SearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  phoneMasked: string;
  status: "lead" | "trial" | "guest" | "member";
};

type CheckInResponse = {
  messageTitle: string;
  messageBody: string;
  confirmation: { checkInLogged: boolean };
};

function fullName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`.trim();
}

function sanitizeName(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function isQueryEmpty(firstName: string, lastName: string, phone: string) {
  return !sanitizeName(firstName) && !sanitizeName(lastName) && !phone.trim();
}

export default function KioskHome() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [mode, setMode] = useState<"search" | "confirm" | "addGuest">("search");
  const [confirmation, setConfirmation] = useState<CheckInResponse | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const [guestEmail, setGuestEmail] = useState("");

  const [debouncedQuery, setDebouncedQuery] = useState({ firstName: "", lastName: "", phone: "" });

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery({ firstName, lastName, phone });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [firstName, lastName, phone]);

  useEffect(() => {
    const run = async () => {
      setSearchError(null);

      if (mode !== "search") {
        setResults([]);
        return;
      }

      if (isQueryEmpty(debouncedQuery.firstName, debouncedQuery.lastName, debouncedQuery.phone)) {
        setResults([]);
        return;
      }

      setSearchLoading(true);

      try {
        const res = await fetch("/api/kiosk/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            firstName: sanitizeName(debouncedQuery.firstName) || undefined,
            lastName: sanitizeName(debouncedQuery.lastName) || undefined,
            phone: debouncedQuery.phone.trim() || undefined,
          }),
        });

        if (!res.ok) {
          throw new Error(`Search failed (${res.status})`);
        }

        const json = await res.json();
        setResults((json.results ?? []) as SearchResult[]);
      } catch (err: unknown) {
        setSearchError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        setSearchLoading(false);
      }
    };

    run().catch(() => {});
  }, [debouncedQuery, mode]);

  const clearResetTimer = () => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const resetToSearch = () => {
    clearResetTimer();
    setConfirmation(null);
    setMode("search");
    setGuestEmail("");
    // Keep inputs (touch-screen convenience) but you can clear if desired:
    // setFirstName(""); setLastName(""); setPhone("");
  };

  const startAutoReset = () => {
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => resetToSearch(), 5000);
  };

  const checkInPerson = async (personId: string) => {
    clearResetTimer();
    setSearchLoading(true);
    setSearchError(null);

    try {
      const res = await fetch("/api/kiosk/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ personId }),
      });

      const json = (await res.json()) as CheckInResponse | { error?: string };
      if (!res.ok || !("messageTitle" in json)) {
        const errorField = (json as { error?: unknown }).error;
        const errMsg: string | undefined = typeof errorField === "string" ? errorField : undefined;
        throw new Error(errMsg ?? `Check-in failed (${res.status})`);
      }

      setConfirmation(json as CheckInResponse);
      setMode("confirm");
      startAutoReset();
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const addGuestAndCheckIn = async () => {
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/kiosk/create-and-check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          firstName: sanitizeName(firstName),
          lastName: sanitizeName(lastName),
          phone: phone.trim(),
          email: guestEmail.trim() || undefined,
        }),
      });

      const json = (await res.json()) as CheckInResponse | { error?: string };
      if (!res.ok || !("messageTitle" in json)) {
        const errorField = (json as { error?: unknown }).error;
        const errMsg: string | undefined = typeof errorField === "string" ? errorField : undefined;
        throw new Error(errMsg ?? `Create guest check-in failed (${res.status})`);
      }

      setConfirmation(json as CheckInResponse);
      setMode("confirm");
      startAutoReset();
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : "Guest check-in failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const canCheckIn = results.length > 0;
  const showNotFoundAddGuest = mode === "search" && !searchLoading && isQueryEmpty(firstName, lastName, phone) === false && results.length === 0;

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="font-bold text-lg">DVBJJ Member Check-In</div>
          <div className="text-xs text-gray-500">{mode === "confirm" ? "Checking in..." : "Ready"}</div>
        </div>
      </div>

      {mode === "confirm" && confirmation ? (
        <div className="flex-1 p-4 flex flex-col justify-center items-center text-center">
          <div className="max-w-xl w-full border rounded p-6 bg-gray-50">
            <div className="text-2xl font-semibold">{confirmation.messageTitle}</div>
            {confirmation.messageBody ? <div className="mt-3 text-lg text-gray-700">{confirmation.messageBody}</div> : null}
            <div className="mt-6 flex gap-3 justify-center">
              <button
                onClick={resetToSearch}
                className="px-6 py-4 rounded bg-black text-white hover:bg-gray-800 text-base"
              >
                Back to Sign In
              </button>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">Returning automatically in ~5 seconds.</div>
        </div>
      ) : mode === "addGuest" ? (
        <div className="flex-1 p-4">
          <div className="max-w-xl mx-auto border rounded p-5 bg-white">
            <div className="text-xl font-semibold mb-3">Add as Guest</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-700 font-medium">First Name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full px-3 py-3 border rounded text-base"
                  placeholder="First name"
                />
              </div>
              <div>
                <label className="text-sm text-gray-700 font-medium">Last Name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full px-3 py-3 border rounded text-base"
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-sm text-gray-700 font-medium">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className="mt-1 w-full px-3 py-3 border rounded text-base"
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="mt-3">
              <label className="text-sm text-gray-700 font-medium">Email (optional)</label>
              <input
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                inputMode="email"
                className="mt-1 w-full px-3 py-3 border rounded text-base"
                placeholder="email@example.com"
              />
            </div>

            {searchError ? <div className="mt-3 text-sm text-red-700">{searchError}</div> : null}

            <div className="mt-5 flex gap-3">
              <button
                onClick={resetToSearch}
                className="flex-1 px-4 py-4 rounded border text-base hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addGuestAndCheckIn}
                disabled={searchLoading || !firstName.trim() || !lastName.trim() || !phone.trim()}
                className="flex-1 px-4 py-4 rounded bg-black text-white hover:bg-gray-800 disabled:opacity-60 text-base"
              >
                {searchLoading ? "Submitting..." : "Check In Guest"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-4">
          <div className="max-w-xl mx-auto w-full">
            <div className="text-xl font-semibold mb-3">Sign In</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-700 font-medium">First Name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full px-3 py-3 border rounded text-base"
                  placeholder="First name"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="text-sm text-gray-700 font-medium">Last Name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full px-3 py-3 border rounded text-base"
                  placeholder="Last name"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-sm text-gray-700 font-medium">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className="mt-1 w-full px-3 py-3 border rounded text-base"
                placeholder="(555) 123-4567"
                autoComplete="off"
              />
            </div>

            {searchError ? <div className="mt-3 text-sm text-red-700">{searchError}</div> : null}

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-600">
                  {searchLoading ? "Searching..." : results.length ? "Matches" : " " }
                </div>
                {canCheckIn ? <div className="text-xs text-gray-500">Tap a name</div> : null}
              </div>

              {results.length ? (
                <div className="border rounded overflow-hidden">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => checkInPerson(r.id)}
                      className="w-full text-left px-4 py-4 hover:bg-gray-50 active:bg-gray-100 border-b last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-semibold">
                          {fullName({ firstName: r.firstName, lastName: r.lastName })}
                        </div>
                        <div className="text-sm text-gray-600 whitespace-nowrap">{r.phoneMasked}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : showNotFoundAddGuest ? (
                <div className="border rounded p-4 bg-gray-50">
                  <div className="text-sm text-gray-700 font-medium">No matching member found.</div>
                  <div className="text-sm text-gray-600 mt-1">Add them as a guest to continue.</div>
                  <button
                    onClick={() => setMode("addGuest")}
                    className="mt-4 w-full px-4 py-4 rounded bg-black text-white hover:bg-gray-800 text-base"
                  >
                    Add as Guest
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
