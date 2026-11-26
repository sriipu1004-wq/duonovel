import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Issue #216 (KD-4) static scan core. Every `.from("<table>")` read of the
// tables that D030's RESTRICTIVE policies close for a restricted work
// (`episodes`, `recordings`, `episode_human_translations`) anywhere in src/
// is found and its receiver classified. The scan does not depend on how the
// client reached the file (factory import, helper such as requireLoggedInUser,
// parameter): every read must be explicitly allowlisted.

export const RESTRICTED_TABLES = ["episodes", "recordings", "episode_human_translations"] as const;
export type RestrictedTable = (typeof RESTRICTED_TABLES)[number];

export type Occurrence = { table: RestrictedTable; line: number; receiver: string; admin: boolean };

/**
 * kind:
 * - "admin": service-role read. Every occurrence must resolve to a service-role
 *   receiver, except `unresolvedAdmin` occurrences that were checked by hand
 *   (the reason says why the scanner cannot resolve them).
 * - "author": a session read on a path only the work's author can reach (the
 *   RESTRICTIVE policies keep the author exception), stated in the reason.
 * - "anon-supplemented": an anon public read whose restricted-work rows are
 *   added through the service role (restrictedWorkPublicReads.server.ts).
 * - "known-gap": a non-author viewer read that still fails closed for a
 *   restricted work; listed so it stays visible, not because it is correct.
 */
export type AllowEntry = {
  kind: "admin" | "author" | "anon-supplemented" | "known-gap";
  count: number;
  unresolvedAdmin?: number;
  reason: string;
};

export function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Text of the expression immediately before `.from(` (identifier, member or call). */
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

const ADMIN_TYPE = /AdminSupabase|ReturnType<typeof createAdmin\w*Client>/;
const ADMIN_CALL = /createAdmin\w*Client\(/;

/**
 * True when the receiver is a service-role client. An identifier is resolved
 * through its nearest declaration before the call (a lexical-scope
 * approximation): `const x = createAdminClient()`, `x ??= createAdminClient()`
 * or a parameter / property typed AdminSupabase. Anything else (session, anon,
 * unknown, destructured) is not admin.
 */
export function isAdminReceiver(code: string, receiver: string, callIndex: number): boolean {
  if (/(^|[^\w$])createAdmin\w*Client\(\)$/.test(receiver)) return true;
  const before = code.slice(0, callIndex);
  const call = /^(\w+)\(\)$/.exec(receiver);
  if (call) {
    const fn = new RegExp(`const\\s+${escapeRegExp(call[1])}\\s*=\\s*\\([^)]*\\)\\s*=>[^\\n]*createAdmin\\w*Client\\(\\)`);
    return fn.test(before);
  }
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
    new RegExp(`[(,{]\\s*${name}\\s*\\??:\\s*([^,)=;\\n]+)`, "g"),
  ];
  let last: { index: number; admin: boolean } | null = null;
  for (const [kind, pattern] of declarations.entries()) {
    for (const m of before.matchAll(pattern)) {
      let admin: boolean;
      if (kind === 0) admin = ADMIN_CALL.test(m[2] ?? "") || ADMIN_TYPE.test(m[1] ?? "");
      else if (kind === 1) admin = ADMIN_CALL.test(m[1] ?? "");
      else admin = ADMIN_TYPE.test(m[1] ?? "");
      if (!last || m.index! > last.index) last = { index: m.index!, admin };
    }
  }
  return last?.admin ?? false;
}

export function scanSource(source: string): Occurrence[] {
  const code = stripComments(source);
  const pattern = new RegExp(`\\.from\\(\\s*["'](${RESTRICTED_TABLES.join("|")})["']\\s*\\)`, "g");
  const out: Occurrence[] = [];
  for (const m of code.matchAll(pattern)) {
    const receiver = receiverBefore(code, m.index!);
    out.push({
      table: m[1] as RestrictedTable,
      line: code.slice(0, m.index!).split("\n").length,
      receiver,
      admin: isAdminReceiver(code, receiver, m.index!),
    });
  }
  return out;
}

/** file path (from src, forward slashes) -> occurrences */
export function scanTree(root: string): Map<string, Occurrence[]> {
  const found = new Map<string, Occurrence[]>();
  for (const file of walk(root)) {
    const occurrences = scanSource(readFileSync(file, "utf8"));
    if (occurrences.length > 0) found.set(relative(root, file).split(sep).join("/"), occurrences);
  }
  return found;
}

/** Problems for a scan result against an allowlist keyed "<file>::<table>". */
export function checkAllowlist(
  found: Map<string, Occurrence[]>,
  allowlist: Record<string, AllowEntry>
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [file, occurrences] of found) {
    for (const table of RESTRICTED_TABLES) {
      const list = occurrences.filter((o) => o.table === table);
      if (list.length === 0) continue;
      const key = `${file}::${table}`;
      seen.add(key);
      const allow = allowlist[key];
      const where = list.map((o) => `${o.line}(${o.receiver})`).join(", ");
      if (!allow) {
        problems.push(`not allowlisted: ${key} at ${where}`);
        continue;
      }
      if (!allow.reason.trim()) problems.push(`reason required: ${key}`);
      if (allow.count !== list.length) {
        problems.push(`count changed: ${key} allow=${allow.count} found=${list.length} at ${where}`);
        continue;
      }
      const unresolved = list.filter((o) => !o.admin).length;
      if (allow.kind === "admin" && unresolved !== (allow.unresolvedAdmin ?? 0)) {
        problems.push(
          `admin read not resolved to the service role: ${key} unresolved=${unresolved} allowed=${allow.unresolvedAdmin ?? 0} at ${where}`
        );
      }
      if (allow.kind !== "admin" && allow.unresolvedAdmin !== undefined) {
        problems.push(`unresolvedAdmin is only for admin entries: ${key}`);
      }
    }
  }
  for (const key of Object.keys(allowlist)) {
    if (!seen.has(key)) problems.push(`stale allowlist entry: ${key}`);
  }
  return problems;
}
