"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";
import type { LeadContactEntry, OutOfStoreLead } from "@/lib/outOfStoreLeads";
import { parseLeadCsv } from "@/lib/parseLeadCsv";
import { formatDate, formatWhen, fullName } from "@/lib/mvpShared";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";

const DEMO_STORAGE_KEY = "dvbjj-out-of-store-leads";

const INQUIRY_OPTIONS = [
  "Website",
  "Phone call",
  "Online signup",
  "Social media",
  "Referral",
  "Other",
] as const;

const inputClass =
  "mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand-red/40 focus:ring-4 focus:ring-brand-red/15";

function loadDemoExtras(): OutOfStoreLead[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OutOfStoreLead[];
  } catch {
    return [];
  }
}

function saveDemoExtras(leads: OutOfStoreLead[]) {
  const extras = leads.filter((l) => l.id.startsWith("demo-oos-"));
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(extras));
}

type OutOfStoreLeadsTabProps = {
  dashboardSource: "live" | "demo";
  /** Nested inside Member Onboarding collapsible section */
  embedded?: boolean;
};

export default function OutOfStoreLeadsTab({ dashboardSource, embedded = false }: OutOfStoreLeadsTabProps) {
  const [leads, setLeads] = useState<OutOfStoreLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"live" | "demo">(dashboardSource);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [inquirySource, setInquirySource] = useState<string>(INQUIRY_OPTIONS[0]);
  const [notes, setNotes] = useState("");

  const mergeLeads = useCallback((serverLeads: OutOfStoreLead[], isDemo: boolean) => {
    if (!isDemo) {
      setLeads(serverLeads);
      return;
    }
    const extras = loadDemoExtras();
    const byId = new Map<string, OutOfStoreLead>();
    for (const l of serverLeads) byId.set(l.id, l);
    for (const l of extras) byId.set(l.id, l);
    setLeads(
      [...byId.values()].sort((a, b) => {
        if (a.contacted !== b.contacted) return a.contacted ? 1 : -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
    );
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mvp/out-of-store-leads", { cache: "no-store" });
      const json = (await res.json()) as { source: "live" | "demo"; leads: OutOfStoreLead[] };
      setSource(json.source);
      mergeLeads(json.leads ?? [], json.source === "demo");
    } finally {
      setLoading(false);
    }
  }, [mergeLeads]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const notContacted = useMemo(() => leads.filter((l) => !l.contacted), [leads]);
  const contacted = useMemo(() => leads.filter((l) => l.contacted), [leads]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!firstName.trim() || !lastName.trim() || normalizePhone(phone).length < 4) {
      setFormError("First name, last name, and phone are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/mvp/out-of-store-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone,
          email: email.trim() || undefined,
          inquirySource,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error ?? "Could not add lead.");
        return;
      }

      const lead = json.lead as OutOfStoreLead;
      setLeads((prev) => {
        const next = [lead, ...prev.filter((l) => l.id !== lead.id)];
        if (json.source === "demo" || source === "demo") saveDemoExtras(next);
        return next;
      });

      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setNotes("");
      setInquirySource(INQUIRY_OPTIONS[0]);
    } catch {
      setFormError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logContact(
    lead: OutOfStoreLead,
    contactType: "call" | "text" | "email",
    contactNotes?: string
  ) {
    const prev = leads;
    try {
      const res = await fetch(`/api/mvp/out-of-store-leads/${lead.id}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactType, notes: contactNotes }),
      });
      const json = await res.json();
      if (!res.ok && !json.lead) return;

      const patch = (l: OutOfStoreLead): OutOfStoreLead => {
        if (l.id !== lead.id) return l;
        if (json.source === "live" && json.lead?.firstName) return json.lead as OutOfStoreLead;
        const entry: LeadContactEntry = {
          id: `demo-c-${Date.now()}`,
          at: new Date().toISOString(),
          contactType,
          notes: contactNotes ?? null,
        };
        return {
          ...l,
          contacted: true,
          contactedAt: entry.at,
          contactAttempts: l.contactAttempts + 1,
          contacts: [entry, ...l.contacts],
        };
      };

      setLeads((current) => {
        const next = current.map(patch);
        if (source === "demo" || lead.id.startsWith("demo-oos-")) saveDemoExtras(next);
        return next;
      });
    } catch {
      setLeads(prev);
    }
  }

  async function handleCsvFile(file: File) {
    setCsvMessage(null);
    setCsvImporting(true);
    try {
      const text = await file.text();
      const parsed = parseLeadCsv(text);
      if (!parsed.ok) {
        setCsvMessage(parsed.error);
        return;
      }
      const res = await fetch("/api/mvp/out-of-store-leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: parsed.leads }),
      });
      const json = await res.json();
      if (!res.ok && !json.imported) {
        setCsvMessage(json.error ?? "Import failed.");
        return;
      }
      setCsvMessage(`Imported ${json.imported ?? parsed.leads.length} lead(s).`);
      await refresh();
    } catch {
      setCsvMessage("Could not read CSV file.");
    } finally {
      setCsvImporting(false);
    }
  }

  async function toggleContacted(lead: OutOfStoreLead, contactedNext: boolean) {
    const prev = leads;
    setLeads((current) =>
      current.map((l) =>
        l.id === lead.id
          ? {
              ...l,
              contacted: contactedNext,
              contactedAt: contactedNext ? new Date().toISOString() : null,
            }
          : l
      )
    );

    try {
      const res = await fetch(`/api/mvp/out-of-store-leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacted: contactedNext }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLeads(prev);
        return;
      }
      if (json.lead && json.source === "live" && json.lead.firstName) {
        setLeads((current) => {
          const next = current.map((l) => (l.id === lead.id ? (json.lead as OutOfStoreLead) : l));
          if (source === "demo") saveDemoExtras(next);
          return next;
        });
      } else {
        setLeads((current) => {
          const next = current.map((l) =>
            l.id === lead.id
              ? {
                  ...l,
                  contacted: contactedNext,
                  contactedAt: contactedNext ? new Date().toISOString() : null,
                }
              : l
          );
          if (source === "demo" || lead.id.startsWith("demo-oos-")) saveDemoExtras(next);
          return next;
        });
      }
    } catch {
      setLeads(prev);
    }
  }

  return (
    <div className={embedded ? "space-y-6" : "space-y-8"}>
      <KioskSnakeBorderCard wide innerClassName="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-brand-ink">Add Out-Of-Store Lead</h2>
            <p className="mt-1 text-sm text-brand-muted">
              Website, phone, or online signups — have not visited the gym yet.
            </p>
          </div>
          <label className="shrink-0 cursor-pointer rounded-lg border border-black/15 bg-white px-3 py-2 text-center text-xs font-medium text-brand-ink shadow-sm hover:bg-neutral-50">
            {csvImporting ? "Importing…" : "Upload CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={csvImporting}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCsvFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-brand-muted">
          CSV columns: first_name, last_name, phone, email, inquiry_source, notes
        </p>
        {csvMessage ? (
          <p className="mt-2 text-sm text-brand-ink" role="status">
            {csvMessage}
          </p>
        ) : null}

        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-medium text-brand-ink" htmlFor="oos-first">
              First name
            </label>
            <input
              id="oos-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-brand-ink" htmlFor="oos-last">
              Last name
            </label>
            <input
              id="oos-last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
              autoComplete="family-name"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-brand-ink" htmlFor="oos-phone">
              Phone
            </label>
            <input
              id="oos-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-brand-ink" htmlFor="oos-email">
              Email <span className="text-brand-muted">(optional)</span>
            </label>
            <input
              id="oos-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              inputMode="email"
              autoComplete="email"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-brand-ink" htmlFor="oos-source">
              How they reached out
            </label>
            <select
              id="oos-source"
              value={inquirySource}
              onChange={(e) => setInquirySource(e.target.value)}
              className={inputClass}
            >
              {INQUIRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-brand-ink" htmlFor="oos-notes">
              Notes <span className="text-brand-muted">(optional)</span>
            </label>
            <textarea
              id="oos-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="What they asked about, best time to call, etc."
            />
          </div>

          {formError ? (
            <p className="sm:col-span-2 text-sm font-medium text-red-700" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-brand-red px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-hover disabled:opacity-55 sm:w-auto sm:min-w-[200px]"
            >
              {submitting ? "Saving…" : "Add Lead"}
            </button>
          </div>
        </form>
      </KioskSnakeBorderCard>

      {loading ? (
        <p className="text-center text-sm text-brand-muted">Loading leads…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <LeadColumn
            title="Not Contacted Yet"
            subtitle="Still need to reach out"
            count={notContacted.length}
            emptyMessage="No leads waiting — you're caught up."
            leads={notContacted}
            onToggle={toggleContacted}
            onLogContact={logContact}
          />
          <LeadColumn
            title="Contacted"
            subtitle="Contact history is logged with date and type"
            count={contacted.length}
            emptyMessage="No contacted leads yet."
            leads={contacted}
            onToggle={toggleContacted}
            onLogContact={logContact}
          />
        </div>
      )}

      {source === "demo" ? (
        <p className="text-center text-xs text-brand-muted">
          Demo mode — new leads save in this browser until Supabase is connected.
        </p>
      ) : null}
    </div>
  );
}

function LeadColumn({
  title,
  subtitle,
  count,
  emptyMessage,
  leads,
  onToggle,
  onLogContact,
}: {
  title: string;
  subtitle: string;
  count: number;
  emptyMessage: string;
  leads: OutOfStoreLead[];
  onToggle: (lead: OutOfStoreLead, contacted: boolean) => void;
  onLogContact: (lead: OutOfStoreLead, type: "call" | "text" | "email", notes?: string) => void;
}) {
  return (
    <KioskSnakeBorderCard wide className="h-full" innerClassName="flex min-h-[280px] flex-col p-0 overflow-hidden">
      <div className="border-b border-black/[0.06] px-4 py-4 sm:px-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-brand-ink">{title}</h3>
          <span className="text-xs font-medium tabular-nums text-brand-muted">{count}</span>
        </div>
        <p className="mt-0.5 text-xs text-brand-muted">{subtitle}</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
        {leads.length === 0 ? (
          <p className="py-6 text-center text-sm text-brand-muted">{emptyMessage}</p>
        ) : (
          leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onToggle={onToggle} onLogContact={onLogContact} />
          ))
        )}
      </div>
    </KioskSnakeBorderCard>
  );
}

function LeadCard({
  lead,
  onToggle,
  onLogContact,
}: {
  lead: OutOfStoreLead;
  onToggle: (lead: OutOfStoreLead, contacted: boolean) => void;
  onLogContact: (lead: OutOfStoreLead, type: "call" | "text" | "email", notes?: string) => void;
}) {
  const phoneDisplay = formatPhoneDisplay(lead.phone);
  const [contactType, setContactType] = useState<"call" | "text" | "email">("call");
  const [contactNote, setContactNote] = useState("");

  return (
    <article className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold text-brand-ink">{fullName(lead.firstName, lead.lastName)}</h4>
          <p className="mt-1 text-sm text-brand-muted">{phoneDisplay}</p>
          {lead.email ? <p className="text-sm text-brand-muted">{lead.email}</p> : null}
        </div>
        <span className="shrink-0 text-[11px] text-brand-muted">{formatDate(lead.createdAt)}</span>
      </div>

      {lead.inquirySource ? (
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-brand-muted">
          {lead.inquirySource}
        </p>
      ) : null}
      {lead.notes ? <p className="mt-1 text-sm leading-relaxed text-brand-ink">{lead.notes}</p> : null}

      {lead.contacted && lead.contactAttempts > 0 ? (
        <p className="mt-3 text-xs font-medium text-brand-ink">
          Contacted {lead.contactAttempts} {lead.contactAttempts === 1 ? "time" : "times"}
        </p>
      ) : null}

      {lead.contacts.length > 0 ? (
        <ul className="mt-2 space-y-1.5 border-l-2 border-black/[0.06] pl-3">
          {lead.contacts.slice(0, 5).map((c) => (
            <li key={c.id} className="text-xs text-brand-muted">
              <span className="font-medium capitalize text-brand-ink">{c.contactType}</span>
              {" · "}
              {formatWhen(c.at)}
              {c.notes ? ` — ${c.notes}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 space-y-2 border-t border-black/[0.06] pt-3">
        <p className="text-xs font-medium text-brand-ink">Log Contact</p>
        <div className="flex flex-wrap gap-2">
          <select
            value={contactType}
            onChange={(e) => setContactType(e.target.value as "call" | "text" | "email")}
            className="rounded-lg border border-black/10 px-2 py-1.5 text-xs"
          >
            <option value="call">Call</option>
            <option value="text">Text</option>
            <option value="email">Email</option>
          </select>
          <input
            value={contactNote}
            onChange={(e) => setContactNote(e.target.value)}
            placeholder="Optional note"
            className="min-w-0 flex-1 rounded-lg border border-black/10 px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              onLogContact(lead, contactType, contactNote.trim() || undefined);
              setContactNote("");
            }}
            className="rounded-lg bg-brand-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-red-hover"
          >
            Log
          </button>
        </div>
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={lead.contacted}
          onChange={(e) => onToggle(lead, e.target.checked)}
          className="h-4 w-4 rounded border-black/20 text-brand-red focus:ring-brand-red/30"
        />
        <span className="text-sm text-brand-ink">Mark As Contacted</span>
      </label>
    </article>
  );
}
