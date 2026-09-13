import "server-only";

import {
  hasCompleteLegalSellerDetails,
  isStripeConfigured,
} from "@/lib/billing/billingConfig";
import { isPublicTranslationCreditsEnabled } from "@/lib/translation/publicTranslationCredits.server";

export type CreditPack = {
  id: string;
  credits: number;
  stripePriceId: string;
  displayPriceJpy: number;
  currency: "JPY";
  expiresInDays: number;
};

function readBooleanEnv(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  return fallback;
}

function parsePack(value: unknown): CreditPack | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const stripePriceId =
    typeof row.stripePriceId === "string" ? row.stripePriceId.trim() : "";
  const credits = Number(row.credits);
  const displayPriceJpy = Number(row.displayPriceJpy);
  const expiresInDays = Number(row.expiresInDays);
  const currency = String(row.currency ?? "JPY").toUpperCase();

  if (
    !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(id) ||
    !stripePriceId.startsWith("price_") ||
    !Number.isInteger(credits) ||
    credits <= 0 ||
    !Number.isInteger(displayPriceJpy) ||
    displayPriceJpy <= 0 ||
    !Number.isInteger(expiresInDays) ||
    expiresInDays <= 0 ||
    currency !== "JPY"
  ) {
    return null;
  }

  return {
    id,
    stripePriceId,
    credits,
    displayPriceJpy,
    expiresInDays,
    currency: "JPY",
  };
}

export function getCreditPackCatalog(): CreditPack[] {
  const raw = process.env.LIBREAD_CREDIT_PACK_CATALOG_JSON?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("LIBREAD_CREDIT_PACK_CATALOG_JSON is invalid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("LIBREAD_CREDIT_PACK_CATALOG_JSON must be an array");
  }
  const packs = parsed.map(parsePack);
  if (packs.some((pack) => pack === null)) {
    throw new Error("LIBREAD_CREDIT_PACK_CATALOG_JSON contains an invalid pack");
  }
  const valid = packs as CreditPack[];
  const ids = new Set(valid.map((pack) => pack.id));
  const prices = new Set(valid.map((pack) => pack.stripePriceId));
  if (ids.size !== valid.length || prices.size !== valid.length) {
    throw new Error("Credit pack IDs and Stripe price IDs must be unique");
  }
  return valid;
}

export function getCreditPack(packId: string): CreditPack | null {
  return getCreditPackCatalog().find((pack) => pack.id === packId) ?? null;
}

export function getCreditPackByStripePriceId(priceId: string): CreditPack | null {
  return getCreditPackCatalog().find((pack) => pack.stripePriceId === priceId) ?? null;
}

export function isCreditPurchaseEnabled(): boolean {
  return (
    isPublicTranslationCreditsEnabled() &&
    readBooleanEnv("LIBREAD_CREDIT_PURCHASE_ENABLED", false) &&
    Boolean(process.env.LIBREAD_CREDIT_TERMS_VERSION?.trim()) &&
    isStripeConfigured() &&
    hasCompleteLegalSellerDetails() &&
    getCreditPackCatalog().length > 0
  );
}

export function getCreditTermsVersion(): string {
  const value = process.env.LIBREAD_CREDIT_TERMS_VERSION?.trim();
  if (!value) throw new Error("LIBREAD_CREDIT_TERMS_VERSION is missing");
  return value;
}
