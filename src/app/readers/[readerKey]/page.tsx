import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ readerKey: string }>;
  searchParams?: Promise<{ name?: string; readerName?: string }>;
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function ReaderPage({ params, searchParams }: PageProps) {
  const { readerKey: rawReaderKey } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const readerKey = safeDecode(rawReaderKey);
  const readerName =
    (typeof resolvedSearchParams?.readerName === "string" &&
      resolvedSearchParams.readerName.trim()) ||
    (typeof resolvedSearchParams?.name === "string" &&
      resolvedSearchParams.name.trim()) ||
    "";

  const query = new URLSearchParams();

  if (readerName) {
    query.set("readerName", readerName);
  }

  const queryString = query.toString();

  redirect(
    `/authors/${encodeURIComponent(readerKey)}${
      queryString ? `?${queryString}` : ""
    }`
  );
}