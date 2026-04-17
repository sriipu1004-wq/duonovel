import type { ReactNode } from "react";
import { requireOfficialAccount } from "@/lib/auth/requireOfficialAccount";

export default async function WriteLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireOfficialAccount("/write");

  return <>{children}</>;
}