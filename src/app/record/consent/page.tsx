import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RecordingLegalFooter } from "@/components/recording/RecordingLegalFooter";
import {
  normalizeRecordingConsentNextPath,
  RECORDING_GLOBAL_CONSENT_KEY,
  RECORDING_GLOBAL_CONSENT_VERSION,
  RECORDING_TERMS_HREF,
} from "@/lib/recording/recordingConsent";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "朗読投稿前の確認 | LIB read",
  description: "LIB read の朗読投稿前確認",
};

type PageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildLoginRedirectPath(nextPath: string): string {
  const currentPath = `/record/consent?next=${encodeURIComponent(nextPath)}`;
  return `/login?next=${encodeURIComponent(currentPath)}`;
}

async function acceptRecordingGlobalConsent(formData: FormData) {
  "use server";

  const nextPath = normalizeRecordingConsentNextPath(
    formData.get("next"),
    "/record"
  );

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(buildLoginRedirectPath(nextPath));
  }

  const { error } = await supabase.from("user_recording_consents").upsert(
    {
      user_id: user.id,
      consent_key: RECORDING_GLOBAL_CONSENT_KEY,
      consent_version: RECORDING_GLOBAL_CONSENT_VERSION,
      consented_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id,consent_key",
    }
  );

  if (error) {
    throw new Error(`recording consent upsert failed: ${error.message}`);
  }

  redirect(nextPath);
}

export default async function RecordConsentPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextPath = normalizeRecordingConsentNextPath(
    resolvedSearchParams?.next,
    "/record"
  );

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(buildLoginRedirectPath(nextPath));
  }

  const { data: consentRow, error: consentError } = await supabase
    .from("user_recording_consents")
    .select("consent_version")
    .eq("user_id", user.id)
    .eq("consent_key", RECORDING_GLOBAL_CONSENT_KEY)
    .maybeSingle();

  if (consentError) {
    throw new Error(`recording consent lookup failed: ${consentError.message}`);
  }

  if (readText(consentRow?.consent_version) === RECORDING_GLOBAL_CONSENT_VERSION) {
    redirect(nextPath);
  }

  return (
    <main className="min-h-screen bg-[#f4f4f4] text-black">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-[11px] tracking-[0.24em] text-neutral-500">
            RECORDING CONSENT
          </p>
          <h1 className="mt-3 text-2xl font-bold text-black sm:text-3xl">
            朗読投稿前の確認
          </h1>
          <p className="mt-4 text-sm leading-8 text-neutral-700">
            この確認はアカウントごとに最初の一回だけ表示する。
            内容が更新された時だけ、もう一度確認をお願いすることがある。
          </p>

          <div className="mt-5 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
            <p className="text-sm font-semibold text-black">確認内容</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-8 text-neutral-700">
              <li>
                投稿する音声について、自分が必要な権利や利用条件を確認したうえで投稿すること
              </li>
              <li>
                他人が録音した音声の無断投稿、なりすまし、権利侵害、個人情報や機密情報の混入をしないこと
              </li>
              <li>
                音声、朗読者表示名、プロフィール情報、朗読コメント等が公開されうること
              </li>
              <li>
                運営が配信用・再生用・本文追尾用に音声を保存、変換、配信すること
              </li>
              <li>
                違反時に非公開化、削除、利用停止等の対応が行われうること
              </li>
            </ul>

            <p className="mt-4 text-sm leading-8 text-neutral-700">
              詳細は{" "}
              <Link
                href={RECORDING_TERMS_HREF}
                className="underline underline-offset-4"
              >
                朗読投稿規約
              </Link>{" "}
              を確認してから進む。
            </p>
          </div>

          <form action={acceptRecordingGlobalConsent} className="mt-6">
            <input type="hidden" name="next" value={nextPath} />

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-black transition hover:bg-sky-100"
              >
                同意して朗読制作へ進む
              </button>

              <Link
                href="/record"
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                戻る
              </Link>
            </div>
          </form>
        </section>

        <div className="mt-6">
          <RecordingLegalFooter />
        </div>
      </div>
    </main>
  );
}