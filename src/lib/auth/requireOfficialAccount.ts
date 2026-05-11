import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";

export async function requireOfficialAccount(nextPath: string) {
  return requireLoggedInUser(nextPath);
}
