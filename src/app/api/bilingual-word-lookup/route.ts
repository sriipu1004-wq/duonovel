import { lookUp } from "harurow-ejdict";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type DictionaryEntry = {
  word: string;
  description: string;
};

const ENGLISH_WORD_PATTERN = /^[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*$/;

const IRREGULAR_BASES: Record<string, string[]> = {
  ate: ["eat"],
  been: ["be"],
  began: ["begin"],
  begun: ["begin"],
  bought: ["buy"],
  brought: ["bring"],
  came: ["come"],
  did: ["do"],
  done: ["do"],
  drank: ["drink"],
  driven: ["drive"],
  drove: ["drive"],
  felt: ["feel"],
  found: ["find"],
  gave: ["give"],
  given: ["give"],
  gone: ["go"],
  got: ["get"],
  gotten: ["get"],
  had: ["have"],
  knew: ["know"],
  known: ["know"],
  made: ["make"],
  ran: ["run"],
  said: ["say"],
  saw: ["see"],
  seen: ["see"],
  spoke: ["speak"],
  spoken: ["speak"],
  took: ["take"],
  taken: ["take"],
  thought: ["think"],
  told: ["tell"],
  went: ["go"],
  were: ["be"],
  written: ["write"],
  wrote: ["write"],
};

function addCandidate(candidates: Set<string>, value: string) {
  if (value.length >= 2 && ENGLISH_WORD_PATTERN.test(value)) {
    candidates.add(value);
  }
}

function buildLookupCandidates(word: string): string[] {
  const normalized = word.toLowerCase().replaceAll("’", "'");
  const candidates = new Set<string>([normalized]);

  for (const base of IRREGULAR_BASES[normalized] ?? []) {
    addCandidate(candidates, base);
  }

  if (normalized.endsWith("'s")) {
    addCandidate(candidates, normalized.slice(0, -2));
  }
  if (normalized.endsWith("ies") && normalized.length > 4) {
    addCandidate(candidates, normalized.slice(0, -3) + "y");
  }
  if (normalized.endsWith("ves") && normalized.length > 4) {
    addCandidate(candidates, normalized.slice(0, -3) + "f");
    addCandidate(candidates, normalized.slice(0, -3) + "fe");
  }
  if (normalized.endsWith("es") && normalized.length > 4) {
    addCandidate(candidates, normalized.slice(0, -2));
    addCandidate(candidates, normalized.slice(0, -1));
  } else if (normalized.endsWith("s") && normalized.length > 3) {
    addCandidate(candidates, normalized.slice(0, -1));
  }
  if (normalized.endsWith("ied") && normalized.length > 4) {
    addCandidate(candidates, normalized.slice(0, -3) + "y");
  }
  if (normalized.endsWith("ed") && normalized.length > 4) {
    const withoutEd = normalized.slice(0, -2);
    addCandidate(candidates, withoutEd);
    addCandidate(candidates, normalized.slice(0, -1));
    if (withoutEd.at(-1) === withoutEd.at(-2)) {
      addCandidate(candidates, withoutEd.slice(0, -1));
    }
  }
  if (normalized.endsWith("ing") && normalized.length > 5) {
    const withoutIng = normalized.slice(0, -3);
    addCandidate(candidates, withoutIng);
    addCandidate(candidates, withoutIng + "e");
    if (withoutIng.at(-1) === withoutIng.at(-2)) {
      addCandidate(candidates, withoutIng.slice(0, -1));
    }
  }
  if (normalized.endsWith("ly") && normalized.length > 4) {
    addCandidate(candidates, normalized.slice(0, -2));
  }
  if (normalized.endsWith("est") && normalized.length > 5) {
    addCandidate(candidates, normalized.slice(0, -3));
    addCandidate(candidates, normalized.slice(0, -2));
  } else if (normalized.endsWith("er") && normalized.length > 4) {
    addCandidate(candidates, normalized.slice(0, -2));
    addCandidate(candidates, normalized.slice(0, -1));
  }

  return Array.from(candidates);
}

function findExactEntries(candidate: string): DictionaryEntry[] {
  return (lookUp(candidate, 24) as DictionaryEntry[]).filter(
    (entry) => entry.word.toLowerCase() === candidate
  );
}

function cleanMeaning(value: string): string {
  return value
    .replace(/《[^》]*》/g, "")
    .replace(/[『』‘’〈〉]/g, "")
    .replace(/\{[A-Za-z]+\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeanings(entries: DictionaryEntry[]): string[] {
  const meanings = new Set<string>();

  for (const entry of entries) {
    for (const part of entry.description.split(/\s+\/\s+/)) {
      const meaning = cleanMeaning(part);
      if (meaning) meanings.add(meaning);
      if (meanings.size >= 4) return Array.from(meanings);
    }
  }

  return Array.from(meanings);
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  const word = typeof payload.word === "string" ? payload.word.trim() : "";

  if (!word || word.length > 80 || !ENGLISH_WORD_PATTERN.test(word)) {
    return NextResponse.json(
      { ok: false, error: "invalid_word" },
      { status: 400 }
    );
  }

  for (const candidate of buildLookupCandidates(word)) {
    const entries = findExactEntries(candidate);
    if (entries.length === 0) continue;

    return NextResponse.json(
      {
        ok: true,
        word,
        headword: entries[0]?.word ?? candidate,
        meanings: extractMeanings(entries),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { ok: true, word, headword: null, meanings: [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
