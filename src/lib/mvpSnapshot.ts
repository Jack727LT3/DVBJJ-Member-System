import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type MvpCheckInRow = {
  id: string;
  at: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
};

export type MvpSnapshot = {
  source: "live" | "demo";
  message?: string;
  stats: {
    checkInsToday: number;
    totalPeopleApprox?: number;
  };
  rows: MvpCheckInRow[];
};

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const DEMO_ROWS: MvpCheckInRow[] = [
  {
    id: "demo-1",
    at: new Date().toISOString(),
    firstName: "Alex",
    lastName: "Rivera",
    phone: "5550100",
    status: "member",
  },
  {
    id: "demo-2",
    at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    firstName: "Jordan",
    lastName: "Lee",
    phone: "5550199",
    status: "trial",
  },
  {
    id: "demo-3",
    at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    firstName: "Sam",
    lastName: "Taylor",
    phone: "7273891434",
    status: "guest",
  },
];

/**
 * Minimal snapshot for the MVP viewer: recent check-ins with person info.
 * Uses Supabase when env is configured; otherwise returns demo rows so the page always renders.
 */
export async function getMvpSnapshot(): Promise<MvpSnapshot> {
  try {
    const supabase = getSupabaseAdmin();
    const dayStart = startOfUtcDay();

    const { data: recent, error } = await supabase
      .from("check_ins")
      .select(
        `
        id,
        timestamp,
        people (
          first_name,
          last_name,
          phone,
          status
        )
      `
      )
      .order("timestamp", { ascending: false })
      .limit(75);

    if (error || !recent) {
      throw error ?? new Error("No check-in data");
    }

    type PersonRow = {
      first_name: string;
      last_name: string;
      phone: string;
      status: string;
    };

    function normalizePerson(data: PersonRow | PersonRow[] | null): PersonRow | null {
      if (!data) return null;
      return Array.isArray(data) ? data[0] ?? null : data;
    }

    const rows: MvpCheckInRow[] = (recent as unknown as { id: string; timestamp: string; people: unknown }[]).map(
      (r) => {
        const p = normalizePerson(r.people as PersonRow | PersonRow[] | null);
        return {
          id: r.id,
          at: r.timestamp,
          firstName: p?.first_name ?? "—",
          lastName: p?.last_name ?? "",
          phone: p?.phone ?? "—",
          status: p?.status ?? "—",
        };
      }
    );

    const checkInsToday = rows.filter((r) => new Date(r.at) >= dayStart).length;

    const { count } = await supabase.from("people").select("*", { count: "exact", head: true });

    return {
      source: "live",
      stats: {
        checkInsToday,
        totalPeopleApprox: count ?? undefined,
      },
      rows,
    };
  } catch {
    return {
      source: "demo",
      message:
        "Supabase isn’t configured or the query failed. Showing sample rows. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to see live check-ins.",
      stats: {
        checkInsToday: 1,
      },
      rows: DEMO_ROWS,
    };
  }
}
