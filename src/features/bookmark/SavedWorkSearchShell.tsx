"use client";

import { useSearchParams } from "next/navigation";
import SavedWorkSearchClient from "./SavedWorkSearchClient";

export default function SavedWorkSearchShell() {
  const searchParams = useSearchParams();
  const order = searchParams.get("order") === "added" ? "added" : "updated";
  return <SavedWorkSearchClient order={order} />;
}
