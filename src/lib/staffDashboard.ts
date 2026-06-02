import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { dedupeMembersById } from "@/lib/memberRoster";
import { isStaffFlaggedMember } from "@/lib/staffFlags";
import type { StaffFlagType } from "@/lib/staffFlags";

export type StaffCheckInRow = {
  id: string;
  at: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
};

export type StaffMemberNote = {
  id: string;
  body: string;
  createdAt: string;
};

export type StaffMemberParent = {
  name: string;
  phone: string;
  email?: string | null;
};

export type MemberAgeGroup = "adult" | "child";

export type StaffMemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  joinDate: string;
  lastVisit: string | null;
  totalVisits: number;
  memberState: "active" | "delinquent" | "frozen" | "canceled" | null;
  beltColor: string | null;
  monthlyPayment: number | null;
  ageGroup: MemberAgeGroup;
  /** ISO date `YYYY-MM-DD` */
  dateOfBirth: string | null;
  parents: StaffMemberParent[];
  notes: StaffMemberNote[];
  staffFlagType: StaffFlagType | null;
  staffFlagOther: string | null;
};

export function isChildMember(m: { ageGroup?: MemberAgeGroup }) {
  return m.ageGroup === "child";
}

export type StaffTrialRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  trialStartDate: string | null;
  trialEndDate: string;
  daysRemaining: number;
  dateOfBirth: string | null;
  parents: StaffMemberParent[];
  notes: StaffMemberNote[];
};

export type StaffGuestRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  createdAt: string;
  lastVisit: string | null;
  totalVisits: number;
  dateOfBirth: string | null;
  ageGroup: MemberAgeGroup;
  completedTrial: boolean;
  parents: StaffMemberParent[];
  notes: StaffMemberNote[];
};

export type StaffProfessorRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  createdAt: string;
};

export function isTrialExpired(trial: StaffTrialRow) {
  return trial.daysRemaining < 0;
}

export type StaffLeadRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  createdAt: string;
  parents: StaffMemberParent[];
  notes: StaffMemberNote[];
};

export type StaffDashboard = {
  source: "live" | "demo";
  message?: string;
  analytics: {
    checkInsToday: number;
    inactiveMembers7Days: number;
    trialsExpiringSoon: number;
    memberCount: number;
    trialCount: number;
    guestCount: number;
  };
  recentCheckIns: StaffCheckInRow[];
  members: StaffMemberRow[];
  trials: StaffTrialRow[];
  guests: StaffGuestRow[];
};

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function normalizePerson<T>(data: T | T[] | null): T | null {
  if (!data) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

export function sortMembersLeastRecentFirst(rows: StaffMemberRow[]) {
  const flagged = rows.filter(isStaffFlaggedMember);
  const flaggedIds = new Set(flagged.map((m) => m.id));
  const rest = rows.filter((m) => !flaggedIds.has(m.id));
  const byVisit = (a: StaffMemberRow, b: StaffMemberRow) => {
    if (!a.lastVisit && !b.lastVisit) return 0;
    if (!a.lastVisit) return -1;
    if (!b.lastVisit) return 1;
    return new Date(a.lastVisit).getTime() - new Date(b.lastVisit).getTime();
  };
  return [...flagged.sort(byVisit), ...rest.sort(byVisit)];
}

/** Expired (negative days) first, then 0–7 days left. */
export function sortTrialsByUrgency(rows: StaffTrialRow[]) {
  return [...rows].sort((a, b) => a.daysRemaining - b.daysRemaining);
}

function demoDateYearsAgo(years: number, month = 6, day = 15): string {
  const y = new Date().getFullYear() - years;
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Demo member with a birthday on the current calendar day (local). */
function demoBirthdayToday(birthYear = 1992): string {
  const now = new Date();
  const y = birthYear;
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultDemoDateOfBirth(memberId: string, ageGroup: MemberAgeGroup): string {
  const n = Number.parseInt(memberId.replace(/\D/g, ""), 10) || 1;
  if (ageGroup === "child") {
    return demoDateYearsAgo(8 + (n % 7), (n % 12) + 1, 10 + (n % 18));
  }
  return demoDateYearsAgo(22 + (n % 25), (n % 12) + 1, 5 + (n % 20));
}

function makeDemoMember(
  id: string,
  firstName: string,
  lastName: string,
  phone: string,
  opts: {
    email?: string | null;
    beltColor?: string | null;
    monthlyPayment?: number | null;
    memberState?: StaffMemberRow["memberState"];
    daysSinceVisit?: number | null;
    totalVisits?: number;
    notes?: StaffMemberRow["notes"];
    ageGroup?: MemberAgeGroup;
    dateOfBirth?: string | null;
    parents?: StaffMemberParent[];
  } = {}
): StaffMemberRow {
  const ageGroup = opts.ageGroup ?? "adult";
  const lastVisit =
    opts.daysSinceVisit === null
      ? null
      : new Date(Date.now() - (opts.daysSinceVisit ?? 5) * 86400000).toISOString();
  return {
    id,
    firstName,
    lastName,
    phone,
    email: opts.email ?? null,
    joinDate: new Date(Date.now() - 400 * 86400000).toISOString(),
    lastVisit,
    totalVisits: opts.totalVisits ?? 20,
    memberState: opts.memberState ?? "active",
    beltColor: opts.beltColor ?? "White",
    monthlyPayment: opts.monthlyPayment ?? 109,
    ageGroup,
    dateOfBirth: opts.dateOfBirth ?? defaultDemoDateOfBirth(id, ageGroup),
    parents: opts.parents ?? [],
    notes: opts.notes ?? [],
    staffFlagType: null,
    staffFlagOther: null,
  };
}

const DEMO_MEMBERS_CORE: StaffMemberRow[] = [
  makeDemoMember("m1", "Chris", "Nguyen", "7275553301", {
    email: "chris.nguyen@example.com",
    beltColor: "Blue",
    monthlyPayment: 149,
    memberState: "delinquent",
    daysSinceVisit: null,
    totalVisits: 12,
    notes: [
      {
        id: "n1",
        body: "Payment plan discussed — follow up Friday.",
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
    ],
  }),
  makeDemoMember("m2", "Pat", "Morgan", "7275553302", {
    beltColor: "Purple",
    monthlyPayment: 129,
    daysSinceVisit: 12,
    totalVisits: 89,
  }),
  makeDemoMember("m3", "Alex", "Rivera", "7275550100", {
    email: "alex.rivera@example.com",
    beltColor: "Brown",
    monthlyPayment: 119,
    daysSinceVisit: 2,
    totalVisits: 210,
    dateOfBirth: demoBirthdayToday(1992),
  }),
  makeDemoMember("m4", "Taylor", "Reed", "7275553401", {
    beltColor: "White",
    monthlyPayment: 99,
    daysSinceVisit: 1,
    ageGroup: "child",
    dateOfBirth: demoDateYearsAgo(10),
    parents: [
      { name: "Jennifer Reed", phone: "7275559011" },
      { name: "Mark Reed", phone: "7275559012" },
    ],
  }),
  makeDemoMember("m5", "Sam", "Diaz", "7275553402", { email: "sam.d@example.com", beltColor: "Blue", monthlyPayment: 129, daysSinceVisit: 4 }),
  makeDemoMember("m6", "Jamie", "Park", "7275553403", { beltColor: "Purple", monthlyPayment: 139, daysSinceVisit: 8 }),
  makeDemoMember("m7", "Morgan", "Ellis", "7275553404", { email: "morgan.e@example.com", beltColor: "Brown", monthlyPayment: 149, daysSinceVisit: 10, memberState: "frozen" }),
  makeDemoMember("m8", "Riley", "Kim", "7275553405", { beltColor: "Black", monthlyPayment: 159, daysSinceVisit: 3 }),
  makeDemoMember("m9", "Casey", "Brooks", "7275553406", {
    beltColor: "White",
    monthlyPayment: 99,
    daysSinceVisit: 14,
    ageGroup: "child",
    dateOfBirth: demoDateYearsAgo(12),
    parents: [{ name: "Lisa Brooks", phone: "7275559020" }],
  }),
  makeDemoMember("m10", "Drew", "Hayes", "7275553407", { email: "drew.h@example.com", beltColor: "Blue", monthlyPayment: 119, daysSinceVisit: 5 }),
  makeDemoMember("m11", "Jordan", "Lee", "7275553408", { beltColor: "Purple", monthlyPayment: 129, daysSinceVisit: null, memberState: "delinquent" }),
  makeDemoMember("m12", "Avery", "Clark", "7275553409", { beltColor: "Brown", monthlyPayment: 139, daysSinceVisit: 6 }),
  makeDemoMember("m13", "Quinn", "Martinez", "7275553410", {
    email: "quinn.m@example.com",
    beltColor: "White",
    monthlyPayment: 109,
    daysSinceVisit: 9,
    ageGroup: "child",
    dateOfBirth: demoDateYearsAgo(9),
    parents: [
      { name: "Ana Martinez", phone: "7275559031" },
      { name: "Carlos Martinez", phone: "7275559032" },
    ],
  }),
  makeDemoMember("m14", "Blake", "Turner", "7275553411", { beltColor: "Blue", monthlyPayment: 129, daysSinceVisit: 11 }),
  makeDemoMember("m15", "Skyler", "Bennett", "7275553412", { beltColor: "Purple", monthlyPayment: 134, daysSinceVisit: 15 }),
  makeDemoMember("m16", "Reese", "Foster", "7275553413", { beltColor: "Brown", monthlyPayment: 144, daysSinceVisit: 7, memberState: "canceled" }),
  makeDemoMember("m17", "Cameron", "Bell", "7275553414", { email: "cameron.b@example.com", beltColor: "Black", monthlyPayment: 154, daysSinceVisit: 2 }),
  makeDemoMember("m18", "Dakota", "Wells", "7275553415", {
    beltColor: "White",
    monthlyPayment: 99,
    daysSinceVisit: 20,
    ageGroup: "child",
    dateOfBirth: demoDateYearsAgo(14),
    parents: [{ name: "Pat Wells", phone: "7275559040" }],
  }),
];

const DEMO: StaffDashboard = {
  source: "demo",
  message:
    "Sample data — connect Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) in web/.env.local to see real check-ins and profiles.",
  analytics: {
    checkInsToday: 3,
    inactiveMembers7Days: 7,
    trialsExpiringSoon: 1,
    memberCount: 18,
    trialCount: 4,
    guestCount: 4,
  },
  recentCheckIns: [
    {
      id: "c1",
      at: new Date().toISOString(),
      firstName: "Alex",
      lastName: "Rivera",
      phone: "5550100",
      status: "member",
    },
    {
      id: "c2",
      at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      firstName: "Jordan",
      lastName: "Lee",
      phone: "5550199",
      status: "trial",
    },
    {
      id: "c3",
      at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      firstName: "Sam",
      lastName: "Taylor",
      phone: "7273891434",
      status: "guest",
    },
  ],
  members: DEMO_MEMBERS_CORE,
  trials: [
    {
      id: "t5",
      firstName: "Dana",
      lastName: "Castillo",
      phone: "7275553509",
      email: "dana.castillo@example.com",
      trialStartDate: new Date(Date.now() - 14 * 86400000).toISOString(),
      trialEndDate: new Date(Date.now() - 3 * 86400000).toISOString(),
      daysRemaining: -3,
      dateOfBirth: null,
      parents: [],
      notes: [
        {
          id: "tn-expired-1",
          body: "Trial ended — requested callback about family plan.",
          createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        },
      ],
    },
    {
      id: "t1",
      firstName: "Jordan",
      lastName: "Lee",
      phone: "7275553999",
      email: null,
      trialStartDate: new Date(Date.now() - 5 * 86400000).toISOString(),
      trialEndDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      daysRemaining: 2,
      dateOfBirth: null,
      parents: [],
      notes: [],
    },
    {
      id: "t4",
      firstName: "Avery",
      lastName: "Nguyen",
      phone: "7275553502",
      email: "avery.n@example.com",
      trialStartDate: new Date(Date.now() - 6 * 86400000).toISOString(),
      trialEndDate: new Date(Date.now() + 1 * 86400000).toISOString(),
      daysRemaining: 1,
      dateOfBirth: null,
      parents: [],
      notes: [],
    },
    {
      id: "t2",
      firstName: "Riley",
      lastName: "Kim",
      phone: "7275553998",
      email: null,
      trialStartDate: new Date(Date.now() - 1 * 86400000).toISOString(),
      trialEndDate: new Date(Date.now() + 6 * 86400000).toISOString(),
      daysRemaining: 6,
      dateOfBirth: null,
      parents: [],
      notes: [],
    },
  ],
  guests: [
    {
      id: "g3",
      firstName: "Morgan",
      lastName: "Shaw",
      phone: "7275553501",
      email: "morgan.shaw@example.com",
      createdAt: new Date().toISOString(),
      lastVisit: null,
      totalVisits: 0,
      dateOfBirth: demoDateYearsAgo(28),
      completedTrial: true,
      ageGroup: "adult",
      parents: [],
      notes: [
        {
          id: "gn1",
          body: "Left voicemail — interested in evening classes.",
          createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        },
      ],
    },
    {
      id: "g1",
      firstName: "Sam",
      lastName: "Taylor",
      phone: "7275553601",
      email: "sam.t@example.com",
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      lastVisit: new Date().toISOString(),
      totalVisits: 1,
      dateOfBirth: null,
      ageGroup: "adult",
      completedTrial: false,
      parents: [],
      notes: [],
    },
    {
      id: "g2",
      firstName: "Casey",
      lastName: "Brooks",
      phone: "7275553602",
      email: null,
      createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      lastVisit: null,
      totalVisits: 0,
      dateOfBirth: null,
      ageGroup: "adult",
      completedTrial: true,
      parents: [],
      notes: [],
    },
    {
      id: "l1",
      firstName: "Taylor",
      lastName: "Reed",
      phone: "7275552101",
      email: "taylor@example.com",
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      lastVisit: null,
      totalVisits: 0,
      dateOfBirth: null,
      ageGroup: "adult",
      completedTrial: false,
      parents: [],
      notes: [],
    },
  ],
};

export async function getStaffDashboard(): Promise<StaffDashboard> {
  try {
    const supabase = getSupabaseAdmin();
    const dayStart = startOfUtcDay();

    const [analyticsRes, memberRpc, trialRpc, guestRpc, checkInsRes] = await Promise.all([
      supabase.rpc("admin_analytics"),
      supabase.rpc("admin_people_list", { p_status: "member" }),
      supabase.rpc("admin_people_list", { p_status: "trial" }),
      supabase.rpc("admin_people_list", { p_status: "guest" }),
      supabase
        .from("check_ins")
        .select(
          `id, timestamp, people ( first_name, last_name, phone, status )`
        )
        .order("timestamp", { ascending: false })
        .limit(50),
    ]);

    if (analyticsRes.error || checkInsRes.error) {
      throw analyticsRes.error ?? checkInsRes.error;
    }

    const analyticsJson = (analyticsRes.data ?? {}) as {
      total_check_ins_today?: number;
      inactive_members_7plus_days?: number;
      trials_expiring_soon_3_days?: number;
    };

    type RpcMember = {
      id: string;
      first_name: string;
      last_name: string;
      phone: string;
      email: string | null;
      join_date: string;
      last_visit: string | null;
      total_visits: number;
      member_state: StaffMemberRow["memberState"];
      belt_color: string | null;
      monthly_payment: number | null;
      notes: { id: string; body: string; created_at: string }[] | null;
      member_age_group?: MemberAgeGroup | null;
      member_parents?: { name: string; phone: string }[] | null;
      date_of_birth?: string | null;
      staff_flag_type?: StaffFlagType | null;
      staff_flag_other?: string | null;
    };
    type RpcTrial = {
      id: string;
      first_name: string;
      last_name: string;
      phone: string;
      email: string | null;
      trial_start_date: string | null;
      trial_end_date: string;
      days_remaining: number;
      date_of_birth?: string | null;
      member_parents?: { name: string; phone: string; email?: string | null }[] | null;
      notes: { id: string; body: string; created_at: string }[] | null;
    };
    type RpcGuest = {
      id: string;
      first_name: string;
      last_name: string;
      phone: string;
      email: string | null;
      created_at: string;
      last_visit: string | null;
      completed_trial?: boolean;
      total_visits?: number;
      date_of_birth?: string | null;
      member_age_group?: string | null;
      member_parents?: { name: string; phone: string; email?: string | null }[] | null;
      notes: { id: string; body: string; created_at: string }[] | null;
    };
    const membersRaw = (memberRpc.data ?? []) as RpcMember[];
    const trialsRaw = (trialRpc.data ?? []) as RpcTrial[];
    const guestsRaw = (guestRpc.data ?? []) as RpcGuest[];

    const members: StaffMemberRow[] = membersRaw.map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      phone: p.phone,
      email: p.email,
      joinDate: p.join_date,
      lastVisit: p.last_visit,
      totalVisits: p.total_visits,
      memberState: p.member_state,
      beltColor: p.belt_color ?? null,
      monthlyPayment: p.monthly_payment != null ? Number(p.monthly_payment) : null,
      ageGroup: p.member_age_group === "child" ? "child" : "adult",
      dateOfBirth: p.date_of_birth ?? null,
      parents: Array.isArray(p.member_parents)
        ? p.member_parents.filter(
            (g): g is StaffMemberParent =>
              Boolean(g?.name && g?.phone)
          )
        : [],
      notes: (p.notes ?? []).map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.created_at,
      })),
      staffFlagType: p.staff_flag_type ?? null,
      staffFlagOther: p.staff_flag_other ?? null,
    }));

    const trials: StaffTrialRow[] = trialsRaw.map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      phone: p.phone,
      email: p.email,
      trialStartDate: p.trial_start_date,
      trialEndDate: p.trial_end_date,
      daysRemaining: p.days_remaining,
      dateOfBirth: p.date_of_birth ?? null,
      parents: Array.isArray(p.member_parents)
        ? p.member_parents.filter((g): g is StaffMemberParent => Boolean(g?.name && g?.phone))
        : [],
      notes: (p.notes ?? []).map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.created_at,
      })),
    }));

    const guests: StaffGuestRow[] = guestsRaw.map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      phone: p.phone,
      email: p.email,
      createdAt: p.created_at,
      lastVisit: p.last_visit,
      totalVisits: p.total_visits ?? 0,
      dateOfBirth: p.date_of_birth ?? null,
      ageGroup: p.member_age_group === "child" ? "child" : "adult",
      completedTrial: Boolean(p.completed_trial),
      parents: Array.isArray(p.member_parents)
        ? p.member_parents.filter((g): g is StaffMemberParent => Boolean(g?.name && g?.phone))
        : [],
      notes: (p.notes ?? []).map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.created_at,
      })),
    }));

    const recentCheckIns: StaffCheckInRow[] = (checkInsRes.data ?? []).map(
      (r: { id: string; timestamp: string; people: unknown }) => {
        const p = normalizePerson(
          r.people as {
            first_name: string;
            last_name: string;
            phone: string;
            status: string;
          } | null
        );
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

    return {
      source: "live",
      analytics: {
        checkInsToday: analyticsJson.total_check_ins_today ?? 0,
        inactiveMembers7Days: analyticsJson.inactive_members_7plus_days ?? 0,
        trialsExpiringSoon: analyticsJson.trials_expiring_soon_3_days ?? 0,
        memberCount: members.length,
        trialCount: trials.length,
        guestCount: guests.length,
      },
      recentCheckIns,
      members: sortMembersLeastRecentFirst(dedupeMembersById(members)),
      trials: sortTrialsByUrgency(trials),
      guests,
    };
  } catch {
    return {
      ...DEMO,
      members: sortMembersLeastRecentFirst(dedupeMembersById(DEMO.members)),
      trials: sortTrialsByUrgency(DEMO.trials),
    };
  }
}
