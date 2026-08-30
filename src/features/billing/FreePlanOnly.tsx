"use client";

import type { ReactNode } from "react";
import { useAiUsage } from "@/features/usage/useAiUsage";

export default function FreePlanOnly({ children }: { children: ReactNode }) {
  const { snapshot } = useAiUsage();

  if (!snapshot || snapshot.isSubscriber) return null;
  return <>{children}</>;
}
