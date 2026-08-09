import type { ReactNode } from "react";
import PendingTranslationPermissionBridge from "@/features/write/PendingTranslationPermissionBridge";
import { requireOfficialAccount } from "@/lib/auth/requireOfficialAccount";

export default async function WriteLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireOfficialAccount("/write");

  return (
    <>
      <PendingTranslationPermissionBridge />
      {children}
    </>
  );
}
