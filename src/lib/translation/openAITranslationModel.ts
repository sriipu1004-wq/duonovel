export const DEFAULT_TRANSLATION_MODEL = "gpt-5.4-mini";
export const DEFAULT_WORD_EXPLANATION_MODEL = "gpt-5.6-luna";

type TextTokenPricesUsd = {
  inputPer1mTokens: number;
  outputPer1mTokens: number;
};

const TEXT_TOKEN_PRICES_USD: Record<string, TextTokenPricesUsd> = {
  "gpt-4.1-mini": {
    inputPer1mTokens: 0.4,
    outputPer1mTokens: 1.6,
  },
  "gpt-5-mini": {
    inputPer1mTokens: 0.25,
    outputPer1mTokens: 2,
  },
  "gpt-5.4-mini": {
    inputPer1mTokens: 0.75,
    outputPer1mTokens: 4.5,
  },
  "gpt-5.6-luna": {
    inputPer1mTokens: 0.2,
    outputPer1mTokens: 1.2,
  },
  "gpt-5.6-terra": {
    inputPer1mTokens: 2,
    outputPer1mTokens: 12,
  },
};

// Unknown model names are estimated at the highest input and output prices in
// the table, so a cost estimate is never lower than any listed model.
const CONSERVATIVE_TEXT_TOKEN_PRICES_USD: TextTokenPricesUsd = {
  inputPer1mTokens: Math.max(
    ...Object.values(TEXT_TOKEN_PRICES_USD).map((p) => p.inputPer1mTokens)
  ),
  outputPer1mTokens: Math.max(
    ...Object.values(TEXT_TOKEN_PRICES_USD).map((p) => p.outputPer1mTokens)
  ),
};

export function getDefaultTextTokenPricesUsd(
  model: string
): TextTokenPricesUsd {
  const prices = Object.hasOwn(TEXT_TOKEN_PRICES_USD, model)
    ? TEXT_TOKEN_PRICES_USD[model]
    : CONSERVATIVE_TEXT_TOKEN_PRICES_USD;
  return { ...prices };
}

export function getTranslationReasoning(model: string):
  | { effort: "none" | "minimal" | "low" }
  | undefined {
  if (/^gpt-5\.4(?:-|$)/.test(model)) {
    return { effort: "low" };
  }

  if (/^gpt-5\.(?:5|6)(?:-|$)/.test(model)) {
    return { effort: "none" };
  }

  if (model.startsWith("gpt-5")) {
    return { effort: "minimal" };
  }

  return undefined;
}
