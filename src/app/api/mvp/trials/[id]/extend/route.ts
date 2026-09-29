import { NextResponse } from "next/server";
import { isDemoPersonId } from "@/lib/personNotesApi";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function daysRemainingFromEnd(endIso: string, now = new Date()): number {
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(endMs)) return 0;
  return Math.ceil((endMs - now.getTime()) / 86400000);
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const raw =
    body && typeof body === "object" && "trialEndDate" in body
      ? (body as { trialEndDate?: unknown }).trialEndDate
      : null;
  const trialEndDate =
    typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T23:59:59.999Z`
      : typeof raw === "string" && !Number.isNaN(Date.parse(raw))
        ? raw
        : null;

  if (!trialEndDate) {
    return NextResponse.json({ error: "Pick a valid trial end date." }, { status: 400 });
  }

  if (isDemoPersonId(id)) {
    return NextResponse.json({
      source: "demo",
      ok: true,
      trial: {
        id,
        trialEndDate,
        daysRemaining: daysRemainingFromEnd(trialEndDate),
      },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_extend_trial", {
      p_person_id: id,
      p_trial_end_date: trialEndDate,
    });
    if (error) throw error;

    const result = data as {
      ok: boolean;
      error?: string;
      trial?: {
        id: string;
        trial_start_date: string | null;
        trial_end_date: string;
        days_remaining: number;
      };
    };

    if (!result.ok || !result.trial) {
      return NextResponse.json(
        { error: result.error === "not_trial" ? "Not an active trial." : "Could not extend trial." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      source: "live",
      ok: true,
      trial: {
        id: result.trial.id,
        trialStartDate: result.trial.trial_start_date,
        trialEndDate: result.trial.trial_end_date,
        daysRemaining: result.trial.days_remaining,
      },
    });
  } catch {
    // Fallback if RPC not deployed yet.
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("people")
        .update({ trial_end_date: trialEndDate, completed_trial: false })
        .eq("id", id)
        .eq("status", "trial")
        .select("id, trial_start_date, trial_end_date")
        .maybeSingle();
      if (error || !data) {
        return NextResponse.json({ error: "Could not extend trial." }, { status: 500 });
      }
      return NextResponse.json({
        source: "live",
        ok: true,
        trial: {
          id: data.id,
          trialStartDate: data.trial_start_date,
          trialEndDate: data.trial_end_date,
          daysRemaining: daysRemainingFromEnd(data.trial_end_date),
        },
      });
    } catch {
      return NextResponse.json({ error: "Could not extend trial." }, { status: 500 });
    }
  }
}
