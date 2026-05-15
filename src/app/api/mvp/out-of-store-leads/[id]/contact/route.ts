import { NextResponse } from "next/server";
import { z } from "zod";
import { logOutOfStoreContact } from "@/lib/outOfStoreLeads";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  contactType: z.enum(["call", "text", "email"]),
  notes: z.string().trim().max(500).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (id.startsWith("demo-oos-")) {
    const at = new Date().toISOString();
    return NextResponse.json({
      source: "demo",
      lead: {
        id,
        contacted: true,
        contactedAt: at,
        contactAttempts: 1,
        contacts: [
          {
            id: `demo-c-${Date.now()}`,
            at,
            contactType: parsed.data.contactType,
            notes: parsed.data.notes ?? null,
          },
        ],
      },
    });
  }

  const result = await logOutOfStoreContact(id, parsed.data.contactType, parsed.data.notes);
  if (!result.ok) {
    if (result.error.includes("not connected")) {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ source: "live", lead: result.lead });
}
