import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

export default async function LegacyManageSeriesRedirectPage({
  params,
}: PageProps) {
  const { seriesId } = await params;
  redirect(`/write/series/${seriesId}`);
}
