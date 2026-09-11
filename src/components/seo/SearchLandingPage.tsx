import Link from "next/link";

export type SearchLandingConfig = {
  eyebrow: string;
  title: string;
  intro: string;
  directAnswer: string;
  features: Array<{ title: string; body: string }>;
  demo: {
    sourceLabel: string;
    sourceText: string;
    translationLabel: string;
    translationText: string;
    note: string;
  };
  steps: string[];
  differences: Array<{ title: string; body: string }>;
  capabilities: string[];
  faq: Array<{ question: string; answer: string }>;
  primaryCta: { href: string; label: string; note?: string };
  secondaryCta?: { href: string; label: string };
  related: Array<{ href: string; label: string; description: string }>;
};

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-[11px] font-medium tracking-[0.22em] text-neutral-500">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-black sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}

export default function SearchLandingPage({ config }: { config: SearchLandingConfig }) {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <section className="border-b border-black/10 pb-10">
          <div className="max-w-4xl">
            <p className="text-[11px] font-medium tracking-[0.24em] text-neutral-500">
              {config.eyebrow}
            </p>
            <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-black sm:text-4xl lg:text-5xl">
              {config.title}
            </h1>
            <p className="mt-5 text-base leading-8 text-neutral-700 sm:text-lg">
              {config.intro}
            </p>
            <div className="mt-6 rounded-[24px] border border-sky-200 bg-sky-50 px-5 py-5 text-sm leading-7 text-neutral-800 sm:px-6">
              <strong className="font-semibold text-black">直接回答：</strong>{" "}
              {config.directAnswer}
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={config.primaryCta.href}
                className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                {config.primaryCta.label}
              </Link>
              {config.secondaryCta ? (
                <Link
                  href={config.secondaryCta.href}
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50"
                >
                  {config.secondaryCta.label}
                </Link>
              ) : null}
            </div>
            {config.primaryCta.note ? (
              <p className="mt-3 text-xs leading-6 text-neutral-500">
                {config.primaryCta.note}
              </p>
            ) : null}
          </div>
        </section>

        <section className="pt-12">
          <SectionHeading eyebrow="WHAT LIB READ DOES" title="LIB read（ライブリード）でできること" />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {config.features.map((feature) => (
              <article key={feature.title} className="rounded-[24px] border border-black/10 bg-neutral-50 p-5 sm:p-6">
                <h3 className="text-base font-semibold text-black">{feature.title}</h3>
                <p className="mt-2 text-sm leading-7 text-neutral-600">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="pt-12">
          <SectionHeading eyebrow="READER EXAMPLE" title="原文を消さず、対応する訳文を一緒に読む" />
          <div className="mt-6 overflow-hidden rounded-[28px] border border-black/10 bg-neutral-950 shadow-sm">
            <div className="grid md:grid-cols-2">
              <div className="border-b border-white/10 p-6 md:border-b-0 md:border-r">
                <p className="text-[11px] font-medium tracking-[0.2em] text-neutral-400">
                  {config.demo.sourceLabel}
                </p>
                <p className="mt-4 text-lg leading-8 text-white">{config.demo.sourceText}</p>
              </div>
              <div className="p-6">
                <p className="text-[11px] font-medium tracking-[0.2em] text-neutral-400">
                  {config.demo.translationLabel}
                </p>
                <p className="mt-4 text-lg leading-8 text-white">{config.demo.translationText}</p>
              </div>
            </div>
            <p className="border-t border-white/10 px-6 py-4 text-xs leading-6 text-neutral-300">
              {config.demo.note}
            </p>
          </div>
        </section>

        <section className="pt-12">
          <SectionHeading eyebrow="HOW TO USE" title="使い方" />
          <ol className="mt-6 grid gap-3">
            {config.steps.map((step, index) => (
              <li key={step} className="flex gap-4 rounded-[20px] border border-black/10 bg-white p-4 sm:p-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm leading-7 text-neutral-700">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="pt-12">
          <SectionHeading eyebrow="WHY PARALLEL READING" title="一般的な翻訳方法との違い" />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {config.differences.map((difference) => (
              <article key={difference.title} className="rounded-[24px] border border-black/10 bg-white p-5">
                <h3 className="text-base font-semibold text-black">{difference.title}</h3>
                <p className="mt-2 text-sm leading-7 text-neutral-600">{difference.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="pt-12">
          <SectionHeading eyebrow="SUPPORTED" title="対応している読書機能" />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {config.capabilities.map((capability) => (
              <li key={capability} className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700">
                {capability}
              </li>
            ))}
          </ul>
        </section>

        <section className="pt-12">
          <SectionHeading eyebrow="FAQ" title="よくある質問" />
          <div className="mt-6 grid gap-3">
            {config.faq.map((item) => (
              <article key={item.question} className="rounded-[22px] border border-black/10 bg-white p-5">
                <h3 className="font-semibold text-black">Q. {item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-neutral-600">A. {item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="pt-12">
          <SectionHeading eyebrow="RELATED GUIDES" title="関連する読み方" />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {config.related.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-[24px] border border-black/10 bg-neutral-50 p-5 transition hover:border-black/20 hover:bg-white">
                <p className="font-semibold text-black">{item.label}</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="pt-12">
          <div className="rounded-[28px] bg-neutral-950 px-6 py-8 text-white sm:px-8 sm:py-10">
            <h2 className="text-2xl font-bold tracking-tight">長編を、対訳のまま続きから読む。</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-300">
              LIB readは、翻訳結果だけを作るのではなく、原文・対訳・話数・読書位置を同じ読書体験の中で維持するためのサービスです。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={config.primaryCta.href} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-100">
                {config.primaryCta.label}
              </Link>
              <Link href="/guide" className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                使い方を見る
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
