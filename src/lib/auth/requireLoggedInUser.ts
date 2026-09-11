import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";

export async function requireLoggedInUser(nextPath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    const locale = await getUiLocale();
    const localizedNextPath = localizePath(nextPath, locale);
    const loginPath = localizePath("/login", locale);
    redirect(`${loginPath}?next=${encodeURIComponent(localizedNextPath)}`);
  }

  return {
    supabase,
    user: data.user,
  };
}
