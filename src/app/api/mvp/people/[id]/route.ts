import { NextResponse } from "next/server";
import { z } from "zod";
import { isDemoPersonId } from "@/lib/personNotesApi";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().min(4).max(20).optional(),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  ageGroup: z.enum(["adult", "child"]).optional(),
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

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const body = parsed.data;

  if (isDemoPersonId(id)) {
    return NextResponse.json({ source: "demo", person: { id, ...body } });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_update_person_profile", {
      p_person_id: id,
      p_first_name: body.firstName ?? null,
      p_last_name: body.lastName ?? null,
      p_phone: body.phone ? normalizePhone(body.phone) : null,
      p_email: body.email === undefined ? null : body.email,
      p_date_of_birth: body.dateOfBirth ?? null,
      p_member_age_group: body.ageGroup ?? null,
    });
    if (error) throw error;

    const result = data as { ok: boolean; error?: string; person?: Record<string, unknown> };
    if (!result.ok || !result.person) {
      return NextResponse.json({ error: result.error ?? "Could not update." }, { status: 400 });
    }

    const p = result.person;
    return NextResponse.json({
      source: "live",
      person: {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        phone: p.phone,
        email: p.email,
        dateOfBirth: p.date_of_birth,
        ageGroup: p.member_age_group === "child" ? "child" : "adult",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not update." }, { status: 500 });
  }
}
