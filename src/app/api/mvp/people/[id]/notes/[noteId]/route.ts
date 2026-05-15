import { NextResponse } from "next/server";
import { z } from "zod";
import { isDemoPersonId } from "@/lib/personNotesApi";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

type RouteContext = { params: Promise<{ id: string; noteId: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const { id, noteId } = await context.params;

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

  if (isDemoPersonId(id)) {
    return NextResponse.json({
      source: "demo",
      note: { id: noteId, body: parsed.data.body, createdAt: new Date().toISOString() },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_update_person_note", {
      p_person_id: id,
      p_note_id: noteId,
      p_body: parsed.data.body,
    });
    if (error) throw error;

    const result = data as { ok: boolean; note?: { id: string; body: string; created_at: string } };
    if (!result.ok || !result.note) {
      return NextResponse.json({ error: "Could not update note." }, { status: 404 });
    }

    return NextResponse.json({
      source: "live",
      note: {
        id: result.note.id,
        body: result.note.body,
        createdAt: result.note.created_at,
      },
    });
  } catch {
    return NextResponse.json({
      source: "demo",
      note: { id: noteId, body: parsed.data.body, createdAt: new Date().toISOString() },
    });
  }
}
