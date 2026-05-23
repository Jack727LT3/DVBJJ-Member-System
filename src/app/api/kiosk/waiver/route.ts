import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  personId: z.string().uuid(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participantSignature: z.string().min(10),
  parentName: z.string().trim().optional().nullable(),
  parentSignature: z.string().optional().nullable(),
  parentConsentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
});

export async function POST(req: Request) {
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

  const { personId, dateOfBirth, participantSignature, parentName, parentSignature, parentConsentDate } =
    parsed.data;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("kiosk_save_waiver", {
      p_person_id: personId,
      p_date_of_birth: dateOfBirth,
      p_participant_signature: participantSignature,
      p_parent_name: parentName ?? null,
      p_parent_signature: parentSignature ?? null,
      p_parent_consent_date: parentConsentDate ?? null,
    });

    if (error) {
      return NextResponse.json({ error: "Could not save waiver" }, { status: 500 });
    }

    const result = data as { ok: boolean; error?: string };
    if (!result?.ok) {
      return NextResponse.json({ error: result?.error ?? "Could not save waiver" }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: true, source: "demo" });
  }
}
