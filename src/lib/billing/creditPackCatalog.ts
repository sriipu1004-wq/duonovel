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

export const LIBREAD_DEFAULT_CREDIT_TERMS_VERSION = "2026-09-14-credit-v1";

const APPROVED_PRODUCTION_CREDIT_PACKS: readonly CreditPack[] = [
  {
    id: "credits_5",
    credits: 5,
    stripePriceId: "price_1UFLrkLuEpSwUk8MmDN2oYv1",
    displayPriceJpy: 300,
    currency: "JPY",
    expiresInDays: 150,
  },
  {
    id: "credits_8",
    credits: 8,
    stripePriceId: "price_1UFLroLuEpSwUk8M3T4fla86",
    displayPriceJpy: 450,
    currency: "JPY",
    expiresInDays: 150,
  },
  {
    id: "credits_12",
    credits: 12,
    stripePriceId: "price_1UFLryLuEpSwUk8MMmg0Ubt1",
    displayPriceJpy: 600,
    currency: "JPY",
    expiresInDays: 150,
  },
] as const;

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

function validateCatalog(packs: CreditPack[]): CreditPack[] {
  const ids = new Set(packs.map((pack) => pack.id));
  const prices = new Set(packs.map((pack) => pack.stripePriceId));
  if (ids.size !== packs.length || prices.size !== packs.length) {
    throw new Error("Credit pack IDs and Stripe price IDs must be unique");
  }
  return packs;
}

export function getCreditPackCatalog(): CreditPack[] {
  const raw = process.env.LIBREAD_CREDIT_PACK_CATALOG_JSON?.trim();
  if (!raw) {
    return validateCatalog(APPROVED_PRODUCTION_CREDIT_PACKS.map((pack) => ({ ...pack })));
  }

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
  return validateCatalog(packs as CreditPack[]);
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
    Boolean(getCreditTermsVersion()) &&
    isStripeConfigured() &&
    hasCompleteLegalSellerDetails() &&
    getCreditPackCatalog().length > 0
  );
}

export function getCreditTermsVersion(): string {
  return (
    process.env.LIBREAD_CREDIT_TERMS_VERSION?.trim() ||
    LIBREAD_DEFAULT_CREDIT_TERMS_VERSION
  );
}
