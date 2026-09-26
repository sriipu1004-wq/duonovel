import type { UiLocale } from "../config";

export type SubscriptionComparison = {
  label: string;
  free: string;
  subscriber: string;
};

const ja = {
  pageTitle: "サブスク",
  metadataDescription: "LIB readの月額680円サブスク。公開作品のAI翻訳解放、個人本棚への取り込み回数と保存上限を拡大します。",
  contractStatus: "契約状態",
  checkoutSuccessActive: "決済を受け付けました。有料機能は利用可能です。",
  paidFeaturesActive: "有料機能は有効です。",
  availableUntil: (date: string) => `${date}まで利用可能（更新停止済み）`,
  nextRenewal: (date: string) => `次回更新日 ${date}`,
  backHome: "トップへ戻る",
  checkoutSuccessPending: "決済を受け付けました。Stripeからの決済完了通知後に有料機能へ切り替わります。反映されない場合は数秒後に再読み込みしてください。",
  checkoutCanceled: "決済はキャンセルされ、請求は発生していません。",
  heroTitle: "読む・訳す量に合わせて、利用枠を広げる。",
  heroDescription: "Premiumでは公開作品のAI翻訳解放は1日30回、個人本棚への取り込みは日次回数制限なし。個人本棚は最大20作品まで使えます。",
  perMonth: "/ 月（税込）",
  currencyNote: "日本円（JPY）での請求です。申込日に課金され、毎月同日に自動更新されます。いつでも解約できます。",
  freePlan: "無料プラン",
  subscriberPlan: "サブスク利用中",
  officialPlan: "運営アカウント・有料機能有効",
  paymentAttention: "支払い・契約状態の確認が必要",
  noStripeNeeded: "Stripe契約は不要です",
  loginToSubscribe: "ログインして申し込む",
  planDifference: "無料版との違い",
  feature: "機能",
  free: "無料",
  paid: "月額680円",
  contractTitle: "契約と解約",
  contractItems: [
    "クレジットカード情報はStripeが処理し、LIB readでは保持しません。",
    "解約すると次回更新が止まり、支払済み期間の終了までは有料機能を利用できます。",
    "アカウント削除時は、継続請求を防ぐためStripe契約を先に停止します。",
  ],
  terms: "利用規約",
  privacy: "プライバシーポリシー",
  commercial: "特定商取引法に基づく表記",
  acceptBilling: "月額680円（税込・JPY）の自動更新と、解約後は現在の利用期限まで利用できることを確認しました。",
  acceptRequired: "料金・自動更新・解約条件を確認してください。",
  openBillingFailed: "決済画面を開けませんでした。",
  openingPortal: "契約管理を開いています…",
  manageBilling: "契約・支払いを管理",
  openingCheckout: "決済画面を開いています…",
  startPaid: "月額680円で始める",
  billingNotReady: "現在は決済情報と法定表示の設定待ちです。設定完了まで請求は発生しません。",
  comparisons: [
    { label: "公開作品のAI翻訳解放", free: "本棚取り込みと共通で1日3回", subscriber: "1日30回まで" },
    { label: "朗読", free: "画面を開いて再生", subscriber: "次話自動再生。バックグラウンド再生はユーザー朗読のみ" },
    { label: "個人本棚・読書進捗", free: "最大3作品", subscriber: "最大20作品" },
    { label: "個人本棚への取り込み", free: "公開AI翻訳と共通で1日3回", subscriber: "日次回数制限なし" },
  ] satisfies SubscriptionComparison[],
} as const;

type Widen<T> = T extends (...args: infer Args) => string
  ? (...args: Args) => string
  : T extends readonly (infer Item)[]
    ? readonly Widen<Item>[]
    : T extends object
      ? { [K in keyof T]: Widen<T[K]> }
      : T extends string
        ? string
        : T;

type SubscriptionDictionary = Widen<typeof ja>;

const en: SubscriptionDictionary = {
  pageTitle: "Subscription",
  metadataDescription: "LIB read Premium is ¥680/month (JPY), with higher public-translation allowances plus larger My Library limits.",
  contractStatus: "Subscription status",
  checkoutSuccessActive: "Payment was accepted. Paid features are available.",
  paidFeaturesActive: "Paid features are active.",
  availableUntil: (date) => `Available until ${date} (renewal canceled)`,
  nextRenewal: (date) => `Next renewal: ${date}`,
  backHome: "Back to home",
  checkoutSuccessPending: "Payment was accepted. Paid features will activate after Stripe confirms the payment. Reload shortly if the status does not update.",
  checkoutCanceled: "Checkout was canceled. You have not been charged.",
  heroTitle: "Expand your limits as you read and translate more.",
  heroDescription: "Premium includes up to 30 public-translation unlocks per day, no daily count limit for My Library imports, and storage for up to 20 library works.",
  perMonth: "/ month (tax included)",
  currencyNote: "Charged in Japanese yen (JPY). Billing starts when you subscribe and renews monthly on the same date. You can cancel at any time.",
  freePlan: "Free plan",
  subscriberPlan: "Subscription active",
  officialPlan: "Official account · paid features active",
  paymentAttention: "Payment or subscription status needs attention",
  noStripeNeeded: "No Stripe subscription required",
  loginToSubscribe: "Log in to subscribe",
  planDifference: "Free vs subscription",
  feature: "Feature",
  free: "Free",
  paid: "¥680/month (JPY)",
  contractTitle: "Billing and cancellation",
  contractItems: [
    "Stripe processes card details; LIB read does not store your card information.",
    "Canceling stops the next renewal. Paid features remain available until the end of the already-paid period.",
    "When deleting an account, the Stripe subscription is stopped first to prevent continued billing.",
  ],
  terms: "Terms (Japanese)",
  privacy: "Privacy Policy (Japanese)",
  commercial: "Commercial disclosures (Japanese)",
  acceptBilling: "I understand that this is an automatically renewing ¥680/month subscription charged in JPY, and that access continues until the current paid period ends after cancellation.",
  acceptRequired: "Confirm the price, automatic renewal, and cancellation terms first.",
  openBillingFailed: "Could not open the billing page.",
  openingPortal: "Opening subscription management…",
  manageBilling: "Manage subscription and payment",
  openingCheckout: "Opening checkout…",
  startPaid: "Start for ¥680/month (JPY)",
  billingNotReady: "Billing setup is not yet complete. You will not be charged until it is enabled.",
  comparisons: [
    { label: "Public AI translation unlocks", free: "3/day shared with library imports", subscriber: "Up to 30/day" },
    { label: "Read-aloud", free: "Play while the page is open", subscriber: "Auto-play next episode; background playback is limited to user narration" },
    { label: "My Library and progress", free: "Up to 3 works", subscriber: "Up to 20 works" },
    { label: "Library imports", free: "3/day shared with public AI translations", subscriber: "No daily count limit" },
  ],
};

const ko: SubscriptionDictionary = {
  pageTitle: "구독",
  metadataDescription: "LIB read Premium은 월 680엔(JPY)이며 공개 작품 AI 번역 잠금 해제, 개인 서재 가져오기와 보관 한도를 확대합니다.",
  contractStatus: "구독 상태",
  checkoutSuccessActive: "결제가 접수되었습니다. 유료 기능을 이용할 수 있습니다.",
  paidFeaturesActive: "유료 기능이 활성화되어 있습니다.",
  availableUntil: (date) => `${date}까지 이용 가능(갱신 중지됨)`,
  nextRenewal: (date) => `다음 갱신일: ${date}`,
  backHome: "홈으로 돌아가기",
  checkoutSuccessPending: "결제가 접수되었습니다. Stripe의 결제 완료 확인 후 유료 기능으로 전환됩니다. 반영되지 않으면 잠시 후 새로고침하세요.",
  checkoutCanceled: "결제가 취소되었습니다. 청구되지 않았습니다.",
  heroTitle: "더 많이 읽고 번역할수록 이용 한도를 넓히세요.",
  heroDescription: "Premium에서는 공개 작품 AI 번역 잠금 해제 하루 30회, 개인 서재 가져오기 일일 횟수 제한 없음, 개인 서재 최대 20작품을 이용할 수 있습니다.",
  perMonth: "/ 월 (세금 포함)",
  currencyNote: "일본 엔(JPY)으로 청구됩니다. 가입일에 결제되고 매월 같은 날짜에 자동 갱신됩니다. 언제든 해지할 수 있습니다.",
  freePlan: "무료 플랜",
  subscriberPlan: "구독 이용 중",
  officialPlan: "운영 계정 · 유료 기능 활성",
  paymentAttention: "결제 또는 구독 상태 확인 필요",
  noStripeNeeded: "Stripe 구독이 필요하지 않습니다",
  loginToSubscribe: "로그인하고 구독하기",
  planDifference: "무료와 구독 비교",
  feature: "기능",
  free: "무료",
  paid: "월 680엔 (JPY)",
  contractTitle: "결제 및 해지",
  contractItems: [
    "카드 정보는 Stripe가 처리하며 LIB read는 카드 정보를 저장하지 않습니다.",
    "해지하면 다음 갱신이 중단되며 이미 결제한 기간이 끝날 때까지 유료 기능을 이용할 수 있습니다.",
    "계정 삭제 시 지속 청구를 막기 위해 Stripe 구독을 먼저 중지합니다.",
  ],
  terms: "이용약관(일본어)",
  privacy: "개인정보 처리방침(일본어)",
  commercial: "특정상거래법 표기(일본어)",
  acceptBilling: "월 680엔(JPY) 자동 갱신 구독이며 해지 후에도 현재 결제 기간이 끝날 때까지 이용할 수 있음을 확인했습니다.",
  acceptRequired: "요금, 자동 갱신, 해지 조건을 먼저 확인하세요.",
  openBillingFailed: "결제 화면을 열지 못했습니다.",
  openingPortal: "구독 관리 화면을 여는 중…",
  manageBilling: "구독·결제 관리",
  openingCheckout: "결제 화면을 여는 중…",
  startPaid: "월 680엔(JPY)으로 시작",
  billingNotReady: "현재 결제 설정이 완료되지 않았습니다. 활성화되기 전에는 청구되지 않습니다.",
  comparisons: [
    { label: "공개 작품 AI 번역 잠금 해제", free: "서재 가져오기와 합산 하루 3회", subscriber: "하루 최대 30회" },
    { label: "읽어주기", free: "화면을 연 상태에서 재생", subscriber: "다음 화 자동 재생. 백그라운드 재생은 사용자 낭독만 지원" },
    { label: "개인 서재·읽기 진행률", free: "최대 3작품", subscriber: "최대 20작품" },
    { label: "개인 서재 가져오기", free: "공개 AI 번역과 합산 하루 3회", subscriber: "일일 횟수 제한 없음" },
  ],
};

export const subscriptionDictionaries: Record<UiLocale, SubscriptionDictionary> = { ja, en, ko };
