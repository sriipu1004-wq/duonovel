"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

function buildLoginHref(pathname: string | null): string {
  const nextPath = pathname && pathname.startsWith("/") ? pathname : "/";

  if (nextPath === "/login") {
    return "/login";
  }

  return nextPath === "/"
    ? "/login"
    : `/login?next=${encodeURIComponent(nextPath)}`;
}

function shortenEmail(email: string): string {
  if (email.length <= 28) return email;
  return `${email.slice(0, 12)}...${email.slice(-12)}`;
}

export default function AuthStatus() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutPending, setLogoutPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loginHref = useMemo(() => buildLoginHref(pathname), [pathname]);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error) {
        setErrorMessage("認証状態の取得に失敗した");
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
  }, []);

  async function handleLogout() {
    setLogoutPending(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage("ログアウトに失敗した");
      setLogoutPending(false);
      return;
    }

    setUser(null);
    setLogoutPending(false);
    router.refresh();
  }

  if (loading) {
    return (
      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        認証確認中...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        {errorMessage ? (
          <span className="hidden text-xs text-amber-400 sm:inline">
            {errorMessage}
          </span>
        ) : null}

        <Link
          href={loginHref}
          className="inline-flex items-center rounded-full border border-white/10 bg-white px-4 py-2 text-xs font-semibold text-black transition hover:opacity-90 dark:border-white/20"
        >
          ログイン
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
          Signed in
        </p>
        <p
          className="max-w-[220px] truncate text-xs text-neutral-700 dark:text-neutral-200"
          title={user.email ?? ""}
        >
          {user.email ? shortenEmail(user.email) : "ログイン中"}
        </p>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        disabled={logoutPending}
        className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-neutral-900 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white dark:hover:bg-white/10"
      >
        {logoutPending ? "ログアウト中..." : "ログアウト"}
      </button>
    </div>
  );
}