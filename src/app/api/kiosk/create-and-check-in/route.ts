import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";
import {
  buildKioskLeadFirstVisitMessage,
  buildKioskMessage,
  type PersonRowForMessaging,
} from "@/lib/statusResolver";

export const dynamic = "force-dynamic";

const CreateAndCheckInSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(4).max(20),
  email: z.string().trim().email().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
});

type KioskCreateGuestRpcResult = {
  ok: boolean;
  error?: string;
  person?: {
    id: string;
    first_name: string;
    last_name: string;
    status: "lead" | "trial" | "guest" | "member";
    member_state: "active" | "delinquent" | "frozen" | "canceled" | null;
    trial_end_date: string | null;
    last_check_in: string | null;
  };
  lead_first_visit?: boolean;
};

export async function POST(req: Request) {
  const body = CreateAndCheckInSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input", details: body.error.flatten() }, { status: 400 });
  }

  const { firstName, lastName, phone, email } = body.data;
  const phoneDigits = normalizePhone(phone);

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("kiosk_create_guest_and_check_in", {
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone: phoneDigits,
    p_email: email ?? null,
  });

  if (error) {
    return NextResponse.json({ error: "Create check-in failed" }, { status: 500 });
  }

  const result = data as KioskCreateGuestRpcResult;
  if (!result?.ok || !result.person) {
    return NextResponse.json({ error: result?.error ?? "Not found" }, { status: 404 });
  }

  const person = result.person;
  const leadFirstVisit = Boolean(result.lead_first_visit);

  const personForMessaging: PersonRowForMessaging = {
    id: person.id,
    first_name: person.first_name,
    last_name: person.last_name,
    status: person.status,
    member_state: person.member_state,
    trial_end_date: person.trial_end_date,
    last_check_in: person.last_check_in,
  };

  const now = new Date();
  const message = leadFirstVisit
    ? buildKioskLeadFirstVisitMessage(personForMessaging)
    : buildKioskMessage(personForMessaging, now);

  return NextResponse.json(
    {
      messageTitle: message.title,
      messageBody: message.body,
      confirmation: { checkInLogged: true },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

