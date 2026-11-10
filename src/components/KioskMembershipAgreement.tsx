"use client";

import { format } from "date-fns";
import { useMemo, useRef, useState } from "react";
import DvbjjLogo from "@/components/DvbjjLogo";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";
import {
  MEMBERSHIP_ACKNOWLEDGEMENT,
  MEMBERSHIP_AGREEMENT_TITLE,
  MEMBERSHIP_BILLING_HEADING,
  MEMBERSHIP_BILLING_SECTIONS,
  MEMBERSHIP_DISCOUNT_NOTE,
  MEMBERSHIP_PLAN_OPTIONS,
  MEMBERSHIP_REGISTRATION_FEE,
  MEMBERSHIP_REGISTRATION_NOTE,
  type MembershipPlanId,
} from "@/lib/membershipAgreementCopy";
import type { MembershipAgreementSubmitPayload } from "@/lib/membershipAgreementTypes";

const inputFill =
  "mt-1 w-full rounded-lg border border-black/10 px-3 py-3 text-base outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";
const sectionLabel = "text-xs font-semibold uppercase tracking-wide text-brand-muted";

type KioskMembershipAgreementProps = {
  firstName: string;
  lastName: string;
  onComplete: (payload: MembershipAgreementSubmitPayload) => void | Promise<void>;
  submitting?: boolean;
};

export default function KioskMembershipAgreement({
  firstName,
  lastName,
  onComplete,
  submitting = false,
}: KioskMembershipAgreementProps) {
  const defaultName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
  const [planId, setPlanId] = useState<MembershipPlanId | "">("");
  const [participantName, setParticipantName] = useState(defaultName);
  const [financialName, setFinancialName] = useState("");
  const [participantSigEmpty, setParticipantSigEmpty] = useState(true);
  const [financialSigEmpty, setFinancialSigEmpty] = useState(true);
  const participantPadRef = useRef<SignaturePadHandle>(null);
  const financialPadRef = useRef<SignaturePadHandle>(null);
  const todayLabel = useMemo(() => format(new Date(), "MMMM d, yyyy"), []);

  const canContinue =
    planId.length > 0 &&
    participantName.trim().length > 1 &&
    !participantSigEmpty;

  function handleContinue() {
    if (!planId || !canContinue) return;
    const participantSignature = participantPadRef.current?.getDataUrl();
    if (!participantSignature) return;
    const plan = MEMBERSHIP_PLAN_OPTIONS.find((p) => p.id === planId);
    if (!plan) return;

    void onComplete({
      planId,
      participantName: participantName.trim(),
      participantSignature,
      financialResponsibleName: financialName.trim() || null,
      financialResponsibleSignature: financialName.trim()
        ? financialPadRef.current?.getDataUrl() ?? null
        : null,
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-black/[0.06] bg-white px-6 pb-4 pt-6 sm:px-8">
        <div className="flex justify-center pb-4">
          <DvbjjLogo variant="on-light" size="hero" />
        </div>
        <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
          Become a member
        </p>
        <h1 className="mt-2 text-center text-xl font-semibold tracking-tight text-brand-ink">
          Membership agreement
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-brand-muted">
          Choose a plan, review the terms, then sign below.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
        <h2 className="text-center text-base font-semibold text-brand-ink">{MEMBERSHIP_AGREEMENT_TITLE}</h2>
        <hr className="my-4 border-black/10" />

        <p className="text-sm font-medium text-brand-ink">Please select one membership option:</p>
        <div className="mt-3 space-y-2">
          {MEMBERSHIP_PLAN_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={[
                "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-3 text-sm transition",
                planId === opt.id
                  ? "border-brand-ink bg-brand-ink/[0.04]"
                  : "border-black/10 hover:bg-black/[0.02]",
              ].join(" ")}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="membership-plan"
                  value={opt.id}
                  checked={planId === opt.id}
                  onChange={() => setPlanId(opt.id)}
                  className="h-4 w-4 accent-brand-ink"
                />
                <span className="font-medium text-brand-ink">{opt.label}</span>
              </span>
              <span className="shrink-0 text-brand-muted">{opt.priceLabel}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm font-semibold text-brand-ink">{MEMBERSHIP_DISCOUNT_NOTE}</p>

        <div className="mt-5 rounded-xl border border-black/[0.06] bg-neutral-50 px-4 py-3">
          <p className="text-sm font-semibold text-brand-ink">
            One-Time Registration Fee: {MEMBERSHIP_REGISTRATION_FEE}
          </p>
          <p className="mt-1 text-sm text-brand-muted">{MEMBERSHIP_REGISTRATION_NOTE}</p>
        </div>

        <h3 className="mt-6 text-base font-semibold text-brand-ink">{MEMBERSHIP_BILLING_HEADING}</h3>
        <div className="mt-3 space-y-4">
          {MEMBERSHIP_BILLING_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-sm font-semibold text-brand-ink">{section.title}</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-brand-muted">
                {section.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-6 text-sm leading-relaxed text-brand-ink">{MEMBERSHIP_ACKNOWLEDGEMENT}</p>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className={sectionLabel}>Participant name (print)</span>
            <input
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              className={inputFill}
              autoComplete="name"
              required
            />
          </label>

          <SignaturePad
            ref={participantPadRef}
            label="Participant signature *"
            onEmptyChange={setParticipantSigEmpty}
          />

          <label className="block">
            <span className={sectionLabel}>Financially responsible (if different)</span>
            <input
              value={financialName}
              onChange={(e) => setFinancialName(e.target.value)}
              className={inputFill}
              placeholder="Optional"
            />
          </label>

          {financialName.trim() ? (
            <SignaturePad
              ref={financialPadRef}
              label="Financially responsible signature *"
              onEmptyChange={setFinancialSigEmpty}
            />
          ) : null}

          <p className="text-sm text-brand-muted">Date: {todayLabel}</p>
        </div>
      </div>

      <div className="shrink-0 border-t border-black/[0.06] bg-white px-6 py-4 sm:px-8">
        <button
          type="button"
          disabled={!canContinue || submitting || (financialName.trim().length > 0 && financialSigEmpty)}
          onClick={handleContinue}
          className="w-full rounded-lg bg-brand-red px-4 py-3.5 text-base font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Sign & submit agreement"}
        </button>
      </div>
    </div>
  );
}
