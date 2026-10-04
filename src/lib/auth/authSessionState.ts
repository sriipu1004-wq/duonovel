import { AuthSessionMissingError } from "@supabase/supabase-js";

export function isAuthSessionMissingError(error: unknown): boolean {
  if (error instanceof AuthSessionMissingError) return true;
  return (
    error instanceof Error &&
    (error.name === "AuthSessionMissingError" ||
      error.message.toLowerCase().includes("auth session missing"))
  );
}
