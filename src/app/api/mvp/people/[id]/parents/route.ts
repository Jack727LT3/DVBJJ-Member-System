import { NextResponse } from "next/server";
import { z } from "zod";
import { isDemoPersonId } from "@/lib/personNotesApi";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";
import type { StaffMemberParent } from "@/lib/staffDashboard";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(4).max(20),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
});

type RouteContext = { params: Promise<{ id: string }> };

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

  const { name, phone, email } = parsed.data;
  const entry: StaffMemberParent = {
    name,
    phone: normalizePhone(phone),
    email: email?.trim() || null,
  };

  if (isDemoPersonId(id)) {
    return NextResponse.json({ source: "demo", parents: [entry] });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_add_member_parent", {
      p_person_id: id,
      p_name: name,
      p_phone: phone,
      p_email: email ?? null,
    });
    if (error) throw error;

    const result = data as { ok: boolean; error?: string; parents?: StaffMemberParent[] };
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Could not add parent." }, { status: 400 });
    }

    const parents = Array.isArray(result.parents)
      ? result.parents.map((p) => ({
          name: String((p as StaffMemberParent).name ?? ""),
          phone: normalizePhone(String((p as StaffMemberParent).phone ?? "")),
          email: (p as StaffMemberParent).email ?? null,
        }))
      : [entry];

    return NextResponse.json({ source: "live", parents });
  } catch {
    return NextResponse.json({ error: "Could not add parent." }, { status: 500 });
  }
}
