import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261010230000_child84_scheduled_episode_db_release.sql","utf8");
const reader = readFileSync("src/lib/publicRead.ts", "utf8");
const catalog = readFileSync("src/lib/publicWorks.ts", "utf8");
const work = readFileSync("src/app/works/[seriesId]/page.tsx", "utf8");
const view = readFileSync("supabase/migrations/20261010013603_public_episode_work_summaries.sql","utf8");

for (const guard of [
  "create extension if not exists pg_cron",
  "'libread-scheduled-episode-release-v1'",
  "'* * * * *'",
  "e.posting_status = 'scheduled'",
  "e.is_published = false",
  "e.scheduled_for <= now()",
  "previous.posting_status <> 'posted'",
  "prior.episode_number < e.episode_number",
  "order by prior.episode_number desc, prior.id desc",
  "limit 1",
  "previous.is_published is distinct from true",
  "limit 200",
  "for update of e skip locked",
  "posted_at = coalesce(e.posted_at, e.scheduled_for)",
  "scheduled_for = null",
  "posting_status = 'posted'",
  "is_published = true",
  "returning e.id",
  "array_agg(id order by id)",
  "cardinality(episode_ids) = released_count",
  "having count(*) > 0",
  "enable row level security",
  "from public, anon, authenticated",
]) assert.ok(migration.includes(guard), guard);

assert.equal(/(alter|create) policy/i.test(migration), false,
  "Scheduled publication must not loosen existing RLS");
for (const source of [reader,work,catalog]) {
  assert.ok(source.includes('.eq("posting_status", "posted")'));
  assert.ok(source.includes('.eq("is_published", true)'));
}
assert.ok(view.includes("and e.posting_status = 'posted'"));
assert.ok(view.includes("and e.is_published = true"));

type Status = "draft" | "scheduled" | "posted";
type Row = {
  id: number; seriesId: number; number: number; status: Status;
  published: boolean; due: number | null; postedAt: number | null;
};
function releaseEligible(rows: Row[], now: number) {
  return rows.filter(r =>
    r.status === "scheduled" && r.published === false &&
    r.due !== null && r.due <= now &&
    (() => {
      const previous = rows
        .filter(p => p.seriesId === r.seriesId && p.number < r.number)
        .sort((a,b) => b.number-a.number || b.id-a.id)[0];
      return !previous || (previous.status === "posted" && previous.published === true);
    })()
  ).sort((a,b) => (a.due ?? 0)-(b.due ?? 0) || a.id-b.id).slice(0,200);
}
function runFixture(rows: Row[], now: number) {
  const due = releaseEligible(rows,now);
  const dueIds = new Set(due.map(r => r.id));
  return { count: dueIds.size, ids: [...dueIds].sort((a,b)=>a-b), after: rows.map(r => dueIds.has(r.id)
    ? {...r, status:"posted" as const, published:true,
      postedAt:r.postedAt ?? r.due, due:null}
    : r) };
}
const now=Date.parse("2026-10-10T13:00:00Z");
const before: Row[]=[
  {id:1,seriesId:10,number:1,status:"scheduled",published:false,due:now-1000,postedAt:null},
  {id:2,seriesId:10,number:2,status:"scheduled",published:false,due:now-1000,postedAt:null},
  {id:3,seriesId:11,number:1,status:"draft",published:false,due:null,postedAt:null},
  {id:4,seriesId:12,number:1,status:"scheduled",published:false,due:now+3600000,postedAt:null},
  {id:5,seriesId:13,number:1,status:"posted",published:true,due:null,postedAt:now-5000},
  {id:6,seriesId:14,number:1,status:"scheduled",published:false,due:now-1000,postedAt:null},
  {id:7,seriesId:14,number:2,status:"scheduled",published:false,due:now-1000,postedAt:null},
  {id:8,seriesId:15,number:1,status:"posted",published:true,due:null,postedAt:now-5000},
  {id:9,seriesId:15,number:2,status:"scheduled",published:false,due:now-1000,postedAt:null},
  {id:10,seriesId:16,number:1,status:"scheduled",published:false,due:now-1000,postedAt:null},
  {id:11,seriesId:16,number:2,status:"draft",published:false,due:null,postedAt:null},
  {id:12,seriesId:16,number:3,status:"scheduled",published:false,due:now-1000,postedAt:null},
  // A missing #2 is NOT permission to skip a draft #1.
  {id:13,seriesId:17,number:1,status:"draft",published:false,due:null,postedAt:null},
  {id:14,seriesId:17,number:3,status:"scheduled",published:false,due:now-1000,postedAt:null},
  // A gap is otherwise fine when the latest existing previous is published.
  {id:15,seriesId:18,number:1,status:"posted",published:true,due:null,postedAt:now-5000},
  {id:16,seriesId:18,number:3,status:"scheduled",published:false,due:now-1000,postedAt:null},
  // Match the author's latest-existing-previous check even with an older draft.
  {id:17,seriesId:19,number:1,status:"draft",published:false,due:null,postedAt:null},
  {id:18,seriesId:19,number:2,status:"posted",published:true,due:null,postedAt:now-5000},
  {id:19,seriesId:19,number:3,status:"scheduled",published:false,due:now-1000,postedAt:null},
];
const first=runFixture(before,now);
assert.deepEqual(first.ids,[1,6,9,10,16,19]);
assert.equal(first.count,6);
assert.equal(first.after.find(r=>r.id===14)?.status,"scheduled");
for(const r of first.after)if(first.ids.includes(r.id)){
  assert.equal(r.status,"posted");
  assert.equal(r.published,true);
  assert.equal(r.due,null);
  assert.ok(r.postedAt!==null);
}
const second=runFixture(first.after,now+60000);
assert.deepEqual(second.ids,[2,7]);
const third=runFixture(second.after,now+120000);
assert.deepEqual(third.ids,[]);
assert.equal(third.count,0);
assert.equal(third.after.find(r=>r.id===12)?.status,"scheduled");
assert.equal(third.after.find(r=>r.id===4)?.status,"scheduled");
assert.equal(third.after.find(r=>r.id===5)?.postedAt,now-5000);

const crowded=Array.from({length:250},(_,i):Row=>({
  id:i+1,seriesId:i+100,number:1,status:"scheduled",published:false,due:now-1000,postedAt:null,
}));
assert.equal(releaseEligible(crowded,now).length,200);
console.log("PASS: scheduled release contract: safe SQL gates, batch/audit counts, ordered transitions, no RLS widening");
console.log("NOTE: fixture and SQL source checks, NOT an applied pg_cron execution or live scheduled-fixture E2E");
