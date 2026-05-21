import { NextResponse } from "next/server";
import {
  buildDemoMemberFromPayload,
  mapRpcMemberRow,
  parseCreateMemberPayload,
} from "@/lib/createMember";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseCreateMemberPayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_create_member", {
      p_first_name: parsed.firstName,
      p_last_name: parsed.lastName,
      p_phone: normalizePhone(parsed.phone),
      p_email: parsed.email,
      p_monthly_payment: parsed.monthlyPayment,
      p_belt_color: parsed.beltColor,
      p_member_age_group: parsed.ageGroup,
      p_date_of_birth: parsed.dateOfBirth,
      p_member_parents: parsed.parents,
    });
    if (error) throw error;

    const result = data as {
      ok: boolean;
      error?: string;
      member?: Parameters<typeof mapRpcMemberRow>[0];
    };

    if (!result.ok || !result.member) {
      const msg =
        result.error === "duplicate_phone"
          ? "A profile with this phone number already exists."
          : result.error === "parent_required"
            ? "Add parent or guardian info for child members."
            : result.error === "invalid_payment"
              ? "Enter a valid monthly payment."
              : result.error === "invalid_email"
                ? "Enter a valid email."
                : "Could not add member.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({
      source: "live",
      ok: true,
      member: mapRpcMemberRow(result.member),
    });
  } catch {
    return NextResponse.json({
      source: "demo",
      ok: true,
      member: buildDemoMemberFromPayload(parsed),
    });
  }
}
