// Issue #137 1-2 — LOCAL evidence only. Requires `scripts/dev/local-supabase.sh start`.
// Applies policy-candidate.sql to the disposable local stack, then checks that
// only the official narration account's own JWT can write AI audio bytes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

// Keys come from the running local stack at run time (never hard-coded).
const statusOut = execFileSync(new URL("../dev/local-supabase.sh", import.meta.url).pathname, ["status"], { encoding: "utf8" });
const status = JSON.parse(statusOut.slice(statusOut.indexOf("{"), statusOut.lastIndexOf("}") + 1));
const API = status.API_URL;
const PUB = status.PUBLISHABLE_KEY;
const SEC = status.SECRET_KEY;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(API ?? "")) throw new Error(`refusing non-loopback API_URL: ${API}`);
if (!PUB || !SEC) throw new Error("local stack keys not available; run scripts/dev/local-supabase.sh start");
if (!process.env.DO_NOT_CONTACT_PRODUCTION) throw new Error("set DO_NOT_CONTACT_PRODUCTION=true");

const DB_CONTAINER = process.env.LOCAL_DB_CONTAINER ?? "supabase_db_libread-local-supabase";
const psql = (input) =>
  execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-q", "-t", "-A"], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const psqlFails = (input) => {
  try {
    psql(input);
    return false;
  } catch {
    return true;
  }
};
const sql = readFileSync(new URL("./policy-candidate.sql", import.meta.url), "utf8");

// F2: a pre-existing PUBLIC bucket with no limits must converge to private.
psql(`insert into storage.buckets (id, name, public) values ('ai-narration-private', 'ai-narration-private', true)
      on conflict (id) do update set public = true, file_size_limit = null, allowed_mime_types = null;`);
psql(sql);
assert.equal(
  psql("select public::text || '|' || file_size_limit || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'ai-narration-private';"),
  "false|104857600|audio/wav,audio/x-wav,application/json",
  "bucket converges to private settings even if it pre-existed as public"
);

const admin = createClient(API, SEC, { auth: { persistSession: false } });
const BUCKET = "ai-narration-private";
const wav = new Blob([new Uint8Array(64)], { type: "audio/wav" });
let pass = 0, denied = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass += 1; };
const deny = (res, msg) => { assert.ok(res.error, `expected denial: ${msg}`); denied += 1; };

async function userClient(email) {
  const password = `Local-${Math.random().toString(36).slice(2)}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error && !/already/i.test(created.error.message)) throw created.error;
  const c = createClient(API, PUB, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) {
    // reuse: reset password for an existing local user
    const list = await admin.auth.admin.listUsers();
    const u = list.data.users.find((x) => x.email === email);
    await admin.auth.admin.updateUserById(u.id, { password });
    const again = await c.auth.signInWithPassword({ email, password });
    if (again.error) throw again.error;
  }
  return c;
}

const official = await userClient("libread08@gmail.com"); // local stack only
const other = await userClient(`other-${Date.now()}@example.test`);
const officialId = (await official.auth.getUser()).data.user.id;
const otherId = (await other.auth.getUser()).data.user.id;
const uuidRe = /^[0-9a-f-]{36}$/;
assert.ok(uuidRe.test(officialId) && uuidRe.test(otherId), "local user ids resolved");
const enroll = (id) => psql(`insert into public.ai_narration_official_writers (user_id) values ('${id}') on conflict do nothing;`);
const unenroll = (id) => psql(`delete from public.ai_narration_official_writers where user_id = '${id}';`);
unenroll(officialId);
unenroll(otherId);
const anon = createClient(API, PUB, { auth: { persistSession: false } });
await admin.storage.createBucket("recording-audio", { public: true }).catch(() => {});

const stamp = Date.now();
const nemoPath = `nemo/series-${stamp}/ep-1/audio.wav`;

// 0. F1: the official email alone is not a writer — the uid must be enrolled.
let r = await official.storage.from(BUCKET).upload(`nemo/unenrolled-${stamp}.wav`, wav, { contentType: "audio/wav" });
deny(r, "official email but uid not enrolled (e.g. re-created account / reassigned email)");
enroll(officialId);

// 1. official account, own JWT, allowed prefixes
r = await official.storage.from(BUCKET).upload(nemoPath, wav, { contentType: "audio/wav" });
ok(!r.error, `official nemo upload: ${r.error?.message}`);
r = await official.storage.from(BUCKET).upload(`aivis/series-${stamp}/ep-1/timing.json`, new Blob(["{}"], { type: "application/json" }), { contentType: "application/json" });
ok(!r.error, `official aivis timing upload: ${r.error?.message}`);
const stored = await admin.storage.from(BUCKET).download(nemoPath);
ok(!stored.error && (await stored.data.arrayBuffer()).byteLength === 64, "bytes stored intact");

// 2. official account outside allowed prefixes / wrong mime / overwrite / delete
deny(await official.storage.from(BUCKET).upload(`human/${stamp}.wav`, wav, { contentType: "audio/wav" }), "official outside nemo/aivis");
deny(await official.storage.from(BUCKET).upload(`nemo/${stamp}-x.txt`, new Blob(["x"], { type: "text/plain" }), { contentType: "text/plain" }), "mime not allowed");
deny(await official.storage.from(BUCKET).upload(nemoPath, wav, { contentType: "audio/wav", upsert: true }), "official overwrite (upsert)");
await official.storage.from(BUCKET).remove([nemoPath]);
const still = await admin.storage.from(BUCKET).download(nemoPath);
ok(!still.error, "official remove has no effect (no delete policy)");

// 3. other users and anon
deny(await other.storage.from(BUCKET).upload(`nemo/other-${stamp}.wav`, wav, { contentType: "audio/wav" }), "other user upload");
deny(await anon.storage.from(BUCKET).upload(`nemo/anon-${stamp}.wav`, wav, { contentType: "audio/wav" }), "anon upload");
deny(await other.storage.from(BUCKET).download(nemoPath), "other user read");
deny(await anon.storage.from(BUCKET).download(nemoPath), "anon read");
deny(await official.storage.from(BUCKET).download(nemoPath), "official direct read (playback goes through server proxy)");

// 3b. F1: an enrolled uid WITHOUT the official email is still denied.
enroll(otherId);
deny(await other.storage.from(BUCKET).upload(`nemo/enrolled-other-${stamp}.wav`, wav, { contentType: "audio/wav" }), "enrolled uid without official email");
unenroll(otherId);

// 3c. F3: owner spoofing straight at the table (the Storage API always sets
// owner from the JWT, so test the policy itself). Positive control first: the
// same statement with the official's own owner_id succeeds, so the spoof
// failure below is caused by the owner_id condition and nothing else.
const asOfficialInsert = (ownerId, name) => `begin;
set local role authenticated;
select set_config('request.jwt.claims', '${JSON.stringify({ sub: officialId, role: "authenticated", email: "libread08@gmail.com" })}', true);
insert into storage.objects (bucket_id, name, owner_id) values ('ai-narration-private', '${name}', '${ownerId}');
rollback;`;
ok(!psqlFails(asOfficialInsert(officialId, `nemo/sql-own-${stamp}.wav`)), "positive control: SQL insert as official with own owner_id");
assert.ok(psqlFails(asOfficialInsert(otherId, `nemo/sql-spoof-${stamp}.wav`)), "expected denial: official JWT inserting with another user's owner_id");
denied += 1;

// 4. user JWTs cannot write the PUBLIC legacy bucket at all
deny(await official.storage.from("recording-audio").upload(`nemo/pub-${stamp}.wav`, wav, { contentType: "audio/wav" }), "official write to PUBLIC recording-audio");
deny(await other.storage.from("recording-audio").upload(`nemo/pub-${stamp}.wav`, wav, { contentType: "audio/wav" }), "other write to PUBLIC recording-audio");

console.log(`PASS: #137 1-2 LOCAL official-JWT private AI narration writer — ${pass} positive / ${denied} denied`);
