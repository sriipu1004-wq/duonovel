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
 const rawLanguage=i===1802 ? "en" : rawLanguages[i%rawLanguages.length];
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


// Child84e: strengthen the broad SQL eligibility model against complete
// *current JavaScript downstream* result/facet/sort/page semantics. This is
// NOT an executable SQL paginator or an end-to-end SQL equivalence proof.
type ExtendedFixture = Fixture & {
  createdAtValue: number;
  rating: "general" | "r18";
  viewCount: number;
  likeCount: number;
  bookmarkCount: number;
  narrationCount: number;
};
const extended: ExtendedFixture[] = input.map((work, i) => ({
  ...work,
  latestPostedAtValue: 100000 + Math.floor(i / 5), // deliberate ties
  createdAtValue: 90000 + Math.floor(i / 7),
  rating: i % 19 === 0 ? "r18" : "general",
  viewCount: (i % 17) * 10,
  likeCount: i % 7,
  bookmarkCount: i % 5,
  narrationCount: i % 11 === 0 ? i % 9 + 1 : 0,
}));
const canonical = extended.filter(w => w.pub && w.posted && w.sourceLanguage !== null);
const sqlBroad = extended.filter(w =>
  w.pub && w.posted && w.rawLanguage !== null &&
  languages.includes(w.rawLanguage.trim().toLowerCase())
);
assert.deepEqual(sqlBroad.map(w => w.id), canonical.map(w => w.id));
assert.ok(canonical.length > 1000);

type ExtendedCase = {
  q: string;
  langs: SupportedLanguageTag[];
  tags: string[];
  genres: string[];
  order: "popular" | "updated";
  shelf: "overall" | "narration";
  saved: string | null;
  signedIn: boolean;
  showR18: boolean;
  start: number;
  end: number;
};
const parityCases: ExtendedCase[] = [
  { q:"", langs:[], tags:[], genres:[], order:"popular", shelf:"overall", saved:null, signedIn:false, showR18:false, start:0, end:999999 },
  { q:"", langs:[], tags:[], genres:[], order:"updated", shelf:"overall", saved:null, signedIn:false, showR18:true, start:0, end:999999 },
  { q:"Detetive", langs:["en"], tags:[], genres:[], order:"popular", shelf:"overall", saved:null, signedIn:false, showR18:false, start:0, end:999999 },
  { q:"文鳥", langs:["ja","en"], tags:["adventure"], genres:[], order:"updated", shelf:"overall", saved:null, signedIn:true, showR18:true, start:100020, end:100300 },
  { q:"어린왕자", langs:["ko"], tags:[], genres:["literature"], order:"popular", shelf:"overall", saved:"followed-authors", signedIn:true, showR18:false, start:100000, end:100150 },
  { q:"Fantasy", langs:[], tags:["mystery"], genres:["fantasy"], order:"popular", shelf:"narration", saved:"liked-authors", signedIn:true, showR18:true, start:100000, end:100120 },
  { q:"", langs:["ja","en","ko"], tags:[], genres:[], order:"popular", shelf:"narration", saved:"liked-works", signedIn:true, showR18:false, start:100000, end:100340 },
  { q:"", langs:[], tags:[], genres:[], order:"updated", shelf:"narration", saved:"liked-readers", signedIn:true, showR18:true, start:100000, end:100340 },
  { q:"", langs:[], tags:[], genres:[], order:"popular", shelf:"overall", saved:"bookmarked-works", signedIn:true, showR18:false, start:0, end:999999 },
  { q:"", langs:["zh-Hans","zh-Hant","fr"], tags:[], genres:[], order:"popular", shelf:"overall", saved:null, signedIn:true, showR18:false, start:0, end:999999 },
  { q:"NoSuchWorkInFixture", langs:[], tags:[], genres:[], order:"updated", shelf:"overall", saved:null, signedIn:false, showR18:false, start:0, end:999999 },
  { q:"", langs:[], tags:[], genres:[], order:"popular", shelf:"overall", saved:"followed-authors", signedIn:false, showR18:false, start:0, end:999999 },
];

function compareSearchCandidate(works: ExtendedFixture[], c: ExtendedCase) {
  // Canonical public-card order supplies the final stable tie-break. A SQL
  // implementation would need to make that ordering fully deterministic.
  const base = works
    .filter(w => c.showR18 || w.rating !== "r18")
    .sort((a,b) =>
      b.latestPostedAtValue-a.latestPostedAtValue ||
      b.createdAtValue-a.createdAtValue ||
      a.id.localeCompare(b.id)
    );
  const savedAuthors = new Set(["author-1","author-5"]);
  const savedWorks = new Set(base.filter(w => Number(w.id)%13===0).map(w => w.id));
  // Current runtime does not load bookmarked-works in its viewer branch.
  if (c.saved === "bookmarked-works") savedWorks.clear();
  function eligible(w: ExtendedFixture, excluded?: "tag"|"genre") {
    return matchesPublicSearchConditions({
      work:w, matchScore:getPublicSearchMatchScore(c.q,w),
      selectedTagTokens:c.tags, selectedGenreTokens:c.genres,
      ignoredFacet:excluded, order:c.order,
      startAtValue:c.start, endAtValue:c.end,
      savedFilter:c.saved, savedFilterRequiresLogin:!c.signedIn,
      savedAuthorIds:savedAuthors, savedSeriesIds:savedWorks,
    });
  }
  function metrics(w: ExtendedFixture) {
    // Synthetic windowed popularity. Uses window for popular sort, while
    // updated sort retains all-time popularity data as the runtime does.
    const active = c.order === "updated" ||
      (w.latestPostedAtValue >= c.start && w.latestPostedAtValue <= c.end);
    return {
      score:active ? w.viewCount/100 + w.likeCount + w.bookmarkCount/3 : 0,
      views:active ? w.viewCount : 0,
      narration:active ? w.narrationCount : 0,
    };
  }
  function narrationOk(w: ExtendedFixture) {
    return c.shelf !== "narration" || metrics(w).narration>0;
  }
  function facets(items: ExtendedFixture[], key: "tags"|"genres") {
    const counts=new Map<string,number>();
    for(const w of items){
      const tokens=new Set(w[key].map(value =>
        key==="tags"
          ? value.trim().replace(/^#+/,"").toLowerCase()
          : value.trim().toLowerCase()
      ).filter(Boolean));
      for(const t of tokens) counts.set(t,(counts.get(t)??0)+1);
    }
    return [...counts.entries()].sort((a,b)=>a[0].localeCompare(b[0],"ja"));
  }
  const inLang=(w:ExtendedFixture)=>
    matchesPublicWorkLanguageFilters({work:w,sourceLanguages:c.langs});
  const qualified=base.filter(w=>inLang(w)&&eligible(w)&&narrationOk(w));
  const sorted=[...qualified].sort((a,b)=>{
    const am=metrics(a),bm=metrics(b);
    if(c.order==="updated")
      return b.latestPostedAtValue-a.latestPostedAtValue ||
        b.createdAtValue-a.createdAtValue;
    if(c.shelf==="narration" && bm.narration!==am.narration)
      return bm.narration-am.narration;
    if(c.shelf!=="narration" && bm.score!==am.score)
      return bm.score-am.score;
    return bm.views-am.views ||
      b.likeCount-a.likeCount ||
      b.bookmarkCount-a.bookmarkCount ||
      b.latestPostedAtValue-a.latestPostedAtValue;
  });
  if(c.q.length>0)sorted.sort((a,b)=>
    getPublicSearchMatchScore(c.q,b)-getPublicSearchMatchScore(c.q,a)
  );
  const tagCandidates=base.filter(w=>inLang(w)&&eligible(w,"tag")&&narrationOk(w));
  const genreCandidates=base.filter(w=>inLang(w)&&eligible(w,"genre")&&narrationOk(w));
  const languageCandidates=base.filter(w=>eligible(w)&&narrationOk(w));
  return {
    ids:sorted.map(w=>w.id),
    count:sorted.length,
    tagCounts:facets(tagCandidates,"tags"),
    genreCounts:facets(genreCandidates,"genres"),
    languageCounts:Object.fromEntries(PUBLIC_TEST_LANGUAGES.map(lang=>
      [lang,languageCandidates.filter(w=>w.sourceLanguage===lang).length])),
  };
}
const PUBLIC_TEST_LANGUAGES=Object.keys(LANGUAGE_REGISTRY) as SupportedLanguageTag[];
for (const caseData of parityCases) {
  const expected=compareSearchCandidate(canonical,caseData);
  const actual=compareSearchCandidate(sqlBroad,caseData);
  assert.deepEqual(actual,expected,JSON.stringify(caseData));
  const pages=Math.max(1,Math.ceil(expected.count/PUBLIC_SEARCH_PAGE_SIZE));
  for(const requested of [1,2,3,24,75,999]){
    const page=clampPublicSearchPage(requested,pages);
    const start=(page-1)*PUBLIC_SEARCH_PAGE_SIZE;
    assert.deepEqual(
      actual.ids.slice(start,start+PUBLIC_SEARCH_PAGE_SIZE),
      expected.ids.slice(start,start+PUBLIC_SEARCH_PAGE_SIZE),
      "page window mismatch"
    );
  }
}
const noFilter=parityCases[0];
const allResults=compareSearchCandidate(canonical,{...noFilter,showR18:true});
assert.ok(allResults.count>1000);
assert.ok(allResults.ids.slice(1000).length>0);
const narrowed=compareSearchCandidate(sqlBroad,{...noFilter,q:"Galactic detective end-of-corpus"});
assert.deepEqual(narrowed.ids,["1802"]);
console.log("PASS: Child84e broad-SQL-candidate vs downstream JS ordered IDs, totals, full facet counts, 24/page windows, scores, narrator, viewer/R18 and 1k+ boundary (synthetic only)");
