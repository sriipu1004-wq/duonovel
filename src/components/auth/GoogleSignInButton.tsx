"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  buildGoogleOAuthRedirectTo,
  isGoogleSignInEnabled,
} from "@/lib/auth/googleSignInFlag";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { authDictionaries } from "@/i18n/dictionaries/auth";

// Issue #142 PR2. Follows Google's sign-in branding guidelines
// (developers.google.com/identity/branding-guidelines, checked 2026-11-15):
// light theme (#FFFFFF fill, 1px #747775 stroke, #1F1F1F text), the standard
// multicolor "G" unmodified, 12px before the logo / 10px after it / 12px after
// the text, and localized "Continue with Google" text. The logo is an inline
// SVG; nothing is loaded from an external host.

function GoogleGLogo() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function resolveRedirectOrigin(): string {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
}

export default function GoogleSignInButton({
  nextPath,
  disabled = false,
}: {
  /** Already normalized with normalizeNextPath by the page. */
  nextPath: string;
  disabled?: boolean;
}) {
  const locale = useUiLocale();
  const dictionary = authDictionaries[locale];
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isGoogleSignInEnabled()) return null;

  async function handleClick() {
    setPending(true);
    setErrorMessage("");
    const origin = resolveRedirectOrigin();
    if (!origin) {
      setErrorMessage(dictionary.googleRedirectFailed);
      setPending(false);
      return;
    }

    // Browser client (PKCE); default scopes (openid, email, profile).
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: buildGoogleOAuthRedirectTo(origin, nextPath) },
    });

    if (error) {
      setErrorMessage(dictionary.googleRedirectFailed);
      setPending(false);
    }
    // On success the browser navigates to Google; keep the button disabled.
  }

  return (
    <div data-testid="google-sign-in">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled || pending}
        className="inline-flex h-10 items-center rounded-full border border-[#747775] bg-white pl-3 pr-3 text-sm font-medium text-[#1F1F1F] transition hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="mr-2.5 inline-flex">
          <GoogleGLogo />
        </span>
        <span>{dictionary.continueWithGoogle}</span>
      </button>
      {errorMessage ? (
        <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
      ) : null}
    </div>
  );
}
