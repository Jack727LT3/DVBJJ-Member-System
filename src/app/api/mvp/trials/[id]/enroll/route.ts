import { NextResponse } from "next/server";
import { buildMemberFromTrialEnroll } from "@/lib/guestEnroll";
import {
  enrollMemberRpcErrorMessage,
  mapEnrollRpcMember,
  parseEnrollPayload,
} from "@/lib/enrollMemberApi";
import { isDemoPersonId } from "@/lib/personNotesApi";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseEnrollPayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (isDemoPersonId(id)) {
    const trialStub = {
      id,
      firstName: "Trial",
      lastName: "Member",
      phone: "7275550000",
      email: null as string | null,
      trialStartDate: new Date().toISOString(),
      trialEndDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      daysRemaining: 5,
      dateOfBirth: parsed.dateOfBirth,
      parents: parsed.parents ?? [],
      notes: [] as { id: string; body: string; createdAt: string }[],
    };
    return NextResponse.json({
      source: "demo",
      ok: true,
      member: buildMemberFromTrialEnroll(trialStub, parsed),
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_enroll_guest", {
      p_person_id: id,
      p_belt_color: parsed.beltColor,
      p_monthly_payment: parsed.monthlyPayment,
      p_member_age_group: parsed.ageGroup,
      p_date_of_birth: parsed.dateOfBirth,
      p_member_parents: parsed.parents,
    });
    if (error) throw error;

    const result = data as {
      ok: boolean;
      error?: string;
      member?: Parameters<typeof mapEnrollRpcMember>[0];
    };

    if (!result.ok || !result.member) {
      return NextResponse.json(
        { error: enrollMemberRpcErrorMessage(result.error) },
        { status: 404 }
      );
    }

    return NextResponse.json({
      source: "live",
      ok: true,
      member: mapEnrollRpcMember(result.member),
    });
  } catch {
    return NextResponse.json({ error: "Could not enroll member." }, { status: 500 });
  }
}
