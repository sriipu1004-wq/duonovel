import "server-only";

import { createClient } from "@supabase/supabase-js";
import { adminReadRetryFetch } from "@/lib/supabase/serverPublic";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin env is missing");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      // Retries an idempotent GET/HEAD once on a network-level failure (#137).
      fetch: adminReadRetryFetch,
    },
  });
}
