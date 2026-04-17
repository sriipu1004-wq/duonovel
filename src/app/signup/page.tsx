import { redirect } from "next/navigation";
import { normalizeNextPath } from "@/lib/auth/accountSignupConsent";

type PageProps = {
  searchParams?: Promise<{
    next?: string;
    email?: string;
  }>;
};

export default async function SignupPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const nextPath = normalizeNextPath(resolvedSearchParams?.next, "/mypage");
  const query = new URLSearchParams();

  query.set("next", nextPath);

  if (
    typeof resolvedSearchParams?.email === "string" &&
    resolvedSearchParams.email.trim().length > 0
  ) {
    query.set("email", resolvedSearchParams.email.trim());
  }

  redirect(`/register?${query.toString()}`);
}