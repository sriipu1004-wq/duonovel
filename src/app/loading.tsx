export default function Loading() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-6">
          <div className="h-3 w-32 rounded-full bg-neutral-200" />
          <div className="mt-5 h-8 w-3/4 max-w-xl rounded-full bg-neutral-200" />
          <div className="mt-4 h-4 w-full max-w-2xl rounded-full bg-neutral-200" />
          <div className="mt-2 h-4 w-5/6 max-w-xl rounded-full bg-neutral-200" />

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <div className="h-32 rounded-3xl border border-black/10 bg-white" />
            <div className="h-32 rounded-3xl border border-black/10 bg-white" />
            <div className="h-32 rounded-3xl border border-black/10 bg-white" />
            <div className="h-32 rounded-3xl border border-black/10 bg-white" />
          </div>
        </div>
      </div>
    </main>
  );
}