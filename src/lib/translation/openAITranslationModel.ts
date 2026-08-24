export const DEFAULT_TRANSLATION_MODEL = "gpt-5.4-mini";

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

export function getDefaultTextTokenPricesUsd(
  model: string
): TextTokenPricesUsd {
  return (
    TEXT_TOKEN_PRICES_USD[model] ??
    TEXT_TOKEN_PRICES_USD["gpt-4.1-mini"]
  );
}

export function getTranslationReasoning(model: string):
  | { effort: "none" | "minimal" }
  | undefined {
  if (/^gpt-5\.(?:4|5|6)(?:-|$)/.test(model)) {
    return { effort: "none" };
  }

  if (model.startsWith("gpt-5")) {
    return { effort: "minimal" };
  }

  return undefined;
}
