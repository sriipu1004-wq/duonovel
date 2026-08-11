import Link from "next/link";

type Props = {
  signedIn: boolean;
  returnHref: string;
};

export default function R18ContentGate({ signedIn, returnHref }: Props) {
  const settingsHref = signedIn
    ? "/mypage#content-display"
    : `/login?next=${encodeURIComponent(returnHref)}`;

  return (
    <main
      data-content-rating="r18"
      data-ad-eligible="false"
      className="min-h-screen bg-white text-black"
    >
      <div className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-[28px] border border-red-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              R18
            </span>
            <span className="text-xs text-neutral-500">成人向け作品</span>
          </div>

          <h1 className="mt-5 text-2xl font-bold text-black">
            この作品はR18に設定されています
          </h1>
          <p className="mt-4 text-sm leading-8 text-neutral-700">
            R18作品は初期状態では表示されません。18歳以上の場合は、設定の「性的コンテンツを表示する」を有効にすると閲覧できます。
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={settingsHref}
              className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              {signedIn ? "表示設定を開く" : "ログインして設定する"}
            </Link>
            <Link
              href="/"
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-700 transition hover:bg-neutral-50"
            >
              TOPへ戻る
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
