import { NextResponse } from "next/server";
import { z } from "zod";
import { setOutOfStoreLeadContacted } from "@/lib/outOfStoreLeads";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  contacted: z.boolean(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (id.startsWith("demo-oos-")) {
    return NextResponse.json({
      source: "demo",
      lead: {
        id,
        contacted: parsed.data.contacted,
        contactedAt: parsed.data.contacted ? new Date().toISOString() : null,
      },
    });
  }

  const result = await setOutOfStoreLeadContacted(id, parsed.data.contacted);
  if (!result.ok) {
    if (result.error.includes("not connected")) {
      return NextResponse.json({
        source: "demo",
        lead: { id, contacted: parsed.data.contacted, contactedAt: parsed.data.contacted ? new Date().toISOString() : null },
      });
    }
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(
    { source: "live", lead: result.lead },
    { headers: { "Cache-Control": "no-store" } }
  );
}
