import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireLoggedInUser(nextPath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return {
    supabase,
    user: data.user,
  };
}