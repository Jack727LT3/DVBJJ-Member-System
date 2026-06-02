import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";

export type LeadContactEntry = {
  id: string;
  at: string;
  contactType: "call" | "text" | "email";
  notes: string | null;
};

export type OutOfStoreLead = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  createdAt: string;
  inquirySource: string | null;
  notes: string | null;
  contactedAt: string | null;
  contacted: boolean;
  contactAttempts: number;
  contacts: LeadContactEntry[];
};

export type OutOfStoreLeadsPayload = {
  source: "live" | "demo";
  leads: OutOfStoreLead[];
};

type RpcContact = {
  id: string;
  at: string;
  contact_type: string;
  notes: string | null;
};

type RpcLead = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  created_at: string;
  lead_inquiry_source: string | null;
  lead_notes: string | null;
  lead_contacted_at: string | null;
  contacted: boolean;
  contact_attempts?: number;
  contacts?: RpcContact[] | null;
};

function mapContact(c: RpcContact): LeadContactEntry {
  const t = c.contact_type;
  const contactType =
    t === "call" || t === "text" || t === "email" ? t : "call";
  return {
    id: c.id,
    at: c.at,
    contactType,
    notes: c.notes,
  };
}

function mapLead(row: RpcLead): OutOfStoreLead {
  const lead = normalizeOutOfStoreLead({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at,
    inquirySource: row.lead_inquiry_source,
    notes: row.lead_notes,
    contactedAt: row.lead_contacted_at,
    contacted: Boolean(row.contacted),
    contactAttempts: row.contact_attempts ?? 0,
  });
  const contacts = (row.contacts ?? []).map(mapContact);
  return {
    ...lead,
    contacts,
    contactAttempts: row.contact_attempts ?? contacts.length,
  };
}

function toRpcContact(c: LeadContactEntry | RpcContact): RpcContact {
  if ("contact_type" in c) return c;
  return {
    id: c.id,
    at: c.at,
    contact_type: c.contactType,
    notes: c.notes,
  };
}

/** Guard partial API / demo payloads so UI never crashes on missing fields. */
export function normalizeOutOfStoreLead(
  raw: Partial<OutOfStoreLead> & { first_name?: string; last_name?: string; contacts?: LeadContactEntry[] | RpcContact[] | null }
): OutOfStoreLead {
  const contactsRaw = raw.contacts;
  const contacts = Array.isArray(contactsRaw)
    ? contactsRaw
        .filter((c) => Boolean(c && typeof c === "object"))
        .map((c) => mapContact(toRpcContact(c as LeadContactEntry | RpcContact)))
    : [];

  return {
    id: String(raw.id ?? ""),
    firstName: String(raw.firstName ?? raw.first_name ?? ""),
    lastName: String(raw.lastName ?? raw.last_name ?? ""),
    phone: String(raw.phone ?? ""),
    email: raw.email ?? null,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    inquirySource: raw.inquirySource ?? null,
    notes: raw.notes ?? null,
    contactedAt: raw.contactedAt ?? null,
    contacted: Boolean(raw.contacted),
    contactAttempts: typeof raw.contactAttempts === "number" ? raw.contactAttempts : contacts.length,
    contacts,
  };
}

function parseLeadsRpcData(data: unknown): RpcLead[] {
  if (typeof data === "string") {
    try {
      return parseLeadsRpcData(JSON.parse(data));
    } catch {
      return [];
    }
  }
  if (Array.isArray(data)) return data as RpcLead[];
  return [];
}

const DEMO_CONTACTS: LeadContactEntry[] = [
  {
    id: "demo-c1",
    at: new Date(Date.now() - 1 * 86400000).toISOString(),
    contactType: "call",
    notes: "Left voicemail",
  },
];

const DEMO_LEADS: OutOfStoreLead[] = [
  {
    id: "demo-oos-1",
    firstName: "Morgan",
    lastName: "Ellis",
    phone: "7275552201",
    email: "morgan@example.com",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    inquirySource: "Website",
    notes: "Filled out trial form on homepage",
    contactedAt: null,
    contacted: false,
    contactAttempts: 0,
    contacts: [],
  },
  {
    id: "demo-oos-2",
    firstName: "Jamie",
    lastName: "Park",
    phone: "7275552202",
    email: null,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    inquirySource: "Phone call",
    notes: "Asked about kids program pricing",
    contactedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    contacted: true,
    contactAttempts: 1,
    contacts: DEMO_CONTACTS,
  },
];

export function getDemoOutOfStoreLeads(): OutOfStoreLead[] {
  return DEMO_LEADS.map((l) => ({ ...l, contacts: [...l.contacts] }));
}

export async function fetchOutOfStoreLeads(): Promise<OutOfStoreLeadsPayload> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_out_of_store_leads_list");
    if (error) throw error;
    const rows = parseLeadsRpcData(data);
    return { source: "live", leads: rows.map(mapLead) };
  } catch {
    return { source: "demo", leads: getDemoOutOfStoreLeads() };
  }
}

export type CreateOutOfStoreLeadInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  inquirySource?: string;
  notes?: string;
};

function unwrapLeadRpc(data: unknown): OutOfStoreLead | null {
  const result = data as { ok?: boolean; lead?: RpcLead };
  if (result?.lead) return mapLead(result.lead);
  return null;
}

export async function createOutOfStoreLead(
  input: CreateOutOfStoreLeadInput
): Promise<{ ok: true; lead: OutOfStoreLead } | { ok: false; error: string }> {
  const phone = normalizePhone(input.phone);
  if (phone.length < 4) {
    return { ok: false, error: "Enter a valid phone number." };
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_create_out_of_store_lead", {
      p_first_name: input.firstName.trim(),
      p_last_name: input.lastName.trim(),
      p_phone: phone,
      p_email: input.email?.trim() || null,
      p_inquiry_source: input.inquirySource?.trim() || null,
      p_notes: input.notes?.trim() || null,
    });
    if (error) throw error;

    const result = data as { ok: boolean; error?: string; lead?: RpcLead };
    if (!result.ok || !result.lead) {
      if (result.error === "phone_in_use") {
        return { ok: false, error: "That phone number is already on a member or guest profile." };
      }
      return { ok: false, error: "Could not save lead." };
    }
    return { ok: true, lead: mapLead(result.lead) };
  } catch {
    return { ok: false, error: "Database not connected — use demo mode on this device." };
  }
}

export async function logOutOfStoreContact(
  id: string,
  contactType: "call" | "text" | "email",
  notes?: string
): Promise<{ ok: true; lead: OutOfStoreLead } | { ok: false; error: string }> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_log_out_of_store_contact", {
      p_person_id: id,
      p_contact_type: contactType,
      p_notes: notes?.trim() || null,
    });
    if (error) throw error;
    const lead = unwrapLeadRpc(data);
    if (!lead) return { ok: false, error: "Lead not found." };
    return { ok: true, lead };
  } catch {
    return { ok: false, error: "Could not log contact — database not connected." };
  }
}

export async function setOutOfStoreLeadContacted(
  id: string,
  contacted: boolean
): Promise<{ ok: true; lead: OutOfStoreLead } | { ok: false; error: string }> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_set_out_of_store_lead_contacted", {
      p_person_id: id,
      p_contacted: contacted,
    });
    if (error) throw error;
    const lead = unwrapLeadRpc(data);
    if (!lead) return { ok: false, error: "Lead not found." };
    return { ok: true, lead };
  } catch {
    return { ok: false, error: "Could not update — database not connected." };
  }
}
