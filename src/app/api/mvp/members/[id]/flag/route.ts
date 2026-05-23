import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { StaffFlagType } from "@/lib/staffFlags";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  flagType: z.enum(["missed_payment", "absent_week_plus", "other"]).nullable(),
  flagOther: z.string().trim().max(200).optional().nullable(),
});

type RouteContext = { params: Promise<{ id: string }> };

function isDemoMemberId(id: string) {
  return id.startsWith("demo-") || /^m\d+$/.test(id);
}

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

  const { flagType, flagOther } = parsed.data;

  if (flagType === "other" && !flagOther?.trim()) {
    return NextResponse.json({ error: "Describe the flag in the other field." }, { status: 400 });
  }

  if (isDemoMemberId(id)) {
    return NextResponse.json({
      source: "demo",
      member: {
        id,
        staffFlagType: flagType as StaffFlagType | null,
        staffFlagOther: flagType === "other" ? flagOther ?? null : null,
        memberState: flagType === "missed_payment" ? "delinquent" : "active",
      },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_set_member_flag", {
      p_person_id: id,
      p_flag_type: flagType,
      p_flag_other: flagOther ?? null,
    });
    if (error) throw error;

    const result = data as {
      ok: boolean;
      error?: string;
      member?: {
        id: string;
        staff_flag_type: StaffFlagType | null;
        staff_flag_other: string | null;
        member_state: string;
      };
    };

    if (!result.ok || !result.member) {
      return NextResponse.json({ error: result.error ?? "Could not update flag." }, { status: 400 });
    }

    return NextResponse.json({
      source: "live",
      member: {
        id: result.member.id,
        staffFlagType: result.member.staff_flag_type,
        staffFlagOther: result.member.staff_flag_other,
        memberState: result.member.member_state,
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not update flag." }, { status: 500 });
  }
}
