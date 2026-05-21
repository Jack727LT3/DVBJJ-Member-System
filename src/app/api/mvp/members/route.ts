import { NextResponse } from "next/server";
import {
  buildDemoMemberFromPayload,
  createMemberInDatabase,
  parseCreateMemberPayload,
} from "@/lib/createMember";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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
    const result = await createMemberInDatabase(supabase, parsed);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      source: "live",
      ok: true,
      member: result.member,
    });
  } catch {
    return NextResponse.json({
      source: "demo",
      ok: true,
      member: buildDemoMemberFromPayload(parsed),
    });
  }
}
