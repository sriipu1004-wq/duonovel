import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Issue #216 (KD-4) static guard. Per-country restricted works (D030) hide
// their `episodes`, `recordings` and `episode_human_translations` rows from
// every anon / non-author session through RESTRICTIVE RLS. A server-side read
// of these tables through the anon or session client therefore silently
// returns nothing for a restricted work, even in an allowed country
// (fail-closed, but a broken feature). This scan lists every such read in
// src/ and fails unless it is in the allowlist below with a reason and the
// exact number of reads, so a new one is reviewed before it lands.
//
// What counts as such a read: a `.from("<table>")` call in a file that imports
// the session client (`@/lib/supabase/server`) or the anon server client
// (`@/lib/supabase/serverPublic`), whose receiver is not a service-role
// client (resolved through its nearest declaration). Client components
// ("use client") are out of scope (they run in the browser under the
// viewer's own session). Limit: a file that receives a session client only as
// a parameter and imports neither factory is not seen by this scan.

const TABLES = ["episodes", "recordings", "episode_human_translations"] as const;
const ROOT = join(process.cwd(), "src");

type Allow = { count: number; reason: string };

// key: "<path from src, forward slashes>::<table>"
const ALLOWLIST: Record<string, Allow> = {
  "app/actions/saveOwnedEpisode.ts::episodes": {
    count: 4,
    reason:
      "Author-only Server Action: series ownership is verified first (author_id = auth user), and the RESTRICTIVE policy keeps the author exception, so the author's own restricted work is readable.",
  },
  "lib/publicWorks.ts::episodes": {
    count: 1,
    reason:
      "Anon read in the fallback used only when public_episode_work_summaries is missing; restricted works are added by fetchRestrictedPublicEpisodes (#216).",
  },
  "lib/publicWorks.ts::recordings": {
    count: 1,
    reason:
      "Anon public aggregate read kept by #137; restricted works are added by fetchRestrictedPublicRecordings (#216).",
  },
  "lib/recording/aivisGeneration.ts::episodes": {
    count: 1,
    reason:
      "Reads through the client its caller passes: aivis-generate passes the service role after regionBlockedApiResponse and loadRecordingTargetForViewer (#216); auto generation passes the service role.",
  },
  "lib/recording/nemoGeneration.ts::episodes": {
    count: 1,
    reason:
      "Reads through the client its caller passes: nemo-generate passes the service role after regionBlockedApiResponse and loadRecordingTargetForViewer (#216); auto generation passes the service role.",
  },
  "lib/translation/episodeTranslationServer.ts::episodes": {
    count: 1,
    reason:
      "False positive: `admin` is destructured from Promise.all([createClient(), createAdminClient()]), which the scanner does not resolve.",
  },
};

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Text of the expression immediately before `.from(` (identifier or call). */
export function receiverBefore(source: string, dotIndex: number): string {
  let i = dotIndex - 1;
  while (i >= 0 && /\s/.test(source[i])) i -= 1;
  const end = i + 1;
  if (source[i] === ")") {
    let depth = 0;
    for (; i >= 0; i -= 1) {
      if (source[i] === ")") depth += 1;
      else if (source[i] === "(") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i -= 1;
  }
  while (i >= 0 && /[\w$.]/.test(source[i])) i -= 1;
  return source.slice(i + 1, end).replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ADMIN_TYPE = /AdminSupabase|ReturnType<typeof createAdminClient>/;

/**
 * True when the receiver is a service-role client. An identifier is resolved
 * through its nearest declaration before the call (a lexical-scope
 * approximation): `const x = createAdminClient()`, `x ??= createAdminClient()`
 * or a parameter typed AdminSupabase. Anything else (session, anon, unknown
 * or a destructured parameter) is not admin, so it must be allowlisted.
 */
export function isAdminReceiver(code: string, receiver: string, callIndex: number): boolean {
  if (/(^|[^\w$])createAdminClient\(\)$/.test(receiver)) return true;
  const before = code.slice(0, callIndex);
  const call = /^(\w+)\(\)$/.exec(receiver);
  if (call) {
    const fn = new RegExp(`const\\s+${escapeRegExp(call[1])}\\s*=\\s*\\([^)]*\\)\\s*=>[^\\n]*createAdminClient\\(\\)`);
    return fn.test(before);
  }
  // `args.adminSupabase`: resolve the last member through a typed property
  // or parameter of the same name (e.g. `adminSupabase: AdminSupabase`).
  const member = /^[\w$]+(?:\.[\w$]+)+$/.test(receiver) ? receiver.split(".").pop()! : null;
  if (member) {
    const typed = new RegExp(`(?:^|[(,{;\\s])${escapeRegExp(member)}\\s*\\??:\\s*([^,)=;\\n]+)`, "g");
    let admin = false;
    for (const m of before.matchAll(typed)) admin = ADMIN_TYPE.test(m[1] ?? "");
    return admin;
  }
  if (!/^[\w$]+$/.test(receiver)) return false;
  const name = escapeRegExp(receiver);
  const declarations = [
    new RegExp(`\\b(?:const|let|var)\\s+${name}\\b\\s*(?::([^=;]+))?=\\s*([^;\\n]*)`, "g"),
    new RegExp(`\\b${name}\\s*\\?\\?=\\s*([^;\\n]*)`, "g"),
    new RegExp(`[(,]\\s*${name}\\s*:\\s*([^,)=\\n]+)`, "g"),
  ];
  let last: { index: number; admin: boolean } | null = null;
  for (const [kind, pattern] of declarations.entries()) {
    for (const m of before.matchAll(pattern)) {
      let admin: boolean;
      if (kind === 0) admin = /createAdminClient\(/.test(m[2] ?? "") || ADMIN_TYPE.test(m[1] ?? "");
      else if (kind === 1) admin = /createAdminClient\(/.test(m[1] ?? "");
      else admin = ADMIN_TYPE.test(m[1] ?? "");
      if (!last || m.index! > last.index) last = { index: m.index!, admin };
    }
  }
  return last?.admin ?? false;
}

export function scanSource(source: string): Map<string, number> {
  const counts = new Map<string, number>();
  const code = stripComments(source);
  if (/^\s*["']use client["']/.test(code)) return counts;
  const usesSessionOrAnon =
    /from\s+["']@\/lib\/supabase\/server["']/.test(code) ||
    /from\s+["']@\/lib\/supabase\/serverPublic["']/.test(code);
  if (!usesSessionOrAnon) return counts;
  const pattern = new RegExp(`\\.from\\(\\s*["'](${TABLES.join("|")})["']\\s*\\)`, "g");
  for (const m of code.matchAll(pattern)) {
    const receiver = receiverBefore(code, m.index!);
    if (isAdminReceiver(code, receiver, m.index!)) continue;
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return counts;
}

function main() {
  // Self-checks of the scanner on small fixtures.
  const fixture = `
    import { createClient } from "@/lib/supabase/server";
    import { createAdminClient } from "@/lib/supabase/admin";
    const admin = createAdminClient();
    const supabase = await createClient();
    await admin.from("episodes").select("*");
    await createAdminClient().from("recordings").select("*");
    await supabase
      .from("episodes")
      .select("*");
    // supabase.from("recordings") in a comment is ignored
    await (await createClient()).from("episode_human_translations").select("*");
  `;
  assert.deepEqual(
    Object.fromEntries(scanSource(fixture)),
    { episodes: 1, episode_human_translations: 1 },
    "scanner must count session reads and skip service-role reads"
  );
  assert.equal(scanSource(`"use client";\nimport { createClient } from "@/lib/supabase/server";\nsupabase.from("episodes")`).size, 0);
  assert.equal(scanSource(`import { createAdminClient } from "@/lib/supabase/admin";\nsupabase.from("episodes")`).size, 0);
  // Nearest declaration wins: an admin `supabase` in one function must not
  // hide a session `supabase` declared later in another.
  const scoped = `
    import { createClient } from "@/lib/supabase/server";
    import { createAdminClient } from "@/lib/supabase/admin";
    async function a() { const supabase = createAdminClient(); return supabase.from("episodes"); }
    async function b() { const supabase = await createClient(); return supabase.from("episodes"); }
    async function c(args: { adminSupabase: ReturnType<typeof createAdminClient> }) {
      return args.adminSupabase.from("recordings");
    }
    async function d(client: AdminSupabase) { return client.from("recordings"); }
    async function e(client: ServerSupabase) { return client.from("recordings"); }
  `;
  assert.deepEqual(Object.fromEntries(scanSource(scoped)), { episodes: 1, recordings: 1 });

  const found = new Map<string, number>();
  for (const file of walk(ROOT, [])) {
    const rel = relative(ROOT, file).split(sep).join("/");
    for (const [table, count] of scanSource(readFileSync(file, "utf8"))) {
      found.set(`${rel}::${table}`, count);
    }
  }

  const problems: string[] = [];
  for (const [key, count] of found) {
    const allow = ALLOWLIST[key];
    if (!allow) problems.push(`not allowlisted: ${key} (${count} read(s))`);
    else if (allow.count !== count) problems.push(`count changed: ${key} allow=${allow.count} found=${count}`);
  }
  for (const key of Object.keys(ALLOWLIST)) {
    if (!found.has(key)) problems.push(`stale allowlist entry: ${key}`);
  }
  for (const [key, allow] of Object.entries(ALLOWLIST)) {
    assert.ok(allow.reason.trim().length > 0, `reason required: ${key}`);
  }

  // The #216 targets must not read these tables through a session client.
  for (const fixed of [
    "app/record/create/[seriesId]/page.tsx",
    "app/api/recordings/human-upload-session/route.ts",
    "app/api/recordings/human-upload-finalize/route.ts",
    "app/api/recordings/human-publish/route.ts",
    "app/api/recordings/nemo-generate/route.ts",
    "app/api/recordings/aivis-generate/route.ts",
  ]) {
    for (const table of TABLES) {
      assert.equal(found.has(`${fixed}::${table}`), false, `${fixed} must not read ${table} via a session client`);
    }
  }

  assert.deepEqual(problems, [], problems.join("\n"));
  console.log(`PASS: restricted-table client scan (${found.size} allowlisted session/anon reads of ${TABLES.join(", ")})`);
}

main();
