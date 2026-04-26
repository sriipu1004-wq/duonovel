export default function SearchLoading() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-5 sm:p-6">
          <div className="h-3 w-28 rounded-full bg-neutral-200" />
          <div className="mt-5 h-8 w-60 rounded-full bg-neutral-200" />
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="h-12 rounded-2xl bg-white" />
            <div className="h-12 w-32 rounded-2xl bg-neutral-200" />
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="h-36 rounded-3xl border border-black/10 bg-neutral-50" />
          <div className="h-36 rounded-3xl border border-black/10 bg-neutral-50" />
          <div className="h-36 rounded-3xl border border-black/10 bg-neutral-50" />
          <div className="h-36 rounded-3xl border border-black/10 bg-neutral-50" />
        </div>
      </div>
    </main>
  );
}