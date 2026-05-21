import {
  sanitizePersonName,
  type CreateMemberPayload,
} from "@/lib/createMember";
import { normalizePhone } from "@/lib/phone";
import { parseCsvRows } from "@/lib/parseLeadCsv";

const HEADER_ALIASES: Record<string, string> = {
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
  monthly_payment: "monthlyPayment",
  monthly: "monthlyPayment",
  payment: "monthlyPayment",
  rate: "monthlyPayment",
  belt_color: "beltColor",
  belt: "beltColor",
  member_type: "ageGroup",
  age_group: "ageGroup",
  type: "ageGroup",
  date_of_birth: "dateOfBirth",
  dob: "dateOfBirth",
  birthday: "dateOfBirth",
  parent_name: "parentName",
  parent_phone: "parentPhone",
  guardian_name: "parentName",
  guardian_phone: "parentPhone",
};

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function parsePayment(val: string): number {
  const n = Number.parseFloat(val.replace(/[$,]/g, ""));
  return n;
}

function parseAgeGroup(val: string): "adult" | "child" {
  const v = val.trim().toLowerCase();
  if (v === "child" || v === "children" || v === "minor") return "child";
  return "adult";
}

function normalizeDate(val: string): string | null {
  const v = val.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const mdy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (mdy) {
    const mm = mdy[1].padStart(2, "0");
    const dd = mdy[2].padStart(2, "0");
    return `${mdy[3]}-${mm}-${dd}`;
  }
  return null;
}

export type ParseMemberCsvResult =
  | { ok: true; members: CreateMemberPayload[] }
  | { ok: false; error: string };

export function parseMemberCsv(text: string): ParseMemberCsvResult {
  const rows = parseCsvRows(text.trim());
  if (rows.length < 2) {
    return { ok: false, error: "CSV needs a header row and at least one member." };
  }

  const headers = rows[0].map(normalizeHeader);
  const members: CreateMemberPayload[] = [];

  for (let r = 1; r < rows.length; r++) {
    const values = rows[r];
    const raw: Record<string, string> = {};

    headers.forEach((h, i) => {
      const key = HEADER_ALIASES[h];
      if (!key) return;
      const val = (values[i] ?? "").trim();
      if (val) raw[key] = val;
    });

    if (!raw.firstName && !raw.lastName && !raw.phone) continue;

    const firstName = sanitizePersonName(raw.firstName ?? "");
    const lastName = sanitizePersonName(raw.lastName ?? "");
    const phone = raw.phone ?? "";
    const email = (raw.email ?? "").trim();
    const monthlyPayment = parsePayment(raw.monthlyPayment ?? "");
    const beltColor = raw.beltColor?.trim() ? raw.beltColor.trim() : null;
    const ageGroup = parseAgeGroup(raw.ageGroup ?? "adult");
    const dateOfBirth = normalizeDate(raw.dateOfBirth ?? "");

    if (!firstName || !lastName) {
      return { ok: false, error: `Row ${r + 1}: missing first or last name.` };
    }
    if (normalizePhone(phone).length < 10) {
      return { ok: false, error: `Row ${r + 1}: invalid phone number.` };
    }
    if (!email.includes("@")) {
      return { ok: false, error: `Row ${r + 1}: invalid or missing email.` };
    }
    if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
      return { ok: false, error: `Row ${r + 1}: invalid monthly payment.` };
    }

    const parents =
      ageGroup === "child"
        ? [
            {
              name: (raw.parentName ?? "").trim(),
              phone: (raw.parentPhone ?? "").replace(/\D/g, ""),
            },
          ].filter((p) => p.name && p.phone.length >= 10)
        : [];

    if (ageGroup === "child" && parents.length === 0) {
      return {
        ok: false,
        error: `Row ${r + 1}: child members need parent_name and parent_phone columns.`,
      };
    }

    members.push({
      firstName,
      lastName,
      phone,
      email,
      beltColor,
      monthlyPayment,
      ageGroup,
      dateOfBirth,
      parents,
    });
  }

  if (members.length === 0) {
    return { ok: false, error: "No valid member rows found in CSV." };
  }

  return { ok: true, members };
}
