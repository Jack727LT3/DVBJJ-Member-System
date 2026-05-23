import { NextResponse } from "next/server";
import { isDemoPersonId } from "@/lib/personNotesApi";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { LiabilityWaiverRecord } from "@/lib/waiverTypes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;

  if (isDemoPersonId(id)) {
    return NextResponse.json({ source: "demo", waivers: [] as LiabilityWaiverRecord[] });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_list_waivers", { p_person_id: id });
    if (error) throw error;

    const rows = (data ?? []) as {
      id: string;
      signed_at: string;
      date_of_birth: string;
      participant_signature: string;
      parent_name: string | null;
      parent_signature: string | null;
      parent_consent_date: string | null;
    }[];

    const waivers: LiabilityWaiverRecord[] = rows.map((w) => ({
      id: w.id,
      signedAt: w.signed_at,
      dateOfBirth: w.date_of_birth,
      participantSignature: w.participant_signature,
      parentName: w.parent_name,
      parentSignature: w.parent_signature,
      parentConsentDate: w.parent_consent_date,
    }));

    return NextResponse.json({ source: "live", waivers });
  } catch {
    return NextResponse.json({ source: "demo", waivers: [] });
  }
}
