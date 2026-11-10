import { NextResponse } from "next/server";
import { isDemoPersonId } from "@/lib/personNotesApi";
import type { MembershipAgreementRecord } from "@/lib/membershipAgreementTypes";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function mapAgreement(raw: Record<string, unknown>): MembershipAgreementRecord {
  return {
    id: String(raw.id),
    signedAt: String(raw.signed_at ?? raw.signedAt ?? ""),
    planId: String(raw.plan_id ?? raw.planId ?? ""),
    planLabel: String(raw.plan_label ?? raw.planLabel ?? ""),
    participantName: String(raw.participant_name ?? raw.participantName ?? ""),
    participantSignature: String(raw.participant_signature ?? raw.participantSignature ?? ""),
    financialResponsibleName:
      (raw.financial_responsible_name as string | null | undefined) ??
      (raw.financialResponsibleName as string | null | undefined) ??
      null,
    financialResponsibleSignature:
      (raw.financial_responsible_signature as string | null | undefined) ??
      (raw.financialResponsibleSignature as string | null | undefined) ??
      null,
    agreementVersion: String(raw.agreement_version ?? raw.agreementVersion ?? "1"),
  };
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;

  if (isDemoPersonId(id) || id.startsWith("demo-")) {
    return NextResponse.json({ source: "demo", agreements: [] });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_list_membership_agreements", {
      p_person_id: id,
    });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    return NextResponse.json({
      source: "live",
      agreements: rows.map((r) => mapAgreement(r as Record<string, unknown>)),
    });
  } catch {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("membership_agreements")
        .select("*")
        .eq("person_id", id)
        .order("signed_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json({
        source: "live",
        agreements: (data ?? []).map((r) => mapAgreement(r as Record<string, unknown>)),
      });
    } catch {
      return NextResponse.json({ source: "demo", agreements: [] });
    }
  }
}
