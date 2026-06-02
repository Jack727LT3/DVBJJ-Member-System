"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AddOutOfGymLeadDialog from "@/components/mvp/AddOutOfGymLeadDialog";
import LeadProfilePanel from "@/components/mvp/LeadProfilePanel";
import PromoteToGuestFooter from "@/components/mvp/PromoteToGuestFooter";
import type { OutOfStoreLead } from "@/lib/outOfStoreLeads";
import { normalizeOutOfStoreLead } from "@/lib/outOfStoreLeads";
import { formatDate, fullName } from "@/lib/mvpShared";
import { formatPhoneDisplay } from "@/lib/phone";
import type { StaffGuestRow, StaffLeadRow } from "@/lib/staffDashboard";

const DEMO_STORAGE_KEY = "dvbjj-out-of-store-leads";
const LIST_LIMIT = 50;

function loadDemoExtras(): OutOfStoreLead[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed) ? parsed.map((row) => normalizeOutOfStoreLead(row as Partial<OutOfStoreLead>)) : [];
  } catch {
    return [];
  }
}

function toProfileLead(lead: OutOfStoreLead): StaffLeadRow {
  return {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    phone: lead.phone,
    email: lead.email,
    createdAt: lead.createdAt,
    parents: [],
    notes: [],
  };
}

function saveDemoExtras(leads: OutOfStoreLead[]) {
  const extras = leads.filter((l) => l.id.startsWith("demo-oos-"));
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(extras));
}

type OutOfStoreLeadsTabProps = {
  dashboardSource: "live" | "demo";
  showAddForm: boolean;
  onAddFormClose: () => void;
  onPromotedToGuest?: (guest: StaffGuestRow) => void;
  onCountChange?: (count: number) => void;
};

export default function OutOfStoreLeadsTab({
  dashboardSource,
  showAddForm,
  onAddFormClose,
  onPromotedToGuest,
  onCountChange,
}: OutOfStoreLeadsTabProps) {
  const [leads, setLeads] = useState<OutOfStoreLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"live" | "demo">(dashboardSource);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const mergeLeads = useCallback((serverLeads: OutOfStoreLead[], isDemo: boolean) => {
    if (!isDemo) {
      setLeads(serverLeads);
      return;
    }
    const extras = loadDemoExtras();
    const byId = new Map<string, OutOfStoreLead>();
    for (const l of serverLeads) byId.set(l.id, l);
    for (const l of extras) byId.set(l.id, l);
    setLeads([...byId.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mvp/out-of-store-leads", { cache: "no-store" });
      const json = (await res.json()) as { source: "live" | "demo"; leads: OutOfStoreLead[] };
      setSource(json.source);
      mergeLeads((json.leads ?? []).map((l) => normalizeOutOfStoreLead(l)), json.source === "demo");
    } finally {
      setLoading(false);
    }
  }, [mergeLeads]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    onCountChange?.(leads.length);
  }, [leads.length, onCountChange]);

  const leadsShown = useMemo(() => leads.slice(0, LIST_LIMIT), [leads]);

  function persistDemoIfNeeded(next: OutOfStoreLead[], leadId?: string) {
    if (source === "demo" || (leadId && leadId.startsWith("demo-oos-"))) {
      saveDemoExtras(next);
    }
  }

  function handleLeadAdded(lead: OutOfStoreLead, leadSource: "live" | "demo") {
    const normalized = normalizeOutOfStoreLead(lead);
    setLeads((prev) => {
      const next = [normalized, ...prev.filter((l) => l.id !== normalized.id)];
      if (leadSource === "demo" || source === "demo") saveDemoExtras(next);
      return next;
    });
  }

  function removeLeadFromList(leadId: string) {
    setLeads((current) => {
      const next = current.filter((l) => l.id !== leadId);
      persistDemoIfNeeded(next, leadId);
      return next;
    });
  }

  function handlePromotedToGuest(guest: StaffGuestRow) {
    removeLeadFromList(guest.id);
    setSelectedLeadId(null);
    onPromotedToGuest?.(guest);
  }

  const selectedLead = leads.find((l) => l.id === selectedLeadId) ?? null;

  return (
    <>
      {loading ? (
        <p className="px-4 py-8 text-center text-sm text-brand-muted sm:px-6">Loading leads…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-brand-muted">
              <tr>
                <th className="px-4 py-3 sm:px-6">Name</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {leadsShown.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-brand-muted sm:px-6">
                    No out-of-gym leads yet.
                  </td>
                </tr>
              ) : (
                leadsShown.map((lead) => (
                  <tr
                    key={lead.id}
                    className="cursor-pointer align-top hover:bg-brand-red/[0.04] active:bg-brand-red/[0.07]"
                    onClick={() => setSelectedLeadId(lead.id)}
                  >
                    <td className="px-4 py-3 font-medium sm:px-6">
                      <span className="underline decoration-brand-red/25 decoration-dotted underline-offset-2">
                        {fullName(lead.firstName, lead.lastName)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-brand-muted">{formatDate(lead.createdAt)}</td>
                    <td className="px-4 py-3 text-brand-muted">{formatPhoneDisplay(lead.phone)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {source === "demo" && !loading ? (
        <p className="border-t border-black/[0.06] px-4 py-3 text-center text-xs text-brand-muted sm:px-6">
          Demo mode — new leads save in this browser until Supabase is connected.
        </p>
      ) : null}

      <AddOutOfGymLeadDialog
        open={showAddForm}
        source={source}
        onClose={onAddFormClose}
        onLeadAdded={handleLeadAdded}
        onCsvImported={() => void refresh()}
      />

      {selectedLead ? (
        <LeadProfilePanel
          lead={toProfileLead(selectedLead)}
          subtitle={
            selectedLead.inquirySource
              ? `Out-of-gym lead · ${selectedLead.inquirySource}`
              : "Out-of-gym lead · website, phone, or online signup"
          }
          signupNotes={selectedLead.notes}
          footer={
            <PromoteToGuestFooter
              lead={selectedLead}
              onPromoted={(guest) => {
                handlePromotedToGuest(guest);
                setSelectedLeadId(null);
              }}
            />
          }
          onClose={() => setSelectedLeadId(null)}
          onLeadUpdate={() => {}}
        />
      ) : null}
    </>
  );
}
