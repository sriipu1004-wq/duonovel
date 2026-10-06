"use client";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

let publicClient: SupabaseClient | null = null;

export function createAnonymousPublicBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase public browser env is missing");
  }

  if (publicClient) {
    return publicClient;
  }

  publicClient = createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return publicClient;
}
