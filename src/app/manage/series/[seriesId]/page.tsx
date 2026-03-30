import { redirect } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

export default async function ManageSeriesGuidePage({ params }: PageProps) {
  const { seriesId } = await params;

  await requireOwnedSeries(seriesId, `/manage/series/${seriesId}`);

  redirect(`/write/series/${seriesId}`);
}