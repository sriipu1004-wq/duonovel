import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー | LIB read",
  description: "LIB read のプライバシーポリシー",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-[24px] border border-black/10 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-black">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-neutral-600">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">LIB read</p>
        <h1 className="text-3xl font-bold text-white">プライバシーポリシー</h1>
        <p className="text-sm leading-7 text-neutral-300">
          LIB read は、利用者の個人情報および利用情報を以下の方針に基づいて取り扱います。
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="text-neutral-300 underline underline-offset-4" href="/">
            トップへ戻る
          </Link>
          <Link className="text-neutral-300 underline underline-offset-4" href="/terms">
            利用規約
          </Link>
          <Link className="text-neutral-300 underline underline-offset-4" href="/contact">
            お問い合わせ
          </Link>
        </div>
      </header>

      <Section title="1. 取得する情報">
        <p>本サービスでは、以下の情報を取得することがあります。</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>アカウント登録情報</li>
          <li>投稿作品、プロフィール、朗読音声、説明文等の利用者入力情報</li>
          <li>アクセス日時、IPアドレス、ブラウザ情報、端末情報、操作ログ等の利用情報</li>
          <li>問い合わせ時に利用者が提供する情報</li>
        </ul>
      </Section>

      <Section title="2. 利用目的">
        <p>取得した情報は、以下の目的で利用します。</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>本サービスの提供、維持、改善</li>
          <li>アカウント認証、本人確認、不正利用防止</li>
          <li>投稿作品、朗読機能、検索機能等の運用</li>
          <li>問い合わせ対応、権利侵害申告、削除依頼対応</li>
          <li>利用状況の分析、障害対応、品質改善</li>
          <li>規約違反行為への対応</li>
        </ul>
      </Section>

      <Section title="3. 第三者提供">
        <p>
          法令に基づく場合を除き、利用者の個人情報を本人の同意なく第三者へ提供しません。
          ただし、サービス運営上必要な範囲で、委託先、インフラ提供事業者、
          認証基盤、ストレージ、分析基盤等に情報を取り扱わせることがあります。
        </p>
      </Section>

      <Section title="4. 外部サービス等">
        <p>
          本サービスでは、認証、配信、保存、解析、障害監視その他の目的で外部サービスを利用する場合があります。
          その場合、各外部サービス提供者の定める規約やポリシーに基づいてデータが処理されることがあります。
        </p>
      </Section>

      <Section title="5. 安全管理">
        <p>
          運営者は、取得した情報への不正アクセス、漏えい、改ざん、滅失、毀損等を防止するため、
          合理的な範囲で必要な安全管理措置を講じます。
        </p>
      </Section>

      <Section title="6. 保存期間">
        <p>
          利用者情報は、利用目的の達成に必要な期間または法令上必要な期間保存することがあります。
          アカウント停止後や削除後も、障害対応、不正防止、紛争対応のため一定期間保持する場合があります。
        </p>
      </Section>

      <Section title="7. 開示・訂正・削除等">
        <p>
          利用者は、法令の定めに従い、自身の個人情報について開示、訂正、削除、
          利用停止等を求めることができます。希望する場合は、
          <Link className="underline underline-offset-4" href="/contact">
            お問い合わせページ
          </Link>
          から連絡してください。
        </p>
      </Section>

      <Section title="8. 権利侵害等への対応">
        <p>
          投稿作品、朗読音声、画像その他のコンテンツについて権利侵害の申告があった場合、
          運営者は内容確認のうえ、公開停止や削除等の対応を行うことがあります。
        </p>
      </Section>

      <Section title="9. ポリシーの改定">
        <p>
          本ポリシーは、必要に応じて改定されます。改定後の内容は、
          本サービス上に掲示した時点または別途定めた時点から適用されます。
        </p>
      </Section>

      <Section title="10. お問い合わせ">
        <p>
          個人情報の取り扱いに関する問い合わせは、
          <Link className="underline underline-offset-4" href="/contact">
            お問い合わせページ
          </Link>
          から連絡してください。
        </p>
      </Section>
      <Section title="11. 広告配信・Cookie 等について">
        <p>
          本サービスでは今後、第三者配信事業者による広告を掲載する場合があります。
          その際、広告配信、表示回数の計測、不正防止、配信最適化のために、Cookie、
          端末識別子、IPアドレスその他の識別情報が利用されることがあります。
        </p>
        <p>
          広告掲載を開始する場合は、適用法令および利用する広告配信事業者のポリシーに応じて、
          必要な告知、同意取得、設定導線、オプトアウト案内等を行います。
        </p>
      </Section> 
      </div>
    </main>
  );
}