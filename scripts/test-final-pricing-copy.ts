import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { subscriptionDictionaries } from "../src/i18n/dictionaries/subscription";
import { billingPromptDictionaries } from "../src/i18n/dictionaries/billingPrompt";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function comparison(locale: "ja" | "en" | "ko", label: string) {
  const found = subscriptionDictionaries[locale].comparisons.find(
    (item) => item.label === label
  );
  assert.ok(found, `${locale}: missing subscription comparison: ${label}`);
  return found;
}

// Free is one shared 3-use allowance, not three separate 3/day buckets.
assert.match(comparison("ja", "AI物語生成").free, /共通で1日3回/u);
assert.match(comparison("ja", "公開作品の翻訳解放").free, /共通で1日3回/u);
assert.match(comparison("ja", "個人本棚への取り込み").free, /共通で1日3回/u);
assert.match(comparison("en", "AI story generation").free, /3\/day shared/i);
assert.match(comparison("en", "Public translation unlocks").free, /3\/day shared/i);
assert.match(comparison("en", "Library imports").free, /3\/day shared/i);
assert.match(comparison("ko", "AI 이야기 생성").free, /합산 하루 3회/u);
assert.match(comparison("ko", "공개 작품 번역 잠금 해제").free, /합산 하루 3회/u);
assert.match(comparison("ko", "개인 서재 가져오기").free, /합산 하루 3회/u);

// Premium canonical allowances and My Library capacity.
assert.equal(comparison("ja", "AI物語生成").subscriber, "1日10回まで");
assert.equal(comparison("ja", "公開作品の翻訳解放").subscriber, "1日30回まで");
assert.equal(comparison("ja", "個人本棚への取り込み").subscriber, "日次回数制限なし");
assert.equal(comparison("ja", "個人本棚・読書進捗").free, "最大3作品");
assert.equal(comparison("ja", "個人本棚・読書進捗").subscriber, "最大20作品");
assert.match(subscriptionDictionaries.en.heroDescription, /10 AI stories per day/i);
assert.match(subscriptionDictionaries.en.heroDescription, /30 public-translation unlocks per day/i);
assert.match(subscriptionDictionaries.en.heroDescription, /up to 20 library works/i);
assert.match(subscriptionDictionaries.ko.heroDescription, /AI 이야기 생성 하루 10회/u);
assert.match(subscriptionDictionaries.ko.heroDescription, /번역 잠금 해제 하루 30회/u);
assert.match(subscriptionDictionaries.ko.heroDescription, /최대 20작품/u);
assert.match(subscriptionDictionaries.ja.paid, /680/u);
assert.match(subscriptionDictionaries.en.paid, /680/u);
assert.match(subscriptionDictionaries.ko.paid, /680/u);

// Official accounts must not be described as a Stripe Premium subscription.
for (const locale of ["ja", "en", "ko"] as const) {
  assert.match(subscriptionDictionaries[locale].officialPlan.toLowerCase(), /運営|official|운영/u);
  assert.match(subscriptionDictionaries[locale].noStripeNeeded.toLowerCase(), /stripe/u);
}

// Old Premium sales claims must not return through generic upgrade prompts.
for (const locale of ["ja", "en", "ko"] as const) {
  const prompt = billingPromptDictionaries[locale].exhausted;
  assert.doesNotMatch(prompt, /単語解説|word.?explanation|단어 설명/ui);
  assert.doesNotMatch(prompt, /生成上限を増や|increases generation limits|생성 한도를 늘/ui);
  assert.match(prompt, /10/u);
  assert.match(prompt, /30/u);
}

const bilingualReaderSource = source("src/i18n/dictionaries/bilingualReader.ts");
assert.equal(bilingualReaderSource.includes("月額680円で無制限"), false);
assert.equal(bilingualReaderSource.includes("Unlimited with ¥680/month"), false);
assert.equal(bilingualReaderSource.includes("월 680엔 구독으로 무제한"), false);
assert.equal(bilingualReaderSource.includes("月額680円で生成上限を増やす"), false);
assert.equal(bilingualReaderSource.includes("Increase generation limits for ¥680/month"), false);
assert.equal(bilingualReaderSource.includes("월 680엔으로 생성 한도 늘리기"), false);

// Reader unlock copy: billing unit is unlock entitlement, while generation is only asset preparation.
const unlockGate = source("src/features/playback/PublicTranslationUnlockGate.tsx");
assert.match(unlockGate, /本日の利用枠を1回使って、この話の翻訳を解放/u);
assert.match(unlockGate, /included daily allowance/i);
assert.match(unlockGate, /포함된 일일 이용 한도/u);
assert.equal(unlockGate.includes("today's included translations"), false);
assert.match(unlockGate, /1クレジットでこの話の翻訳を解放/u);
assert.match(unlockGate, /Unlock this episode's translation for 1 credit/i);
assert.match(unlockGate, /1크레딧으로 이 화의 번역 잠금 해제/u);

// Credits: package prices, purchase-date expiry, reread, source-update persistence, and allowance-first ordering.
const creditsPage = source("src/app/credits/page.tsx");
for (const literal of ["5クレジット¥300", "8クレジット¥450", "12クレジット¥600", "購入日から150日"]) {
  assert.equal(creditsPage.includes(literal), true, `credits page missing ${literal}`);
}
assert.match(creditsPage, /150 days from the purchase date/i);
assert.match(creditsPage, /구매일로부터 150일/u);
assert.match(creditsPage, /再読で追加消費しません/u);
assert.match(creditsPage, /解放状態は維持されます/u);
assert.match(creditsPage, /購入クレジットより先に利用枠/u);

// Live EN/KO SEO facts are canonicalized after legacy-copy compatibility mapping.
const seo = source("src/lib/seo/currentSearchDiscovery.ts");
for (const literal of [
  "AI story generation, public-work translation unlocks, and My Library imports share 3 uses per day in total",
  "up to 30 public-work translation unlocks per day",
  "Free stores up to 3 works. Premium stores up to 20 works.",
  "Original reading does not require a translation unlock.",
  "공개 작품 번역 잠금 해제, 개인 서재 가져오기가 합산 하루 3회",
  "공개 작품 번역 잠금 해제 하루 최대 30회",
  "Free는 최대 3작품, Premium은 최대 20작품",
  "원문 읽기에는 번역 잠금 해제가 필요하지 않습니다.",
]) {
  assert.equal(seo.includes(literal), true, `SEO canonical fact missing: ${literal}`);
}

// Legal subscription description must match the current Production offering.
const terms = source("src/app/terms/page.tsx");
assert.match(terms, /AI物語生成を1日10回/u);
assert.match(terms, /公開作品の翻訳解放を1日30回/u);
assert.match(terms, /個人本棚への取り込みは日次回数制限なし/u);
assert.match(terms, /最大20作品/u);
for (const stale of ["対訳生成1日30回", "単語解説の日次回数制限なし", "次話1話の先読み"]) {
  assert.equal(terms.includes(stale), false, `terms still contains stale offering: ${stale}`);
}

// Translated-work CTA must describe entitlement acquisition, not translation generation.
const translatedWork = source("src/app/works/[seriesId]/translations/[targetLanguage]/page.tsx");
assert.match(translatedWork, /Readerで翻訳を解放/u);
assert.match(translatedWork, /Unlock translation in Reader/i);
assert.match(translatedWork, /Reader에서 번역 잠금 해제/u);

console.log("PASS: final pricing, credits, and public-translation wording are canonical across JA/EN/KO");
