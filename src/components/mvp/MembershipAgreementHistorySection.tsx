"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/mvpShared";
import type { MembershipAgreementRecord } from "@/lib/membershipAgreementTypes";

type MembershipAgreementHistorySectionProps = {
  personId: string;
};

export default function MembershipAgreementHistorySection({
  personId,
}: MembershipAgreementHistorySectionProps) {
  const [agreements, setAgreements] = useState<MembershipAgreementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/mvp/people/${personId}/membership-agreements`)
      .then((r) => r.json())
      .then((json: { agreements?: MembershipAgreementRecord[] }) => {
        if (!cancelled) setAgreements(json.agreements ?? []);
      })
      .catch(() => {
        if (!cancelled) setAgreements([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  if (loading) {
    return (
      <section className="mt-6 border-t border-black/[0.06] pt-5">
        <h3 className="text-sm font-semibold text-brand-ink">Membership agreements</h3>
        <p className="mt-2 text-sm text-brand-muted">Loading…</p>
      </section>
    );
  }

  if (agreements.length === 0) {
    return (
      <section className="mt-6 border-t border-black/[0.06] pt-5">
        <h3 className="text-sm font-semibold text-brand-ink">Membership agreements</h3>
        <p className="mt-2 text-sm text-brand-muted">No signed membership agreements on file yet.</p>
      </section>
    );
  }

  return (
    <section className="mt-6 border-t border-black/[0.06] pt-5">
      <h3 className="text-sm font-semibold text-brand-ink">
        Membership agreements ({agreements.length})
      </h3>
      <p className="mt-1 text-xs text-brand-muted">Tap a row to view plan choice and signatures.</p>
      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {agreements.map((a) => {
          const open = expandedId === a.id;
          return (
            <li key={a.id} className="rounded-lg border border-black/[0.06] bg-neutral-50/80">
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : a.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-brand-ink">Signed {formatDate(a.signedAt)}</span>
                  <span className="block truncate text-xs text-brand-muted">{a.planLabel}</span>
                </span>
                <span className="shrink-0 text-xs text-brand-muted">{open ? "Hide" : "View"}</span>
              </button>
              {open ? (
                <div className="space-y-3 border-t border-black/[0.06] px-3 py-3">
                  <p className="text-sm text-brand-ink">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                      Participant
                    </span>
                    <span className="mt-0.5 block">{a.participantName}</span>
                  </p>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                      Participant signature
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.participantSignature}
                      alt="Participant signature"
                      className="mt-1 max-h-24 rounded border border-black/10 bg-white"
                    />
                  </div>
                  {a.financialResponsibleName ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                        Financially responsible
                      </p>
                      <p className="mt-0.5 text-sm text-brand-ink">{a.financialResponsibleName}</p>
                      {a.financialResponsibleSignature ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.financialResponsibleSignature}
                          alt="Financially responsible signature"
                          className="mt-1 max-h-24 rounded border border-black/10 bg-white"
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
