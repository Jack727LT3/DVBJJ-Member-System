import { NextResponse } from "next/server";
import { z } from "zod";
import { isKioskDemoMemberEnabled, isKioskDemoMemberId } from "@/lib/kioskDemoMember";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { buildKioskLeadFirstVisitMessage, buildKioskMessage, type PersonRowForMessaging } from "@/lib/statusResolver";

export const dynamic = "force-dynamic";

const CheckInSchema = z.object({
  personId: z.string().uuid(),
});

type KioskCheckInPerson = {
  id: string;
  first_name: string;
  last_name: string;
  status: "lead" | "trial" | "guest" | "member";
  member_state: "active" | "delinquent" | "frozen" | "canceled" | null;
  trial_end_date: string | null;
  last_check_in: string | null;
};

type KioskCheckInRpcResult = {
  ok: boolean;
  error?: string;
  person?: KioskCheckInPerson;
  lead_first_visit?: boolean;
};

export async function POST(req: Request) {
  const body = CheckInSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input", details: body.error.flatten() }, { status: 400 });
  }

  const personId = body.data.personId;
  const now = new Date();

  if (isKioskDemoMemberEnabled() && isKioskDemoMemberId(personId)) {
    const personForMessaging: PersonRowForMessaging = {
      id: personId,
      first_name: "Jack",
      last_name: "Wahl",
      status: "member",
      member_state: "active",
      trial_end_date: null,
      last_check_in: now.toISOString(),
    };
    const message = buildKioskMessage(personForMessaging, now);
    return NextResponse.json(
      {
        messageTitle: message.title,
        messageBody: message.body,
        confirmation: { checkInLogged: true },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("kiosk_check_in", { p_person_id: personId });
  if (error) {
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }

  const result = data as KioskCheckInRpcResult;
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

