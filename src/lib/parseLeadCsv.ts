import { normalizePhone } from "@/lib/phone";
import type { CreateOutOfStoreLeadInput } from "@/lib/outOfStoreLeads";

const HEADER_ALIASES: Record<string, keyof CreateOutOfStoreLeadInput> = {
  first_name: "firstName",
  firstname: "firstName",
  first: "firstName",
  last_name: "lastName",
  lastname: "lastName",
  last: "lastName",
  phone: "phone",
  mobile: "phone",
  tel: "phone",
  email: "email",
  inquiry_source: "inquirySource",
  source: "inquirySource",
  how_they_reached_out: "inquirySource",
  notes: "notes",
  note: "notes",
};

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Minimal CSV parser (handles quoted fields). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export type ParseLeadCsvResult =
  | { ok: true; leads: CreateOutOfStoreLeadInput[] }
  | { ok: false; error: string };

export function parseLeadCsv(text: string): ParseLeadCsvResult {
  const rows = parseCsvRows(text.trim());
  if (rows.length < 2) {
    return { ok: false, error: "CSV needs a header row and at least one lead." };
  }

  const headers = rows[0].map(normalizeHeader);
  const leads: CreateOutOfStoreLeadInput[] = [];

  for (let r = 1; r < rows.length; r++) {
    const values = rows[r];
    const record: Partial<CreateOutOfStoreLeadInput> = {};

    headers.forEach((h, i) => {
      const key = HEADER_ALIASES[h];
      if (!key) return;
      const val = (values[i] ?? "").trim();
      if (val) (record as Record<string, string>)[key] = val;
    });

    if (!record.firstName && !record.lastName && !record.phone) continue;

    if (!record.firstName || !record.lastName || !record.phone) {
      return {
        ok: false,
        error: `Row ${r + 1} is missing first name, last name, or phone.`,
      };
    }

    if (normalizePhone(record.phone).length < 4) {
      return { ok: false, error: `Row ${r + 1} has an invalid phone number.` };
    }

    leads.push(record as CreateOutOfStoreLeadInput);
  }

  if (leads.length === 0) {
    return { ok: false, error: "No valid rows found in CSV." };
  }

  return { ok: true, leads };
}
