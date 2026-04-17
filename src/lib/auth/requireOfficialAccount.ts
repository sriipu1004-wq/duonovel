import { redirect } from "next/navigation";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";

export async function requireOfficialAccount(nextPath: string) {
  const result = await requireLoggedInUser(nextPath);

  if (!isOfficialAccountEmail(result.user.email)) {
    redirect("/preparing");
  }

  return result;
}