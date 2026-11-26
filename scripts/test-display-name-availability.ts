import assert from "node:assert/strict";
import { findDisplayNameConflict } from "../src/lib/auth/displayNameAvailability";

// Characterization test: pins current behavior only (LT-002). Mocked Supabase, synthetic names.

type Call = [string, ...unknown[]];
type Result = { data: unknown; error: { message: string } | null };
type Supabase = Parameters<typeof findDisplayNameConflict>[0]["supabase"];

function createSupabaseMock(result: Result) {
  const queries: Array<{ table: string; calls: Call[] }> = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      queries.push({ table, calls });
      const builder = {
        select: (...args: unknown[]) => (calls.push(["select", ...args]), builder),
        eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
        neq: (...args: unknown[]) => (calls.push(["neq", ...args]), builder),
        limit: (...args: unknown[]) => (calls.push(["limit", ...args]), builder),
        maybeSingle: () => (calls.push(["maybeSingle"]), Promise.resolve(result)),
      };
      return builder;
    },
  };
  return { client: client as unknown as Supabase, queries };
}

async function main() {
  // Blank names: no query.
  const idle = createSupabaseMock({ data: null, error: null });
  assert.equal(await findDisplayNameConflict({ supabase: idle.client, displayName: "  \n " }), null);
  assert.equal(idle.queries.length, 0);

  // Lookup key: whitespace collapsed, trimmed, lower-cased; excluded user id trimmed.
  const hit = createSupabaseMock({ data: { id: 42, display_name: "Reader One" }, error: null });
  assert.deepEqual(
    await findDisplayNameConflict({ supabase: hit.client, displayName: "  Reader \t One ", excludeUserId: " user-1 " }),
    { id: "42", display_name: "Reader One" }
  );
  assert.deepEqual(hit.queries, [
    {
      table: "users",
      calls: [
        ["select", "id, display_name"],
        ["eq", "display_name_key", "reader one"],
        ["neq", "id", "user-1"],
        ["limit", 1],
        ["maybeSingle"],
      ],
    },
  ]);

  // Without exclusion there is no neq; non-string display_name becomes null.
  const noExclude = createSupabaseMock({ data: { id: "u2", display_name: 5 }, error: null });
  assert.deepEqual(await findDisplayNameConflict({ supabase: noExclude.client, displayName: "Name", excludeUserId: "  " }), {
    id: "u2",
    display_name: null,
  });
  assert.equal(noExclude.queries[0]!.calls.some((call) => call[0] === "neq"), false);

  // No row / row without id: no conflict.
  assert.equal(await findDisplayNameConflict({ supabase: createSupabaseMock({ data: null, error: null }).client, displayName: "x" }), null);
  assert.equal(await findDisplayNameConflict({ supabase: createSupabaseMock({ data: { id: "" }, error: null }).client, displayName: "x" }), null);

  // Errors are thrown with the database message, or a fixed code when empty.
  await assert.rejects(
    findDisplayNameConflict({ supabase: createSupabaseMock({ data: null, error: { message: "denied" } }).client, displayName: "x" }),
    /^Error: denied$/
  );
  await assert.rejects(
    findDisplayNameConflict({ supabase: createSupabaseMock({ data: null, error: { message: "" } }).client, displayName: "x" }),
    /^Error: display_name_lookup_failed$/
  );

  console.log("PASS: display name conflict lookup (normalized key, exclusion, result mapping, errors)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
