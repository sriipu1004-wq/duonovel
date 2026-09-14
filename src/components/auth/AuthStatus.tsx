"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { useCommonDictionary, useUiLocale } from "@/i18n/UiLocaleProvider";
import { localizePath } from "@/i18n/navigation";
import { stripUiLocalePrefix } from "@/i18n/config";
import { buildCurrentLoginHref } from "@/lib/auth/loginRedirect";

function shortenEmail(email: string): string {
  if (email.length <= 28) return email;
  return `${email.slice(0, 12)}...${email.slice(-12)}`;
}

export default function AuthStatus() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useUiLocale();
  const dictionary = useCommonDictionary();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutPending, setLogoutPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const search = searchParams.toString();
  const loginHref = useMemo(
    () => buildCurrentLoginHref({ pathname, search, locale }),
    [locale, pathname, search]
  );
  const isMyPage = stripUiLocalePrefix(pathname) === "/mypage";

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error) {
        setErrorMessage(dictionary.authStateFailed);
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(data.user ?? null);
      setLoading(false);
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
      setErrorMessage("");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [dictionary.authStateFailed]);

  async function handleLogout() {
    setLogoutPending(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(dictionary.logoutFailed);
      setLogoutPending(false);
      return;
    }

    setUser(null);
    setLogoutPending(false);
    router.refresh();
  }

  if (loading) {
    return (
      <div className="shrink-0 whitespace-nowrap text-[10px] text-neutral-500 dark:text-neutral-400 sm:text-xs">
        {dictionary.authChecking}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-w-0 shrink items-center justify-end gap-1.5 sm:gap-3">
        {errorMessage ? (
          <span className="hidden text-xs text-amber-400 sm:inline">
            {errorMessage}
          </span>
        ) : null}

        <Link
          href={loginHref}
          className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/10 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-black transition hover:opacity-90 dark:border-white/20 sm:px-4 sm:py-2 sm:text-xs"
        >
          {dictionary.login}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 shrink items-center justify-end gap-1.5 sm:gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
          {dictionary.signedIn}
        </p>
        <p
          className="max-w-[220px] truncate text-xs text-neutral-700 dark:text-neutral-200"
          title={user.email ?? ""}
        >
          {user.email ? shortenEmail(user.email) : dictionary.signedIn}
        </p>
      </div>

      <Link
        href={localizePath("/mypage", locale)}
        className={[
          "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1.5 text-[clamp(0.625rem,3vw,0.75rem)] font-semibold transition sm:px-4 sm:py-2 sm:text-xs",
          isMyPage
            ? "border border-white/10 bg-white text-black"
            : "border border-white/10 bg-white/5 text-neutral-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10",
        ].join(" ")}
      >
        {dictionary.myPage}
      </Link>

      <button
        type="button"
        onClick={handleLogout}
        disabled={logoutPending}
        className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[clamp(0.625rem,3vw,0.75rem)] font-semibold text-neutral-900 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white dark:hover:bg-white/10 sm:px-4 sm:py-2 sm:text-xs"
      >
        {logoutPending ? dictionary.loggingOut : dictionary.logout}
      </button>
    </div>
  );
}
