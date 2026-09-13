export type TranslationCreditPolicyStatus =
  | "unlocked"
  | "included_available"
  | "credit_required"
  | "purchase_required"
  | "login_required";

export function resolveTranslationCreditPolicy(args: {
  authenticated: boolean;
  alreadyUnlocked: boolean;
  dailyUsed: number;
  dailyLimit: number;
  creditBalance: number;
}): TranslationCreditPolicyStatus {
  if (!args.authenticated) return "login_required";
  if (args.alreadyUnlocked) return "unlocked";
  if (args.dailyLimit > args.dailyUsed) return "included_available";
  if (args.creditBalance >= 1) return "credit_required";
  return "purchase_required";
}
