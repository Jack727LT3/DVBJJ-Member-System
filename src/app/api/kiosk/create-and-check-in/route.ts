import { NextResponse } from "next/server";
import { z } from "zod";
import { isKioskDemoMemberEnabled, matchesKioskDemoGuestPath } from "@/lib/kioskDemoMember";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";
import {
  buildKioskLeadFirstVisitMessage,
  buildKioskMessage,
  getEffectiveStatusForMessaging,
  type PersonRowForMessaging,
} from "@/lib/statusResolver";

export const dynamic = "force-dynamic";

const CreateAndCheckInSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(4).max(20),
  email: z.string().trim().email().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  /** When true (default), new signup starts a 7-day trial; when false, creates a guest only. */
  startTrial: z.boolean().optional().default(true),
  /** When true, always create a separate person on a shared family phone. */
  forceNewPerson: z.boolean().optional().default(false),
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
    trial_start_date: string | null;
    trial_end_date: string | null;
    last_check_in: string | null;
  };
  lead_first_visit?: boolean;
};

function devGuestCheckInSuccessResponse(startTrial: boolean) {
  return NextResponse.json(
    {
      messageTitle: "Welcome!",
      messageBody: "Please sign in with the front desk.",
      confirmation: { checkInLogged: true },
      trialDaysLeft: startTrial ? 7 : null,
      status: startTrial ? "trial" : "guest",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const body = CreateAndCheckInSchema.safeParse(rawBody);
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input", details: body.error.flatten() }, { status: 400 });
  }

  const { firstName, lastName, phone, email, startTrial, forceNewPerson } = body.data;
  const phoneDigits = normalizePhone(phone);

  if (isKioskDemoMemberEnabled() && matchesKioskDemoGuestPath(phone)) {
    return NextResponse.json(
      {
        messageTitle: "Welcome",
        messageBody: startTrial ? "Demo trial check-in" : "Demo guest check-in",
        confirmation: { checkInLogged: true },
        trialDaysLeft: startTrial ? 7 : null,
        status: startTrial ? "trial" : "guest",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc("kiosk_create_guest_and_check_in", {
      p_first_name: firstName,
      p_last_name: lastName,
      p_phone: phoneDigits,
      p_email: email ?? null,
      p_start_trial: startTrial,
      p_force_new_person: forceNewPerson,
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

    const effective = getEffectiveStatusForMessaging(personForMessaging, now);
    const trialDaysLeft =
      effective.status === "trial" ? (effective.daysLeft ?? 0) : null;

    return NextResponse.json(
      {
        messageTitle: message.title,
        messageBody: message.body,
        confirmation: { checkInLogged: true },
        personId: person.id,
        trialDaysLeft,
        trialStartDate: person.trial_start_date ?? null,
        trialEndDate: person.trial_end_date ?? null,
        status: person.status,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    if (isKioskDemoMemberEnabled()) {
      return devGuestCheckInSuccessResponse(startTrial);
    }
    return NextResponse.json(
      { error: "We couldn't complete check-in. Please see the front desk." },
      { status: 503 }
    );
  }
}

