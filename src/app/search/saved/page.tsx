import Link from "next/link";

type PageProps = {
  searchParams?: Promise<{ order?: string }>;
};

export default async function SavedSearchPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const order = params?.order === "added" ? "added" : "updated";
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-neutral-500"><Link href="/search">作品を探す</Link> / ブックマーク作品</p>
        <h1 className="mt-6 text-2xl font-semibold">ブックマーク作品</h1>
        <p className="mt-3 text-sm text-neutral-600">並び順: {order}</p>
      </div>
    </main>
  );
}
