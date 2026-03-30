import { redirect } from "next/navigation";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";

export default async function ManageTopPage() {
  await requireLoggedInUser("/manage");
  redirect("/write");
}