import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminFromRequest } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const IdParam = z.object({ id: z.string().uuid() });

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = IdParam.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid member id" }, { status: 400 });
  }

  const memberId = parsed.data.id;

  // MVP: only toggle delinquency for current `member`s.
  const supabaseAdmin = getSupabaseAdmin();
  const { data: person, error: loadError } = await supabaseAdmin
    .from("people")
    .select("status,member_state")
    .eq("id", memberId)
    .single();

  if (loadError) {
    return NextResponse.json({ error: "Failed to load member" }, { status: 500 });
  }

  if (person?.status !== "member") {
    return NextResponse.json({ error: "Not a member" }, { status: 400 });
  }

  const current = person.member_state === "delinquent" ? "active" : "delinquent";

  const { error: updateError } = await supabaseAdmin
    .from("people")
    .update({ member_state: current })
    .eq("id", memberId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update member state" }, { status: 500 });
  }

  return NextResponse.json({ id: memberId, member_state: current }, { headers: { "Cache-Control": "no-store" } });
}

