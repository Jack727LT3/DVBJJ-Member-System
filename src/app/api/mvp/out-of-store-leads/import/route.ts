import { NextResponse } from "next/server";
import { z } from "zod";
import { createOutOfStoreLead, type CreateOutOfStoreLeadInput } from "@/lib/outOfStoreLeads";

export const dynamic = "force-dynamic";

const ImportSchema = z.object({
  leads: z.array(
    z.object({
      firstName: z.string().trim().min(1),
      lastName: z.string().trim().min(1),
      phone: z.string().trim().min(4),
      email: z.string().optional(),
      inquirySource: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = ImportSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const created: CreateOutOfStoreLeadInput[] = [];
  const errors: string[] = [];

  for (const lead of parsed.data.leads) {
    const result = await createOutOfStoreLead(lead);
    if (result.ok) {
      created.push(lead);
    } else {
      errors.push(`${lead.firstName} ${lead.lastName}: ${result.error}`);
    }
  }

  if (created.length === 0 && errors.length > 0) {
    return NextResponse.json({ error: errors[0], errors }, { status: 409 });
  }

  return NextResponse.json({
    imported: created.length,
    failed: errors.length,
    errors: errors.slice(0, 5),
  });
}
