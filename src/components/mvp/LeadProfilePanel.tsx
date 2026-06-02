"use client";

import { type ReactNode, useState } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import ModalPortal from "@/components/mvp/ModalPortal";
import AddParentDialog from "@/components/mvp/AddParentDialog";
import PersonParentsSection from "@/components/mvp/PersonParentsSection";
import PersonNotesSection from "@/components/mvp/PersonNotesSection";
import WaiverHistorySection from "@/components/mvp/WaiverHistorySection";
import { formatDate, fullName } from "@/lib/mvpShared";
import { formatPhoneDisplay } from "@/lib/phone";
import type { StaffLeadRow, StaffMemberParent } from "@/lib/staffDashboard";

type LeadProfilePanelProps = {
  lead: StaffLeadRow;
  subtitle?: string;
  /** One-time signup / inquiry notes from lead form (out-of-gym only). */
  signupNotes?: string | null;
  footer?: ReactNode;
  onClose: () => void;
  onLeadUpdate: (lead: StaffLeadRow) => void;
};

export default function LeadProfilePanel({
  lead,
  subtitle = "In-gym lead · first kiosk visit starts trial",
  signupNotes,
  footer,
  onClose,
  onLeadUpdate,
}: LeadProfilePanelProps) {
  const [showAddParent, setShowAddParent] = useState(false);
  const [parents, setParents] = useState<StaffMemberParent[]>(lead.parents ?? []);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-profile-title"
        onClick={onClose}
      >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <KioskSnakeBorderCard wide innerClassName="max-h-[min(88vh,640px)] overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] pb-4">
            <div className="min-w-0 flex-1">
              <h2 id="lead-profile-title" className="text-xl font-semibold text-brand-ink">
                {fullName(lead.firstName, lead.lastName)}
              </h2>
              <p className="mt-1 text-sm text-brand-muted">{subtitle}</p>
            </div>
            <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddParent(true)}
                className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-ink hover:bg-neutral-50"
              >
                Add parent
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-brand-muted hover:bg-neutral-50 hover:text-brand-ink"
              >
                Close
              </button>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Added</dt>
              <dd className="mt-0.5 text-brand-ink">{formatDate(lead.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Phone</dt>
              <dd className="mt-0.5 text-brand-ink">{formatPhoneDisplay(lead.phone)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Email</dt>
              <dd className="mt-0.5 break-all text-brand-ink">{lead.email ?? "—"}</dd>
            </div>
            {signupNotes ? (
              <div className="col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Signup notes</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-brand-ink">{signupNotes}</dd>
              </div>
            ) : null}
          </dl>

          {parents.length > 0 ? <PersonParentsSection parents={parents} /> : null}

          <WaiverHistorySection personId={lead.id} />

          <PersonNotesSection
            personId={lead.id}
            notes={lead.notes}
            notesApiBase="/api/mvp/people"
            onNotesChange={(notes) => onLeadUpdate({ ...lead, notes })}
            placeholder="Note about this lead…"
          />

          {footer ? <div className="mt-6 border-t border-black/[0.06] pt-5">{footer}</div> : null}
        </KioskSnakeBorderCard>
      </div>

      {showAddParent ? (
        <AddParentDialog
          personId={lead.id}
          existingParents={parents}
          onClose={() => setShowAddParent(false)}
          onSaved={(next) => {
            setParents(next);
            onLeadUpdate({ ...lead, parents: next });
          }}
        />
      ) : null}
      </div>
    </ModalPortal>
  );
}
