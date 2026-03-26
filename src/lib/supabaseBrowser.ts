import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseBrowserClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (!supabaseBrowserClient) {
    supabaseBrowserClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // We handle code exchange in `/auth/callback`, so avoid "best effort" URL parsing.
        detectSessionInUrl: false,
      },
    });
  }

  return supabaseBrowserClient;
}

