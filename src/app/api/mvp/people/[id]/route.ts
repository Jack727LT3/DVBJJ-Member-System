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

    if (!error && data) {
      const result = data as { ok: boolean; error?: string; person?: Record<string, unknown> };
      if (result.ok && result.person) {
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
      }
    }

    // Fallback when RPC is missing or rejects — direct update for kiosk/staff profile edits.
    const patch: Record<string, unknown> = {};
    if (body.firstName !== undefined) patch.first_name = body.firstName;
    if (body.lastName !== undefined) patch.last_name = body.lastName;
    if (body.phone !== undefined) patch.phone = normalizePhone(body.phone);
    if (body.email !== undefined) patch.email = body.email === "" || body.email === null ? null : body.email;
    if (body.dateOfBirth !== undefined) patch.date_of_birth = body.dateOfBirth;
    if (body.ageGroup !== undefined) patch.member_age_group = body.ageGroup;

    const { data: updated, error: updateError } = await supabase
      .from("people")
      .update(patch)
      .eq("id", id)
      .select("id, first_name, last_name, phone, email, date_of_birth, member_age_group")
      .maybeSingle();

    if (updateError || !updated) {
      return NextResponse.json({ error: "Could not update." }, { status: 400 });
    }

    return NextResponse.json({
      source: "live",
      person: {
        id: updated.id,
        firstName: updated.first_name,
        lastName: updated.last_name,
        phone: updated.phone,
        email: updated.email,
        dateOfBirth: updated.date_of_birth,
        ageGroup: updated.member_age_group === "child" ? "child" : "adult",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not update." }, { status: 500 });
  }
}
