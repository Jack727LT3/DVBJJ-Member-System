import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().min(4).max(20).optional(),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  monthlyPayment: z.number().positive().optional(),
  beltColor: z.string().trim().max(40).optional().nullable(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  ageGroup: z.enum(["adult", "child"]).optional(),
  parents: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        phone: z.string().trim().min(4),
      })
    )
    .optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

function isDemoMemberId(id: string) {
  return id.startsWith("demo-") || /^m\d+$/.test(id);
}

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

  if (isDemoMemberId(id)) {
    return NextResponse.json({
      source: "demo",
      member: { id, ...body, phone: body.phone ? normalizePhone(body.phone) : undefined },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const parentsJson =
      body.parents?.map((p) => ({
        name: p.name,
        phone: normalizePhone(p.phone),
      })) ?? undefined;

    const { data, error } = await supabase.rpc("mvp_update_member", {
      p_person_id: id,
      p_first_name: body.firstName ?? null,
      p_last_name: body.lastName ?? null,
      p_phone: body.phone ? normalizePhone(body.phone) : null,
      p_email: body.email === undefined ? null : body.email,
      p_monthly_payment: body.monthlyPayment ?? null,
      p_belt_color: body.beltColor === undefined ? null : body.beltColor,
      p_date_of_birth: body.dateOfBirth ?? null,
      p_member_age_group: body.ageGroup ?? null,
      p_member_parents: parentsJson ?? null,
    });
    if (error) throw error;

    const result = data as { ok: boolean; error?: string; member?: Record<string, unknown> };
    if (!result.ok || !result.member) {
      return NextResponse.json({ error: result.error ?? "Could not update member." }, { status: 400 });
    }

    const m = result.member;
    return NextResponse.json({
      source: "live",
      member: {
        id: m.id,
        firstName: m.first_name,
        lastName: m.last_name,
        phone: m.phone,
        email: m.email,
        memberState: m.member_state,
        beltColor: m.belt_color,
        monthlyPayment: m.monthly_payment != null ? Number(m.monthly_payment) : null,
        dateOfBirth: m.date_of_birth,
        ageGroup: m.member_age_group === "child" ? "child" : "adult",
        parents: Array.isArray(m.member_parents) ? m.member_parents : [],
        staffFlagType: m.staff_flag_type,
        staffFlagOther: m.staff_flag_other,
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not update member." }, { status: 500 });
  }
}
