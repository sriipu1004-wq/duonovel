import "server-only";

export const LIBREAD_SUBSCRIPTION_PRICE_JPY = 500;
export const LIBREAD_SUBSCRIBER_MONTHLY_AI_BUDGET_JPY = 300;
export const LIBREAD_BILLING_TERMS_VERSION = "2026-08-29";

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export type LegalSellerDetails = {
  sellerName: string;
  responsiblePerson: string;
  address: string;
  phone: string;
  supportEmail: string;
};

export function getLegalSellerDetails(): LegalSellerDetails {
  return {
    sellerName: readEnv("LIBREAD_LEGAL_SELLER_NAME"),
    responsiblePerson: readEnv("LIBREAD_LEGAL_RESPONSIBLE_PERSON"),
    address: readEnv("LIBREAD_LEGAL_ADDRESS"),
    phone: readEnv("LIBREAD_LEGAL_PHONE"),
    supportEmail: readEnv("LIBREAD_LEGAL_SUPPORT_EMAIL") || "libread08@gmail.com",
  };
}

export function hasCompleteLegalSellerDetails(): boolean {
  const details = getLegalSellerDetails();
  return Boolean(
    details.sellerName &&
      details.responsiblePerson &&
      details.address &&
      details.phone &&
      details.supportEmail
  );
}

export function isStripeConfigured(): boolean {
  return Boolean(
    readEnv("STRIPE_SECRET_KEY") &&
      readEnv("STRIPE_WEBHOOK_SECRET") &&
      readEnv("STRIPE_PRICE_ID")
  );
}

export function isBillingCheckoutEnabled(): boolean {
  const value = readEnv("LIBREAD_BILLING_CHECKOUT_ENABLED").toLowerCase();
  return value !== "false" && value !== "0" && value !== "off";
}

export function isPaidSubscriptionReady(): boolean {
  return (
    isBillingCheckoutEnabled() &&
    isStripeConfigured() &&
    hasCompleteLegalSellerDetails()
  );
}

export function getStripePriceId(): string {
  const value = readEnv("STRIPE_PRICE_ID");
  if (!value) throw new Error("STRIPE_PRICE_ID is missing");
  return value;
}

export function getStripeWebhookSecret(): string {
  const value = readEnv("STRIPE_WEBHOOK_SECRET");
  if (!value) throw new Error("STRIPE_WEBHOOK_SECRET is missing");
  return value;
}

export function getStripeSecretKey(): string {
  const value = readEnv("STRIPE_SECRET_KEY");
  if (!value) throw new Error("STRIPE_SECRET_KEY is missing");
  return value;
}

export function getRequestOrigin(request: Request): string {
  const configured = readEnv("NEXT_PUBLIC_SITE_URL");
  const requestOrigin = new URL(request.url).origin;

  if (process.env.NODE_ENV === "production" && configured) {
    try {
      return new URL(configured).origin;
    } catch {
      throw new Error("NEXT_PUBLIC_SITE_URL is invalid");
    }
  }

  return requestOrigin;
}
