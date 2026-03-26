import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminFromRequest } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("admin_analytics");
  if (error) {
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }

  return NextResponse.json(data ?? {}, { headers: { "Cache-Control": "no-store" } });
}

