import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCurrentLoginHref } from "../src/lib/auth/loginRedirect";
import { normalizeNextPath } from "../src/lib/auth/accountSignupConsent";

function main() {
  assert.equal(
    buildCurrentLoginHref({ pathname: "/", search: "", locale: "ja" }),
    "/login"
  );
  assert.equal(
    buildCurrentLoginHref({
      pathname: "/en/read/work/2",
      search:
        "readingMode=translation&sourceLanguage=ja&targetLanguage=en&translationOnly=1",
      locale: "en",
    }),
    "/en/login?next=%2Fen%2Fread%2Fwork%2F2%3FreadingMode%3Dtranslation%26sourceLanguage%3Dja%26targetLanguage%3Den%26translationOnly%3D1"
  );
  assert.equal(
    buildCurrentLoginHref({
      pathname: "/ko/login",
      search: "next=%2Fko%2Fread%2Fwork%2F2",
      locale: "ko",
    }),
    "/ko/login"
  );

  assert.equal(normalizeNextPath("/en/read/work/2?x=1#here"), "/en/read/work/2?x=1#here");
  assert.equal(normalizeNextPath("https://evil.example/path", "/safe"), "/safe");
  assert.equal(normalizeNextPath("//evil.example/path", "/safe"), "/safe");
  assert.equal(normalizeNextPath("/\\evil.example/path", "/safe"), "/safe");
  assert.equal(normalizeNextPath("/\u0000evil", "/safe"), "/safe");

  const unlockGate = readFileSync(
    "src/features/playback/PublicTranslationUnlockGate.tsx",
    "utf8"
  );
  assert.equal(unlockGate.includes("useSyncExternalStore"), true);
  assert.equal(unlockGate.includes("getServerLocationSnapshot"), true);
  assert.equal(
    unlockGate.includes('typeof window === "undefined"'),
    false,
    "translation unlock login href must not diverge between SSR and hydration"
  );

  console.log("PASS: login redirects preserve Reader state and reject unsafe return paths");
}

main();
