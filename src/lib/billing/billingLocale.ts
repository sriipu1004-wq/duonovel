import {
  DEFAULT_UI_LOCALE,
  isUiLocale,
  type UiLocale,
} from "@/i18n/config";
import { localizePath } from "@/i18n/navigation";

export function parseBillingUiLocale(value: unknown): UiLocale {
  return typeof value === "string" && isUiLocale(value)
    ? value
    : DEFAULT_UI_LOCALE;
}

export function localizeBillingPath(
  path: "/subscription" | "/credits" | "/terms" | "/commercial-transactions",
  locale: UiLocale
): string {
  return localizePath(path, locale);
}

export function subscriptionCheckoutSubmitMessage(
  locale: UiLocale,
  priceJpy: number
): string {
  if (locale === "en") {
    return `This is an automatically renewing subscription for ¥${priceJpy.toLocaleString("en-US")}/month (tax included). After cancellation, Premium remains available until the end of the current billing period.`;
  }
  if (locale === "ko") {
    return `월 ¥${priceJpy.toLocaleString("ko-KR")}(JPY, 세금 포함)의 자동 갱신 구독입니다. 해지 후에도 현재 결제 기간 종료일까지 Premium을 이용할 수 있습니다.`;
  }
  return `月額${priceJpy.toLocaleString("ja-JP")}円（税込）の自動更新です。解約後も当月の利用期限まで使えます。`;
}

export function creditCheckoutSubmitMessage(args: {
  locale: UiLocale;
  credits: number;
  expiresInDays: number;
}): string {
  if (args.locale === "en") {
    return `This is a one-time purchase of ${args.credits} credits. Credits expire ${args.expiresInDays} days after purchase.`;
  }
  if (args.locale === "ko") {
    return `${args.credits}크레딧을 일회성으로 구매합니다. 유효기간은 구매일로부터 ${args.expiresInDays}일입니다.`;
  }
  return `${args.credits}クレジットの買い切りです。有効期限は購入日から${args.expiresInDays}日です。`;
}

type BillingMessageKey =
  | "termsAcceptanceRequired"
  | "billingNotReady"
  | "authenticationRequired"
  | "subscriptionAlreadyExists"
  | "liveChargesUnavailable"
  | "checkoutFailed"
  | "billingCustomerNotFound"
  | "portalFailed";

const BILLING_MESSAGES: Record<UiLocale, Record<BillingMessageKey, string>> = {
  ja: {
    termsAcceptanceRequired: "料金・自動更新・解約条件を確認してから進んでください。",
    billingNotReady: "決済設定または特定商取引法に基づく表記が未完了のため、現在は契約できません。",
    authenticationRequired: "サブスクの契約にはログインが必要です。",
    subscriptionAlreadyExists: "処理中または利用中の契約があります。契約管理から状態を確認してください。",
    liveChargesUnavailable: "現在はStripeの本番決済有効化手続き中です。完了後に申し込みを再開します。",
    checkoutFailed: "決済画面を開けませんでした。時間を置いて再度お試しください。",
    billingCustomerNotFound: "管理対象の契約がありません。",
    portalFailed: "契約管理画面を開けませんでした。",
  },
  en: {
    termsAcceptanceRequired: "Review the price, automatic renewal, and cancellation terms before continuing.",
    billingNotReady: "Paid subscriptions are not available until the billing and required seller information are ready.",
    authenticationRequired: "Sign in before starting a subscription.",
    subscriptionAlreadyExists: "A subscription is already active or being processed. Check Manage billing for its status.",
    liveChargesUnavailable: "Live Stripe charges are still being enabled. Subscription checkout will reopen when that process is complete.",
    checkoutFailed: "The checkout page could not be opened. Try again later.",
    billingCustomerNotFound: "There is no subscription to manage.",
    portalFailed: "The billing management page could not be opened.",
  },
  ko: {
    termsAcceptanceRequired: "요금, 자동 갱신 및 해지 조건을 확인한 후 진행해 주세요.",
    billingNotReady: "결제 설정 또는 필수 판매자 정보가 준비되지 않아 현재는 구독할 수 없습니다.",
    authenticationRequired: "구독을 시작하려면 로그인해야 합니다.",
    subscriptionAlreadyExists: "처리 중이거나 이용 중인 구독이 있습니다. 결제 관리에서 상태를 확인해 주세요.",
    liveChargesUnavailable: "현재 Stripe 실결제 활성화 절차가 진행 중입니다. 완료되면 구독 결제를 다시 열겠습니다.",
    checkoutFailed: "결제 화면을 열 수 없습니다. 잠시 후 다시 시도해 주세요.",
    billingCustomerNotFound: "관리할 구독이 없습니다.",
    portalFailed: "결제 관리 화면을 열 수 없습니다.",
  },
};

export function billingMessage(
  locale: UiLocale,
  key: BillingMessageKey
): string {
  return BILLING_MESSAGES[locale][key];
}
