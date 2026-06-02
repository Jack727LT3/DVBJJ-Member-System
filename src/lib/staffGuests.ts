import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";
import type { StaffGuestRow } from "@/lib/staffDashboard";

export type CreateStaffGuestInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
};

type RpcGuest = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  created_at: string;
  last_visit: string | null;
  total_visits: number;
  completed_trial: boolean;
};

function mapGuest(row: RpcGuest, phoneFallback: string): StaffGuestRow {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone ?? phoneFallback,
    email: row.email ?? null,
    createdAt: row.created_at,
    lastVisit: row.last_visit,
    totalVisits: row.total_visits ?? 0,
    dateOfBirth: null,
    ageGroup: "adult",
    completedTrial: Boolean(row.completed_trial),
    parents: [],
    notes: [],
  };
}

export async function createStaffGuest(
  input: CreateStaffGuestInput
): Promise<{ ok: true; guest: StaffGuestRow } | { ok: false; error: string }> {
  const phone = normalizePhone(input.phone);
  if (phone.length < 4) {
    return { ok: false, error: "Enter a valid phone number." };
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("mvp_create_guest", {
      p_first_name: input.firstName.trim(),
      p_last_name: input.lastName.trim(),
      p_phone: phone,
      p_email: input.email?.trim() || null,
    });
    if (error) throw error;

    const result = data as { ok: boolean; error?: string; guest?: RpcGuest };
    if (!result.ok || !result.guest) {
      if (result.error === "phone_in_use") {
        return { ok: false, error: "That phone number is already on a member or trial profile." };
      }
      if (result.error === "out_of_store_lead") {
        return {
          ok: false,
          error: "That phone is an out-of-gym lead — move them to guests from their profile first.",
        };
      }
      return { ok: false, error: "Could not save guest." };
    }
    return { ok: true, guest: mapGuest(result.guest, phone) };
  } catch {
    return { ok: false, error: "Database not connected — use demo mode on this device." };
  }
}
