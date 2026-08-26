import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import LibraryImportForm from "@/features/library/LibraryImportForm";

export default async function LibraryImportPage() {
  await requireLoggedInUser("/library/import");
  return <LibraryImportForm />;
}
