"use client";

import { format } from "date-fns";
import { useMemo, useState } from "react";
import DvbjjLogo from "@/components/DvbjjLogo";
import SignaturePad from "@/components/SignaturePad";
import { WAIVER_NOTICE, WAIVER_PARAGRAPHS, WAIVER_TITLE } from "@/lib/waiverCopy";

function sanitizeDisplay(first: string, last: string) {
  const f = first.replace(/\s+/g, " ").trim();
  const l = last.replace(/\s+/g, " ").trim();
  return `${f} ${l}`.trim();
}

function ageFromDobYmd(ymd: string): number | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const inputReadonly =
  "mt-1 w-full rounded-lg border border-black/10 bg-neutral-50 px-3 py-3 text-base text-brand-ink outline-none";
const inputFill =
  "mt-1 w-full rounded-lg border border-black/10 px-3 py-3 text-base outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";
const sectionLabel = "text-xs font-semibold uppercase tracking-wide text-brand-muted";

type KioskInteractiveWaiverProps = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  onComplete: () => void;
};

export default function KioskInteractiveWaiver({
  firstName,
  lastName,
  phone,
  email,
  onComplete,
}: KioskInteractiveWaiverProps) {
  const fullName = useMemo(() => sanitizeDisplay(firstName, lastName), [firstName, lastName]);

  const [dob, setDob] = useState("");
  const [participantSigEmpty, setParticipantSigEmpty] = useState(true);
  const [parentSigEmpty, setParentSigEmpty] = useState(true);
  const [parentName, setParentName] = useState("");
  const [parentConsentDate, setParentConsentDate] = useState("");

  const age = ageFromDobYmd(dob);
  const isMinor = age !== null && age < 18;
  const isAdult = age !== null && age >= 18;

  const todayLabel = useMemo(() => format(new Date(), "MMMM d, yyyy"), []);

  const canContinue =
    dob.length > 0 &&
    age !== null &&
    !participantSigEmpty &&
    (isAdult || (isMinor && parentName.trim().length > 0 && !parentSigEmpty && parentConsentDate.length > 0));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-black/[0.06] bg-white px-6 pb-4 pt-6 sm:px-8">
        <div className="flex justify-center pb-4">
          <DvbjjLogo variant="on-light" size="hero" />
        </div>
        <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
          DVBJJ Academy Liability Waiver
        </p>
        <h1 className="mt-2 text-center text-xl font-semibold tracking-tight text-brand-ink">Liability waiver</h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-brand-muted">
          Review the agreement below, then complete the highlighted fields and sign. Scroll to the bottom to sign.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 sm:px-8">
        <p className="pt-4 text-center text-sm font-semibold text-brand-ink">{WAIVER_TITLE}</p>
        <p className="mt-2 text-center text-xs font-medium text-brand-red">{WAIVER_NOTICE}</p>

        <div className="mt-4 space-y-3 text-left text-sm leading-relaxed text-brand-ink">
          {WAIVER_PARAGRAPHS.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <div className="mt-8 rounded-xl border-2 border-brand-red/25 bg-brand-cream p-4 sm:p-5">
          <p className={sectionLabel}>Required — your information</p>
          <p className="mt-1 text-xs text-brand-muted">Pre-filled from your check-in. Add your date of birth so we can finish the waiver.</p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-brand-ink" htmlFor="waiver-full-name">
                Participant&apos;s full name (print)
              </label>
              <input id="waiver-full-name" readOnly className={inputReadonly} value={fullName} />
            </div>

            <div>
              <label className="text-sm font-medium text-brand-ink" htmlFor="waiver-dob">
                Date of birth <span className="text-brand-red">*</span>
              </label>
              <input
                id="waiver-dob"
                type="date"
                className={inputFill}
                value={dob}
                max={format(new Date(), "yyyy-MM-dd")}
                min="1920-01-01"
                onChange={(e) => setDob(e.target.value)}
                required
              />
              {age !== null ? (
                <p className="mt-1 text-sm text-brand-muted">
                  Age: <span className="font-semibold text-brand-ink">{age}</span> years
                  {isMinor ? <span className="text-brand-red"> — parent/guardian must sign below</span> : null}
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-medium text-brand-ink" htmlFor="waiver-phone">
                Phone
              </label>
              <input id="waiver-phone" readOnly className={inputReadonly} value={phone} />
            </div>

            <div>
              <label className="text-sm font-medium text-brand-ink" htmlFor="waiver-email">
                Email
              </label>
              <input id="waiver-email" readOnly className={inputReadonly} value={email} />
            </div>

            <div>
              <span className="text-sm font-medium text-brand-ink">Date (signature)</span>
              <div className="mt-1 rounded-lg border border-black/10 bg-neutral-50 px-3 py-3 text-base text-brand-ink">
                {todayLabel}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <SignaturePad
            label="Participant’s signature *"
            onEmptyChange={setParticipantSigEmpty}
            disabled={!dob || age === null}
            disabledHint="Enter your date of birth above to sign."
          />
        </div>

        <div className="mt-8 border-t border-black/10 pt-6">
          <p className="text-sm font-semibold text-brand-ink">If participant is under 18</p>
          {isAdult ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-brand-muted">You indicated you are 18 or older. The following do not apply:</p>
              <div className="grid gap-2 sm:grid-cols-1">
                <div className="rounded-lg border border-black/10 bg-neutral-50 px-3 py-2 text-sm">
                  <span className="text-brand-muted">Parent / guardian name (print): </span>
                  <span className="font-medium text-brand-ink">N/A</span>
                </div>
                <div className="rounded-lg border border-black/10 bg-neutral-50 px-3 py-2 text-sm">
                  <span className="text-brand-muted">Parent / guardian signature: </span>
                  <span className="font-medium text-brand-ink">N/A</span>
                </div>
                <div className="rounded-lg border border-black/10 bg-neutral-50 px-3 py-2 text-sm">
                  <span className="text-brand-muted">Date: </span>
                  <span className="font-medium text-brand-ink">N/A</span>
                </div>
              </div>
            </div>
          ) : isMinor ? (
            <div className="mt-3 space-y-4">
              <p className="text-xs text-brand-muted">A parent or legal guardian must complete this section.</p>
              <div>
                <label className="text-sm font-medium text-brand-ink" htmlFor="waiver-parent-name">
                  Parent / guardian name (print) <span className="text-brand-red">*</span>
                </label>
                <input
                  id="waiver-parent-name"
                  className={inputFill}
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <SignaturePad label="Parent / guardian signature *" onEmptyChange={setParentSigEmpty} />
              <div>
                <label className="text-sm font-medium text-brand-ink" htmlFor="waiver-parent-date">
                  Date <span className="text-brand-red">*</span>
                </label>
                <input
                  id="waiver-parent-date"
                  type="date"
                  className={inputFill}
                  value={parentConsentDate}
                  max={format(new Date(), "yyyy-MM-dd")}
                  min="2020-01-01"
                  onChange={(e) => setParentConsentDate(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-brand-muted">Enter your date of birth above to show parent/guardian fields if needed.</p>
          )}
        </div>

        <div className="h-4" />
      </div>

      <div className="shrink-0 border-t border-black/[0.06] bg-white px-6 py-4 sm:px-8">
        <button
          type="button"
          disabled={!canContinue}
          onClick={onComplete}
          className="w-full rounded-lg bg-brand-red px-4 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
        </button>
        {!canContinue ? (
          <p className="mt-2 text-center text-xs text-brand-muted">
            Enter your date of birth, sign above, and complete any parent fields if you’re under 18.
          </p>
        ) : null}
      </div>
    </div>
  );
}
