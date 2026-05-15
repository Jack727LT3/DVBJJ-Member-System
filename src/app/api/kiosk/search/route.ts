import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildKioskDemoSearchResults,
  matchesKioskDemoGuestPath,
  matchesKioskDemoLookup,
} from "@/lib/kioskDemoMember";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { maskPhone, normalizePhone } from "@/lib/phone";
import { getEffectiveStatusForMessaging } from "@/lib/statusResolver";

export const dynamic = "force-dynamic";

const SearchSchema = z.object({
  /** When omitted or empty, search by phone only (all profiles with that number). */
  lastName: z.string().trim().max(60).optional(),
  phone: z.string().trim().min(1).max(20),
});

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

export async function POST(req: Request) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const body = SearchSchema.safeParse(rawBody);
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input", details: body.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  const { phone } = body.data;
  const lastName = (body.data.lastName ?? "").trim();

  const phoneDigits = normalizePhone(phone);
  if (phoneDigits.length < 4) {
    return NextResponse.json({ error: "Enter a complete phone number" }, { status: 400 });
  }

  if (matchesKioskDemoGuestPath(phone)) {
    return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  if (matchesKioskDemoLookup(lastName, phone)) {
    const results = buildKioskDemoSearchResults(now);
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  }

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

  try {
    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin.from("people").select(select).eq("phone", phoneDigits);
    if (lastName.length > 0) {
      query = query.ilike("last_name", `%${lastName}%`);
    }
    query = query.order("created_at", { ascending: false }).limit(10);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
    }

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
        memberState: effective.status === "member" ? (effective.member_state ?? null) : null,
        daysLeftInTrial: effective.status === "trial" ? (effective.daysLeft ?? 0) : null,
        lastCheckInAt: p.last_check_in,
      };
    });

    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Missing Supabase config, network, etc. — return valid JSON so the kiosk never breaks on res.json().
    return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}

