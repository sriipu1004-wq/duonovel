-- Issue #137 / PR #153: disposable LOCAL ONLY, NEVER a migration.
-- Used only by exclusive Docker PostgreSQL on isolated loopback.
-- Inert unless explicitly invoked by the local Human capability test harness.
-- No grants to anon/authenticated/service_role: the DB adapter is test-server
-- only and talks to postgres INSIDE the verified throwaway Docker container.
create table libread_internal.issue137_human_broker_grants (
  actor_id uuid primary key,
  recording_consent boolean not null default true,
  owner_allowed boolean not null default true,
  rights_allowed boolean not null default true
);
create table libread_internal.issue137_human_broker_permits (
  permit_id uuid primary key,
  token_sha256 text not null unique check(token_sha256 ~ '^[a-f0-9]{64}$'),
  actor_id uuid not null references libread_internal.issue137_human_broker_grants(actor_id),
  session_id uuid not null,
  object_id uuid not null unique,
  expected_sha256 text not null check(expected_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  unique(actor_id,session_id,object_id)
);
revoke all on libread_internal.issue137_human_broker_grants from PUBLIC,anon,authenticated,service_role;
revoke all on libread_internal.issue137_human_broker_permits from PUBLIC,anon,authenticated,service_role;
-- This SQL intentionally does NOT create an exposed RPC / SECURITY DEFINER
-- function or change existing Storage policies, auth.sessions or migrations.
-- Atomic capability issue:
-- INSERT ... SELECT WHERE a matching live auth.sessions row and live grant
-- exists, with expiry capped by a local-only server at 30 seconds.
-- Atomic one-use claim:
-- UPDATE ... SET claimed_at=clock_timestamp() WHERE claimed_at IS NULL
-- AND expires_at>clock_timestamp() AND same actor, same session, token hash,
-- byte digest, live auth.sessions and consent/ownership/rights.
-- The test uses real PostgreSQL concurrent UPDATE row locking.
