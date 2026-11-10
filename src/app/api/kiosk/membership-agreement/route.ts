import { NextResponse } from "next/server";
import { z } from "zod";
import { MEMBERSHIP_PLAN_OPTIONS } from "@/lib/membershipAgreementCopy";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const planIds = MEMBERSHIP_PLAN_OPTIONS.map((p) => p.id) as [string, ...string[]];

const BodySchema = z.object({
  personId: z.string().uuid(),
  planId: z.enum(planIds),
  participantName: z.string().trim().min(1),
  participantSignature: z.string().min(10),
  financialResponsibleName: z.string().trim().optional().nullable(),
  financialResponsibleSignature: z.string().optional().nullable(),
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

  const {
    personId,
    planId,
    participantName,
    participantSignature,
    financialResponsibleName,
    financialResponsibleSignature,
  } = parsed.data;

  const plan = MEMBERSHIP_PLAN_OPTIONS.find((p) => p.id === planId);
  if (!plan) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("kiosk_save_membership_agreement", {
      p_person_id: personId,
      p_plan_id: planId,
      p_plan_label: `${plan.label} — ${plan.priceLabel}`,
      p_participant_name: participantName,
      p_participant_signature: participantSignature,
      p_financial_responsible_name: financialResponsibleName ?? null,
      p_financial_responsible_signature: financialResponsibleSignature ?? null,
    });

    if (error) throw error;
    const result = data as { ok: boolean; error?: string; agreement?: unknown };
    if (!result?.ok) {
      return NextResponse.json({ error: result?.error ?? "Could not save agreement" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, source: "live", agreement: result.agreement });
  } catch {
    // Demo fallback
    return NextResponse.json({
      ok: true,
      source: "demo",
      agreement: {
        id: `demo-ma-${Date.now()}`,
        signed_at: new Date().toISOString(),
        plan_id: planId,
        plan_label: `${plan.label} — ${plan.priceLabel}`,
        participant_name: participantName,
      },
    });
  }
}
