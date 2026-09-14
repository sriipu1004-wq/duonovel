"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { localizePath } from "@/i18n/navigation";

export type ReaderTranslationEntitlement = {
  enabled: true;
  status:
    | "unlocked"
    | "included_available"
    | "credit_required"
    | "purchase_required"
    | "login_required";
  isSubscriber: boolean;
  dailyUsed: number;
  dailyLimit: number;
  creditBalance: number;
  resetAt: string;
};

type Props = {
  entitlement: ReaderTranslationEntitlement;
  busy: boolean;
  requiresGeneration: boolean;
  onConfirmIncluded: () => Promise<void> | void;
  onConfirmCredit: () => Promise<void> | void;
};

type ConfirmKind = "included" | "credit" | null;

const COPY = {
  ja: {
    login: "翻訳の解放にはログインが必要です。",
    loginAction: "ログイン",
    included: "本日の利用枠を1回使って、この話を解放できます。",
    includedGenerate: "翻訳はまだ準備されていません。解放するとAI翻訳を生成します。",
    includedReady: "翻訳はすでに準備済みです。解放時に新しいAI生成は行いません。",
    includedUsage: (used: number, limit: number) => `本日の利用: ${used}/${limit}`,
    includedUnlock: "本日の利用枠で解放",
    includedConfirmTitle: "この話を解放しますか？",
    includedConfirmBody: "本日の利用枠を1回使います。解放後は、この話の同じ翻訳言語を何度読み直しても追加消費されません。",
    includedGenerateConfirm: "翻訳が未生成のため、続行するとAI翻訳を生成します。",
    includedConfirm: "解放する",
    exhausted: "本日の無料利用回数を使い切りました。",
    creditOffer: "この話は1クレジットで解放できます。",
    unlock: "この話を1クレジットで解放",
    balance: (value: number) => `クレジット: ${value}`,
    buy: "クレジットを購入",
    premium: "Premiumを確認",
    confirmTitle: "1クレジットで解放しますか？",
    confirmBody: "解放後は、この話の同じ翻訳言語を何度読み直しても追加消費されません。",
    cancel: "キャンセル",
    confirm: "1クレジットで解放",
    processing: "処理中…",
  },
  en: {
    login: "Sign in to unlock translations for your account.",
    loginAction: "Sign in",
    included: "Use one of today's included translations to unlock this episode.",
    includedGenerate: "This translation is not ready yet. Unlocking will generate it with AI.",
    includedReady: "This translation is already cached. Unlocking will not start a new AI generation.",
    includedUsage: (used: number, limit: number) => `Today's usage: ${used}/${limit}`,
    includedUnlock: "Unlock with today's allowance",
    includedConfirmTitle: "Unlock this episode?",
    includedConfirmBody: "This uses one of today's included translations. After unlocking, you can reread this episode in the same translation language without another charge.",
    includedGenerateConfirm: "The translation is not generated yet, so continuing will start AI translation generation.",
    includedConfirm: "Unlock episode",
    exhausted: "You've used today's included translations.",
    creditOffer: "Unlock this episode for 1 credit.",
    unlock: "Unlock this episode for 1 credit",
    balance: (value: number) => `Credits: ${value}`,
    buy: "Buy credits",
    premium: "View Premium",
    confirmTitle: "Unlock for 1 credit?",
    confirmBody: "After unlocking, you can reread this episode in the same translation language without another charge.",
    cancel: "Cancel",
    confirm: "Unlock for 1 credit",
    processing: "Processing…",
  },
  ko: {
    login: "번역 잠금 해제에는 로그인이 필요합니다.",
    loginAction: "로그인",
    included: "오늘 포함된 번역 이용 횟수 1회를 사용해 이 화를 잠금 해제할 수 있습니다.",
    includedGenerate: "번역이 아직 준비되지 않았습니다. 잠금 해제하면 AI 번역을 생성합니다.",
    includedReady: "번역이 이미 준비되어 있습니다. 잠금 해제 시 새 AI 생성은 실행되지 않습니다.",
    includedUsage: (used: number, limit: number) => `오늘 이용: ${used}/${limit}`,
    includedUnlock: "오늘 이용 횟수로 잠금 해제",
    includedConfirmTitle: "이 화를 잠금 해제할까요?",
    includedConfirmBody: "오늘 포함된 번역 이용 횟수 1회를 사용합니다. 잠금 해제 후에는 같은 번역 언어로 이 화를 다시 읽어도 추가 소모가 없습니다.",
    includedGenerateConfirm: "번역이 아직 생성되지 않아 계속하면 AI 번역 생성을 시작합니다.",
    includedConfirm: "잠금 해제",
    exhausted: "오늘 포함된 번역 이용 횟수를 모두 사용했습니다.",
    creditOffer: "이 화를 1크레딧으로 잠금 해제할 수 있습니다.",
    unlock: "1크레딧으로 이 화 잠금 해제",
    balance: (value: number) => `크레딧: ${value}`,
    buy: "크레딧 구매",
    premium: "Premium 보기",
    confirmTitle: "1크레딧으로 잠금 해제할까요?",
    confirmBody: "잠금 해제 후에는 같은 번역 언어로 이 화를 다시 읽어도 추가 크레딧이 소모되지 않습니다.",
    cancel: "취소",
    confirm: "1크레딧으로 잠금 해제",
    processing: "처리 중…",
  },
} as const;

export default function PublicTranslationUnlockGate({
  entitlement,
  busy,
  requiresGeneration,
  onConfirmIncluded,
  onConfirmCredit,
}: Props) {
  const locale = useUiLocale();
  const copy = COPY[locale];
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const loginHref = useMemo(() => {
    const current =
      typeof window === "undefined"
        ? "/"
        : `${window.location.pathname}${window.location.search}`;
    return localizePath(`/login?next=${encodeURIComponent(current)}`, locale);
  }, [locale]);
  const creditStoreHref = localizePath("/credits", locale);
  const premiumHref = localizePath("/subscription", locale);

  if (entitlement.status === "unlocked") return null;

  const confirmingIncluded = confirmKind === "included";

  return (
    <div className="mt-5 rounded-2xl border border-black/10 bg-white p-4 text-left">
      {entitlement.status === "login_required" ? (
        <>
          <p className="text-sm leading-6 text-neutral-700">{copy.login}</p>
          <Link
            href={loginHref}
            className="mt-3 inline-flex rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
          >
            {copy.loginAction}
          </Link>
        </>
      ) : entitlement.status === "included_available" ? (
        <>
          <p className="text-sm font-medium text-neutral-800">{copy.included}</p>
          <p className="mt-1 text-sm leading-6 text-neutral-600">
            {requiresGeneration ? copy.includedGenerate : copy.includedReady}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            {copy.includedUsage(entitlement.dailyUsed, entitlement.dailyLimit)}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmKind("included")}
            className="mt-4 rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? copy.processing : copy.includedUnlock}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-neutral-800">{copy.exhausted}</p>
          <p className="mt-1 text-sm leading-6 text-neutral-600">
            {entitlement.status === "credit_required" ? copy.creditOffer : copy.balance(entitlement.creditBalance)}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            {copy.balance(entitlement.creditBalance)}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {entitlement.status === "credit_required" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmKind("credit")}
                className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? copy.processing : copy.unlock}
              </button>
            ) : (
              <Link
                href={creditStoreHref}
                className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
              >
                {copy.buy}
              </Link>
            )}
            <Link
              href={premiumHref}
              className="rounded-full border border-black/10 px-4 py-2 text-sm text-neutral-700"
            >
              {copy.premium}
            </Link>
          </div>
        </>
      )}

      {confirmKind ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-black">
              {confirmingIncluded ? copy.includedConfirmTitle : copy.confirmTitle}
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {confirmingIncluded ? copy.includedConfirmBody : copy.confirmBody}
            </p>
            {confirmingIncluded && requiresGeneration ? (
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                {copy.includedGenerateConfirm}
              </p>
            ) : null}
            <p className="mt-3 text-sm font-medium text-black">
              {confirmingIncluded
                ? copy.includedUsage(entitlement.dailyUsed, entitlement.dailyLimit)
                : copy.balance(entitlement.creditBalance)}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmKind(null)}
                className="rounded-full border border-black/10 px-4 py-2 text-sm"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const action = confirmingIncluded ? onConfirmIncluded : onConfirmCredit;
                  void Promise.resolve(action()).finally(() => setConfirmKind(null));
                }}
                className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy
                  ? copy.processing
                  : confirmingIncluded
                    ? copy.includedConfirm
                    : copy.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
