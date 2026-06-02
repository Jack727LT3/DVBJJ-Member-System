import { NextResponse } from "next/server";
import { z } from "zod";
import { createStaffGuest } from "@/lib/staffGuests";
import { normalizePhone } from "@/lib/phone";
import type { StaffGuestRow } from "@/lib/staffDashboard";

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
});

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

  const result = await createStaffGuest(parsed.data);
  if (!result.ok) {
    if (result.error.includes("not connected")) {
      const guest: StaffGuestRow = {
        id: `demo-guest-${Date.now()}`,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: normalizePhone(parsed.data.phone),
        email: parsed.data.email ?? null,
        createdAt: new Date().toISOString(),
        lastVisit: null,
        totalVisits: 0,
        dateOfBirth: null,
        ageGroup: "adult",
        completedTrial: false,
        parents: [],
        notes: [],
      };
      return NextResponse.json({ source: "demo", guest }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json(
    { source: "live", guest: result.guest },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
