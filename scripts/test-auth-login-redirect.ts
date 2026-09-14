import assert from "node:assert/strict";
import { buildCurrentLoginHref } from "../src/lib/auth/loginRedirect";

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

  console.log("PASS: header login preserves the current locale, reader mode and target language");
}

main();
