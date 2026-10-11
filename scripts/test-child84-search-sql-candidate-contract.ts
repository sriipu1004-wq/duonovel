import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGUAGE_REGISTRY, parseSupportedLanguageTag, type SupportedLanguageTag } from "../src/lib/translation/languageRegistry";
import { getPublicSearchMatchScore } from "../src/lib/search/publicSearchMatching";
import { matchesPublicSearchConditions } from "../src/lib/search/publicSearchConditions";
import { matchesPublicWorkLanguageFilters } from "../src/lib/search/publicWorkLanguageFilter";
import { PUBLIC_SEARCH_PAGE_SIZE, clampPublicSearchPage } from "../src/lib/search/publicSearchPagination";

const sql = readFileSync("scripts/child84-search-eligible-sql-parity.sql","utf8");
const nonComments = sql.replace(/^--.*$/gm, "").trim();
assert.ok(nonComments.startsWith("BEGIN READ ONLY;"));
assert.ok(nonComments.endsWith("COMMIT;"));
assert.equal(/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|CALL|EXECUTE)\b/i.test(nonComments),false);
for (const safety of [
  "publication_status = 'public'",
  "e.posting_status = 'posted'",
  "e.is_published = true",
  "v.episode_count > 0",
  "reference_missing_from_view",
  "unexpected_view_ids",
  "all_language_counts_equal",
]) assert.ok(sql.includes(safety),safety);
assert.equal(/\bLIMIT\s+\d+\b/i.test(nonComments),false,"Do not paginate SQL before matching and self-excluded facets");
const match = nonComments.match(/lower\(btrim\(s\.source_language\)\) IN\s*\(([^)]+)\)/);
assert.ok(match,"The SQL language eligibility predicate must be explicit");
const languages = Array.from(match[1].matchAll(/'([^']+)'/g), m=>m[1]).sort();
assert.deepEqual(languages,Object.keys(LANGUAGE_REGISTRY).map(l=>l.toLowerCase()).sort(),
  "SQL candidate languages must track the canonical source language registry");

type Fixture = {
 id: string;
 pub: boolean;
 posted: boolean;
 rawLanguage: string | null;
 authorId: string;
 title: string;
 originalTitle: string | null;
 summary: string;
 authorName: string;
 tags: string[];
 genres: string[];
 latestPostedAtValue: number;
 sourceLanguage: SupportedLanguageTag | null;
 seriesId: string;
};
const rawLanguages = ["ja","en","ko","fr","de","es","zh-Hans","zh-Hant","EN ","xx",null] as const;
const input: Fixture[] = Array.from({length:1803},(_,i)=>{
 const rawLanguage=rawLanguages[i%rawLanguages.length];
 return {
  id:String(i),seriesId:String(i),pub:i%31!==0,posted:i%29!==0,
  rawLanguage,sourceLanguage:parseSupportedLanguageTag(rawLanguage),
  authorId:"author-"+(i%11),
  title:i===1802?"Galactic detective end-of-corpus":i%3===0?"Detective Diary":i%3===1?"文鳥":"어린 왕자",
  originalTitle:null, summary:i%2===0?"Fantasy mystery":"A quiet portrait",
  authorName:"Author",tags:i%3===0?["#Mystery","#Classic"]:["#Adventure"],
  genres:i%4===0?["Fantasy","Mystery"]:["Literature"],
  latestPostedAtValue:100000+i,
 };
});

// Independent broad-candidate implementations: SQL's public + source +
// posted existence, and canonical card admission. No user IDs are revealed.
const dbEligible=input.filter(w=>
  w.pub && w.posted && w.rawLanguage!==null &&
  languages.includes(w.rawLanguage.trim().toLowerCase())
);
const cards=input.filter(w=>w.pub && w.posted && w.sourceLanguage!==null);
assert.deepEqual(dbEligible.map(w=>w.id),cards.map(w=>w.id));
assert.ok(cards.length>1000,"Fixture must cover PostgREST's default result cap");
const allLanguages = ["ja","en","ko","fr","zh-Hans"] as SupportedLanguageTag[];
const savedAuthorIds = new Set(["author-1","author-5"]);

function process(works: Fixture[], selection: SupportedLanguageTag[], query: string, ignoredFacet?: "tag"|"genre") {
 return works
  .filter(w=>matchesPublicWorkLanguageFilters({work:w,sourceLanguages:selection}))
  .filter(w=>matchesPublicSearchConditions({
    work:w,matchScore:getPublicSearchMatchScore(query,w),
    selectedTagTokens:["mystery"],selectedGenreTokens:["fantasy"],
    ignoredFacet,order:"updated",startAtValue:100200,endAtValue:101700,
    savedFilter:"followed-authors",savedFilterRequiresLogin:false,
    savedAuthorIds,savedSeriesIds:new Set<string>(),
  }))
  .sort((a,b)=>{
    const scoreDiff=getPublicSearchMatchScore(query,b)-getPublicSearchMatchScore(query,a);
    return scoreDiff || b.latestPostedAtValue-a.latestPostedAtValue;
  });
}
for (const langs of [[],["ja"],["ko"],["en","ja"],allLanguages] as SupportedLanguageTag[][]) {
 for (const query of ["","Detetive","文鳥","어린왕자","Fantasy"]) {
  for (const excluded of [undefined,"tag","genre"] as const) {
   const full=process(cards,langs,query,excluded);
   const candidate=process(dbEligible,langs,query,excluded);
   assert.deepEqual(candidate.map(w=>w.id),full.map(w=>w.id),
      "Broad SQL candidate must retain exact fuzzy/ranking/saved/facet set");
   const totalPages=Math.max(1,Math.ceil(full.length/PUBLIC_SEARCH_PAGE_SIZE));
   for(const requestPage of [1,2,3,55,999]){
     const page=clampPublicSearchPage(requestPage,totalPages);
     const start=(page-1)*PUBLIC_SEARCH_PAGE_SIZE;
     assert.deepEqual(candidate.slice(start,start+PUBLIC_SEARCH_PAGE_SIZE).map(w=>w.id),
                      full.slice(start,start+PUBLIC_SEARCH_PAGE_SIZE).map(w=>w.id));
   }
  }
 }
}
// Source-language facet needs the all-language corpus, not the currently
// selected language subset; no per-language SQL LIMIT may run first.
const languageCount=(works:Fixture[])=>Object.fromEntries(
 allLanguages.map(lang=>[lang,works.filter(w=>w.sourceLanguage===lang).length])
);
const facetFull=process(cards,[],"","tag");
const facetSelected=process(cards,["ja"],"","tag");
assert.notDeepEqual(languageCount(facetFull),languageCount(facetSelected),
  "Language facet must be computed independently of current language selection");
assert.deepEqual(languageCount(process(dbEligible,[],"","tag")),languageCount(facetFull));
const queryMatch=getPublicSearchMatchScore("Galactic detective end-of-corpus",input[1802]);
assert.equal(queryMatch,1000,"Exact last-page match must not be lost");
assert.equal(cards.some(w=>w.id==="1802"),true,"Last work must be eligible");
assert.equal(dbEligible.slice(0,1000).some(w=>w.id==="1802"),false,
  "Premature 1,000-row candidate cutoff demonstrably hides an exact match");
const runtime = readFileSync("src/app/search/SearchPageLegacy.tsx","utf8");
for (const required of [
 "getCachedPublicBaseWorkCards({",
 "matchesCurrentConditions(work, \"tag\")",
 "matchesCurrentConditions(work, \"genre\")",
 "const languageFacetWorks",
 "const totalResultCount = sortedWorks.length",
 "const paginatedWorks = sortedWorks.slice",
]) assert.ok(runtime.includes(required),required);
assert.equal(runtime.includes(".limit(24)"),false);
console.log("PASS: Child84 Search SQL broad-candidate boundary, eight canonical languages, >1k fuzzy/dated/saved/facet/page parity and no premature LIMIT");
