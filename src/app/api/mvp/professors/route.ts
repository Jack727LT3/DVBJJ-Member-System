import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(4).max(20),
  email: z.string().trim().email().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
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

  const { firstName, lastName, phone, email } = parsed.data;
  const phoneDigits = normalizePhone(phone);

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_create_professor", {
      p_first_name: firstName,
      p_last_name: lastName,
      p_phone: phoneDigits,
      p_email: email ?? null,
    });
    if (error) throw error;

    const result = data as {
      ok: boolean;
      error?: string;
      professor?: {
        id: string;
        first_name: string;
        last_name: string;
        phone: string;
        email: string | null;
        created_at: string;
      };
    };

    if (!result.ok || !result.professor) {
      const msg =
        result.error === "phone_exists"
          ? "That phone number is already in the system."
          : (result.error ?? "Could not add professor.");
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const p = result.professor;
    return NextResponse.json({
      source: "live",
      professor: {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        phone: p.phone,
        email: p.email,
        createdAt: p.created_at,
      },
    });
  } catch {
    return NextResponse.json({
      source: "demo",
      professor: {
        id: `prof-${Date.now()}`,
        firstName,
        lastName,
        phone: phoneDigits,
        email: email ?? null,
        createdAt: new Date().toISOString(),
      },
    });
  }
}
