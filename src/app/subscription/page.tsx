import type { Metadata } from "next";
import Link from "next/link";
import { isSubscriber } from "@/lib/aiUsage/aiUsage.server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "サブスク | LIB read",
  description:
    "LIB readの長編読書向けサブスク機能と、先行利用申込みの案内です。",
  robots: {
    index: false,
    follow: false,
  },
};

const CONTACT_EMAIL = "libread08@gmail.com";

function applicationHref(email: string): string {
  const subject = "LIB read サブスク先行利用申込み";
  const body = [
    "LIB readのサブスク先行利用を希望します。",
    "",
    `登録メールアドレス: ${email}`,
    "",
    "料金と利用開始方法の案内をお願いします。",
  ].join("\n");

  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const comparisons = [
  {
    label: "AI物語生成・対訳生成",
    free: "共通で1日5回",
    subscriber: "利用上限を拡大",
  },
  {
    label: "単語解説",
    free: "1日の上限あり",
    subscriber: "無制限",
  },
  {
    label: "次話の対訳",
    free: "移動後に手動生成",
    subscriber: "読書50%で次の1話を先読み",
  },
  {
    label: "個人本棚・読書進捗",
    free: "利用可能",
    subscriber: "利用可能",
  },
];

export default async function SubscriptionPage() {
  const supabase = await createClient();
  const authResult = await supabase.auth.getUser();
  const user = authResult.data.user ?? null;
  const subscriber = user ? await isSubscriber(user.id) : false;
  const email = user?.email?.trim() ?? "";

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-5 text-sm text-neutral-500">
          <Link href="/" className="hover:text-black">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">サブスク</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-neutral-950 text-white shadow-sm">
          <div className="grid gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[1.4fr_0.8fr] lg:items-center">
            <div>
              <p className="text-xs tracking-[0.22em] text-sky-300">
                LIB READ SUBSCRIPTION
              </p>
              <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
                長編を、次の1話まで止まらず読む。
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-8 text-neutral-300 sm:text-base">
                単語解説を回数を気にせず使い、現在話を読んでいる間に次話の対訳を1話だけ準備します。大量の全話翻訳は行いません。
              </p>
            </div>

            <div className="rounded-[24px] border border-white/15 bg-white/10 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-300">
                CURRENT PLAN
              </p>
              <p className="mt-2 text-xl font-semibold">
                {subscriber ? "サブスク利用中" : "無料プラン"}
              </p>
              <p className="mt-3 text-xs leading-6 text-neutral-300">
                このPreviewでは決済・請求は行いません。料金と決済方法は正式提供前に案内します。
              </p>
              {subscriber ? (
                <Link
                  href="/library"
                  className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-100"
                >
                  個人本棚を開く
                </Link>
              ) : user && email ? (
                <a
                  href={applicationHref(email)}
                  className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-100"
                >
                  先行利用を申し込む
                </a>
              ) : (
                <Link
                  href="/login?next=%2Fsubscription"
                  className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-100"
                >
                  ログインして申し込む
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs tracking-[0.2em] text-neutral-500">PLAN</p>
          <h2 className="mt-2 text-2xl font-semibold">無料版との違い</h2>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-neutral-500">
                  <th className="px-3 py-3 font-medium">機能</th>
                  <th className="px-3 py-3 font-medium">無料</th>
                  <th className="px-3 py-3 font-medium text-black">サブスク</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((item) => (
                  <tr key={item.label} className="border-b border-black/10 last:border-0">
                    <th className="px-3 py-4 font-medium text-black">{item.label}</th>
                    <td className="px-3 py-4 text-neutral-600">{item.free}</td>
                    <td className="px-3 py-4 font-medium text-black">
                      {item.subscriber}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["次話だけ先読み", "読書が50%に達したら、同じ言語で次の1話だけ対訳を準備します。"],
            ["単語解説は無制限", "選んだ文の語をタップして、訳語との対応と品詞を確認できます。"],
            ["作品ごとの読書環境", "本棚、読書位置、対訳cache、作品用語を作品単位で引き継ぎます。"],
          ].map(([title, description]) => (
            <article
              key={title}
              className="rounded-[24px] border border-black/10 bg-neutral-50 p-5"
            >
              <h2 className="font-semibold text-black">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-neutral-600">
                {description}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-[28px] border border-sky-200 bg-sky-50 px-5 py-7 text-center sm:px-8">
          <h2 className="text-xl font-semibold">先行利用について</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-neutral-700">
            現在はPreview確認中です。申込みメールを送っても、その時点で契約や請求は発生しません。正式料金と利用条件を確認後に開始できます。
          </p>
          {!subscriber ? (
            user && email ? (
              <a
                href={applicationHref(email)}
                className="mt-5 inline-flex rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                サブスクの案内を受け取る
              </a>
            ) : (
              <Link
                href="/register"
                className="mt-5 inline-flex rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                無料アカウントを作る
              </Link>
            )
          ) : null}
        </section>
      </div>
    </main>
  );
}
