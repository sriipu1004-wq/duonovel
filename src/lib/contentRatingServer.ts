import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type R18ViewerPreference = {
  signedIn: boolean;
  userId: string | null;
  showR18Content: boolean;
  ageConfirmed: boolean;
};

export const getCurrentR18ViewerPreference = cache(
  async (): Promise<R18ViewerPreference> => {
    try {
      const supabase = await createClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        return {
          signedIn: false,
          userId: null,
          showR18Content: false,
          ageConfirmed: false,
        };
      }

      const admin = createAdminClient();
      const preference = await admin
        .from("users")
        .select("show_r18_content, r18_confirmed_at")
        .eq("id", user.id)
        .maybeSingle();

      if (preference.error || !preference.data) {
        return {
          signedIn: true,
          userId: user.id,
          showR18Content: false,
          ageConfirmed: false,
        };
      }

      const ageConfirmed =
        typeof preference.data.r18_confirmed_at === "string" &&
        preference.data.r18_confirmed_at.trim().length > 0;

      return {
        signedIn: true,
        userId: user.id,
        showR18Content:
          preference.data.show_r18_content === true && ageConfirmed,
        ageConfirmed,
      };
    } catch {
      return {
        signedIn: false,
        userId: null,
        showR18Content: false,
        ageConfirmed: false,
      };
    }
  }
);
