import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminFromRequest } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const StatusParam = z.enum(["member", "trial", "guest", "lead"]);

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const parsed = StatusParam.safeParse(statusRaw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("admin_people_list", {
    p_status: parsed.data,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to load people" }, { status: 500 });
  }

  return NextResponse.json({ people: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

