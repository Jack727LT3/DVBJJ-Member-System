import { NextResponse } from "next/server";
import { z } from "zod";
import { createOutOfStoreLead, fetchOutOfStoreLeads, type OutOfStoreLead } from "@/lib/outOfStoreLeads";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(4).max(20),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
  inquirySource: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function GET() {
  const payload = await fetchOutOfStoreLeads();
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createOutOfStoreLead(parsed.data);
  if (!result.ok) {
    if (result.error.includes("not connected")) {
      const lead: OutOfStoreLead = {
        id: `demo-oos-${Date.now()}`,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: normalizePhone(parsed.data.phone),
        email: parsed.data.email ?? null,
        createdAt: new Date().toISOString(),
        inquirySource: parsed.data.inquirySource ?? null,
        notes: parsed.data.notes ?? null,
        contactedAt: null,
        contacted: false,
        contactAttempts: 0,
        contacts: [],
      };
      return NextResponse.json({ source: "demo", lead }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json(
    { source: "live", lead: result.lead },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
