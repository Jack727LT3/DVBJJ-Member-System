import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { maskPhone, normalizePhone } from "@/lib/phone";
import { getEffectiveStatusForMessaging } from "@/lib/statusResolver";

export const dynamic = "force-dynamic";

const SearchSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().min(4).max(20).optional(),
});

export async function POST(req: Request) {
  const body = SearchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input", details: body.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  const { firstName, lastName, phone } = body.data;

  const phoneDigits = phone ? normalizePhone(phone) : "";

  const select = [
    "id",
    "first_name",
    "last_name",
    "phone",
    "status",
    "member_state",
    "trial_end_date",
    "last_check_in",
  ].join(",");

  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin.from("people").select(select).limit(10);

  if (phoneDigits) {
    query = query.eq("phone", phoneDigits).order("created_at", { ascending: false });
  } else {
    if (firstName) query = query.ilike("first_name", `%${firstName}%`);
    if (lastName) query = query.ilike("last_name", `%${lastName}%`);

    // Avoid scanning huge tables without any meaningful filter.
    if (!firstName && !lastName) {
      return NextResponse.json({ results: [] });
    }

    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  type PersonSearchRow = {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    status: "lead" | "trial" | "guest" | "member";
    member_state: "active" | "delinquent" | "frozen" | "canceled" | null;
    trial_end_date: string | null;
    last_check_in: string | null;
  };

  const rows: PersonSearchRow[] = Array.isArray(data)
    ? (data as unknown as PersonSearchRow[])
    : [];

  const results = rows.map((p) => {
    const effective = getEffectiveStatusForMessaging(
      {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        status: p.status,
        member_state: p.member_state,
        trial_end_date: p.trial_end_date,
        last_check_in: p.last_check_in,
      },
      now
    );

    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      phoneMasked: maskPhone(p.phone),
      status: effective.status,
    };
  });

  return new NextResponse(JSON.stringify({ results }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

