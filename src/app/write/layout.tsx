import type { ReactNode } from "react";
import PendingContentRatingBridge from "@/features/write/PendingContentRatingBridge";
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
      <PendingContentRatingBridge />
      {children}
    </>
  );
}
