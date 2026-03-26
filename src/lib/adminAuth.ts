import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function parseWhitelist(): string[] {
  const raw = process.env.ADMIN_EMAIL_WHITELIST || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdminFromRequest(req: Request): Promise<{ email: string }> {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error("Missing/invalid Authorization header");
  }

  const accessToken = match[1];
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user?.email) {
    throw new Error("Invalid session");
  }

  const email = data.user.email;
  const whitelist = parseWhitelist();
  if (!whitelist.length) {
    throw new Error("ADMIN_EMAIL_WHITELIST is not configured");
  }

  if (!whitelist.includes(email.toLowerCase())) {
    throw new Error("Not authorized");
  }

  return { email };
}

