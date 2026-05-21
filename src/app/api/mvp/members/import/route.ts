import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildDemoMemberFromPayload,
  createMemberInDatabase,
  type CreateMemberPayload,
} from "@/lib/createMember";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { StaffMemberRow } from "@/lib/staffDashboard";

export const dynamic = "force-dynamic";

const ImportSchema = z.object({
  members: z.array(
    z.object({
      firstName: z.string().trim().min(1),
      lastName: z.string().trim().min(1),
      phone: z.string().trim().min(4),
      email: z.string().trim().min(3),
      monthlyPayment: z.number().positive(),
      beltColor: z.string().nullable().optional(),
      ageGroup: z.enum(["adult", "child"]),
      dateOfBirth: z.string().nullable().optional(),
      parents: z
        .array(
          z.object({
            name: z.string().trim().min(1),
            phone: z.string().trim().min(10),
          })
        )
        .optional(),
    })
  ),
});

function mapImportError(name: string, error: string) {
  return `${name}: ${error}`;
}

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

  const imported: StaffMemberRow[] = [];
  const errors: string[] = [];
  let useDemo = false;

  let supabase: ReturnType<typeof getSupabaseAdmin> | null = null;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    useDemo = true;
  }

  for (const row of parsed.data.members) {
    const payload: CreateMemberPayload = {
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      email: row.email,
      beltColor: row.beltColor ?? null,
      monthlyPayment: row.monthlyPayment,
      ageGroup: row.ageGroup,
      dateOfBirth: row.dateOfBirth ?? null,
      parents: row.parents ?? [],
    };
    const label = `${payload.firstName} ${payload.lastName}`;

    if (useDemo || !supabase) {
      imported.push(buildDemoMemberFromPayload(payload));
      continue;
    }

    const result = await createMemberInDatabase(supabase, payload);
    if (result.ok) {
      imported.push(result.member);
    } else {
      errors.push(mapImportError(label, result.error));
    }
  }

  if (imported.length === 0 && errors.length > 0) {
    return NextResponse.json({ error: errors[0], errors }, { status: 409 });
  }

  return NextResponse.json({
    source: useDemo ? "demo" : "live",
    imported: imported.length,
    failed: errors.length,
    errors: errors.slice(0, 8),
    members: imported,
  });
}
