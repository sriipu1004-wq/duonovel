import { redirect } from "next/navigation";
import { requireOfficialAccount } from "@/lib/auth/requireOfficialAccount";

export default async function ManageTopPage() {
  await requireOfficialAccount("/manage");
  redirect("/write");
}