export default function WorkLoading() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-5 sm:p-6">
          <div className="h-3 w-28 rounded-full bg-neutral-200" />
          <div className="mt-5 h-9 w-4/5 max-w-2xl rounded-full bg-neutral-200" />
          <div className="mt-4 h-4 w-full max-w-3xl rounded-full bg-neutral-200" />
          <div className="mt-2 h-4 w-2/3 max-w-2xl rounded-full bg-neutral-200" />

          <div className="mt-6 flex flex-wrap gap-2">
            <div className="h-10 w-28 rounded-full bg-neutral-200" />
            <div className="h-10 w-28 rounded-full bg-neutral-200" />
            <div className="h-10 w-28 rounded-full bg-neutral-200" />
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          <div className="h-20 rounded-3xl border border-black/10 bg-neutral-50" />
          <div className="h-20 rounded-3xl border border-black/10 bg-neutral-50" />
          <div className="h-20 rounded-3xl border border-black/10 bg-neutral-50" />
        </div>
      </div>
    </main>
  );
}