import type { UiLocale } from "../config";

// Issue #142 PR2: shown when an account with a Google identity that has not
// finished STEP 2 (display name + 3 consents) tries to write. The text names
// the register page so a user who signed in with a password (and has a
// linked Google identity) knows where to go.

const ja = {
  registrationRequired: (registerPath: string) =>
    `登録が完了していない。${registerPath} で表示名を決めて3つの同意をしてから、もう一度試して。`,
  completeRegistration: "登録を完了する",
};

type RegistrationGateDictionary = typeof ja;

const en: RegistrationGateDictionary = {
  registrationRequired: (registerPath: string) =>
    `Your registration is not complete. Choose a username and give the three consents at ${registerPath}, then try again.`,
  completeRegistration: "Complete registration",
};

const ko: RegistrationGateDictionary = {
  registrationRequired: (registerPath: string) =>
    `가입이 완료되지 않았습니다. ${registerPath}에서 사용자 이름을 정하고 세 가지에 동의한 뒤 다시 시도해 주세요.`,
  completeRegistration: "가입 완료하기",
};

export const registrationGateDictionaries: Record<UiLocale, RegistrationGateDictionary> = {
  ja,
  en,
  ko,
};
export type { RegistrationGateDictionary };
