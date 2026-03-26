import Link from "next/link";
import {
  buildRecordingRequestPath,
  buildWorkPath,
  requireRecordingEntryAccess,
  type RecordingPermissionMode,
} from "@/lib/recording/recordingEntry";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

function getPermissionLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "無条件許可";
  if (mode === "approval_required") return "承認制";
  return "非許可";
}

function getPermissionDescription(mode: RecordingPermissionMode): string {
  if (mode === "open") {
    return "ログイン済みなら、そのまま朗読制作へ入れる。";
  }

  if (mode === "approval_required") {
    return "承認済みユーザーだけが、朗読制作へ入れる。";
  }

  return "このページには入れない設定。作品ページへ戻す。";
}

function getPermissionClass(mode: RecordingPermissionMode): string {
  if (mode === "open") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (mode === "approval_required") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }

  return "border-white/10 bg-white/5 text-neutral-300";
}

function InfoCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      <p className="mt-3 text-sm leading-7 text-neutral-400">{sub}</p>
    </div>
  );
}

export default async function RecordCreateSeriesPage({ params }: PageProps) {
  const { seriesId } = await params;
  const { seriesTitle, permissionMode, hasApprovedRequest } =
    await requireRecordingEntryAccess(seriesId);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href={buildWorkPath(seriesId)} className="hover:text-neutral-300">
            作品ページ
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-300">朗読制作入口</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ RECORD ENTRY
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              {seriesTitle}
            </h1>

            <p className="mt-4 text-sm leading-7 text-neutral-300 sm:text-base">
              ここは朗読制作ページへの入場判定を通過した人だけが入れる最小入口。
              録音UI本体やアップロード本体は今回の範囲外で、まずは通行条件だけを固定している。
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="text-sm text-neutral-500">現在の朗読可否</span>
              <span
                className={[
                  "rounded-full border px-3 py-1 text-sm",
                  getPermissionClass(permissionMode),
                ].join(" ")}
              >
                {getPermissionLabel(permissionMode)}
              </span>
            </div>

            <p className="mt-3 text-sm leading-7 text-neutral-400">
              {getPermissionDescription(permissionMode)}
            </p>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="grid gap-4 md:grid-cols-3">
              <InfoCard
                label="ENTRY"
                value="通行可"
                sub="未ログイン、closed、未承認 approval_required はここへ入れない。"
              />
              <InfoCard
                label="RULE"
                value={getPermissionLabel(permissionMode)}
                sub={
                  permissionMode === "approval_required"
                    ? "approved レコードがあるユーザーだけ通す。"
                    : permissionMode === "open"
                      ? "ログイン済みならそのまま通す。"
                      : "この値では route 側で作品ページへ戻す。"
                }
              />
              <InfoCard
                label="UI SCOPE"
                value="最小入口のみ"
                sub="録音UI、音声アップロード、BGM強化はまだここに含めない。"
              />
            </section>

            {permissionMode === "approval_required" ? (
              <section className="rounded-[28px] border border-amber-400/20 bg-amber-400/10 p-5 text-sm leading-7 text-amber-100">
                <p className="text-xs tracking-[0.18em] text-amber-200">
                  APPROVAL STATE
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  承認確認済み
                </h2>
                <p className="mt-3">
                  {hasApprovedRequest
                    ? "このユーザーには approved な申請があるため、朗読制作入口へ通している。"
                    : "この文面は通常表示されない。未承認なら route 側で申請ページへ戻す。"}
                </p>
              </section>
            ) : null}

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                NEXT STEP
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                次に置くもの
              </h2>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                次段では、この入口の内側に録音UI本体を置く。
                ただし今回は route guard と permission 判定だけを確定し、UI本体へは広げない。
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={buildWorkPath(seriesId)}
                  className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                >
                  作品ページへ戻る
                </Link>

                {permissionMode === "approval_required" ? (
                  <Link
                    href={buildRecordingRequestPath(seriesId)}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    朗読申請ページを見る
                  </Link>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
