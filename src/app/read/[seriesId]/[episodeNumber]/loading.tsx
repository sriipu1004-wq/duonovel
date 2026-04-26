export default function ReadLoading() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-5 sm:p-6">
          <div className="h-3 w-24 rounded-full bg-neutral-200" />
          <div className="mt-5 h-8 w-3/4 max-w-xl rounded-full bg-neutral-200" />
          <div className="mt-3 h-4 w-48 rounded-full bg-neutral-200" />
        </div>

        <div className="mt-8 space-y-4">
          <div className="h-4 w-full rounded-full bg-neutral-200" />
          <div className="h-4 w-11/12 rounded-full bg-neutral-200" />
          <div className="h-4 w-10/12 rounded-full bg-neutral-200" />
          <div className="h-4 w-full rounded-full bg-neutral-200" />
          <div className="h-4 w-8/12 rounded-full bg-neutral-200" />
        </div>

        <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-neutral-200" />
            <div className="h-3 flex-1 rounded-full bg-neutral-200" />
            <div className="h-10 w-10 rounded-full bg-neutral-200" />
          </div>
        </div>
      </div>
    </main>
  );
}