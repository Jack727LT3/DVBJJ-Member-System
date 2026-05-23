"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/mvpShared";
import type { LiabilityWaiverRecord } from "@/lib/waiverTypes";

type WaiverHistorySectionProps = {
  personId: string;
};

export default function WaiverHistorySection({ personId }: WaiverHistorySectionProps) {
  const [waivers, setWaivers] = useState<LiabilityWaiverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/mvp/people/${personId}/waivers`)
      .then((r) => r.json())
      .then((json: { waivers?: LiabilityWaiverRecord[] }) => {
        if (!cancelled) setWaivers(json.waivers ?? []);
      })
      .catch(() => {
        if (!cancelled) setWaivers([]);
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
        <h3 className="text-sm font-semibold text-brand-ink">Liability waivers</h3>
        <p className="mt-2 text-sm text-brand-muted">Loading…</p>
      </section>
    );
  }

  if (waivers.length === 0) {
    return (
      <section className="mt-6 border-t border-black/[0.06] pt-5">
        <h3 className="text-sm font-semibold text-brand-ink">Liability waivers</h3>
        <p className="mt-2 text-sm text-brand-muted">No signed waivers on file yet.</p>
      </section>
    );
  }

  return (
    <section className="mt-6 border-t border-black/[0.06] pt-5">
      <h3 className="text-sm font-semibold text-brand-ink">Liability waivers ({waivers.length})</h3>
      <p className="mt-1 text-xs text-brand-muted">Tap a row to view stored signatures.</p>
      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {waivers.map((w) => {
          const open = expandedId === w.id;
          return (
            <li key={w.id} className="rounded-lg border border-black/[0.06] bg-neutral-50/80">
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : w.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
              >
                <span className="font-medium text-brand-ink">Signed {formatDate(w.signedAt)}</span>
                <span className="text-xs text-brand-muted">DOB {w.dateOfBirth}</span>
              </button>
              {open ? (
                <div className="space-y-3 border-t border-black/[0.06] px-3 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                      Participant signature
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={w.participantSignature}
                      alt="Participant signature"
                      className="mt-1 max-h-24 rounded border border-black/10 bg-white"
                    />
                  </div>
                  {w.parentSignature ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                        Parent / guardian {w.parentName ? `(${w.parentName})` : ""}
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={w.parentSignature}
                        alt="Parent signature"
                        className="mt-1 max-h-24 rounded border border-black/10 bg-white"
                      />
                      {w.parentConsentDate ? (
                        <p className="mt-1 text-xs text-brand-muted">Date: {w.parentConsentDate}</p>
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
