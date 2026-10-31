-- Issue #137 F2-P disposable Postgres recovery receipts. NOT A MIGRATION.
-- Only run inside the ephemeral exclusive loopback Docker database.
-- SECURITY: server-owned rows; no grants for anon, authenticated or service_role.
create table libread_internal.issue137_human_broker_receipts (
  permit_id uuid primary key references libread_internal.issue137_human_broker_permits(permit_id),
  state text not null default 'CLAIMED'
    check(state in ('CLAIMED','SEALED_PRIVATE_SNAPSHOT')),
  attempted boolean not null default false,
  version bigint not null default 0 check(version >= 0),
  verified_sha256 text check(verified_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz,
  check (
    (state='CLAIMED' and verified_sha256 is null and verified_at is null)
    or (state='SEALED_PRIVATE_SNAPSHOT' and attempted
      and verified_sha256 is not null and verified_at is not null)
  )
);
revoke all on libread_internal.issue137_human_broker_receipts
  from public,anon,authenticated,service_role;
-- The test adapter uses tightly scoped PostgreSQL transactions:
-- INSERT ... SELECT from a CLAIMED permit; no browser RPC / exposed function.
-- UPDATE with expected version, attempt flag and fresh unexpired claim
-- is durable before any Storage PUT. An interrupted attempt never repeats.
-- Final CAS is guarded by fresh auth.sessions and grant predicates,
-- expected digest, and the prior attempted/version state. The physical
-- bytes are verified OUTSIDE this DB and may change after the snapshot.
