-- Issue #137: LOCAL-ONLY real TUS stored-byte receipt / CAS proof.
-- NEVER add to a migration or apply to any hosted Supabase project.
-- The receipt is a durable PRIVATE-only checkpoint, not a publication grant.
-- Trusted throwaway PostgreSQL test adapter uses the server-local DB superuser;
-- NO user/browser/REST/RPC/service_role API grants are exposed.
create table libread_internal.issue137_tus_app_receipts (
 lease_id uuid primary key references libread_internal.issue137_tus_app_leases(lease_id),
 state text not null default 'STAGED'
  check (state in ('STAGED','VERIFYING','SEALED_PRIVATE_SNAPSHOT','HOLD')),
 attempted boolean not null default false,
 version bigint not null default 0 check(version>=0),
 expected_bytes bigint not null check(expected_bytes>0 and expected_bytes<=16777216),
 verified_bytes bigint,
 verified_sha256 text check(verified_sha256 ~ '^[a-f0-9]{64}$'),
 provider_object_id uuid,
 verified_at timestamptz,
 hold_reason text,
 constraint issue137_receipt_state_fields check (
 (state='STAGED' and not attempted and version=0
  and verified_sha256 is null and provider_object_id is null
  and verified_at is null and hold_reason is null)
 or (state='VERIFYING' and attempted and version>=1
  and verified_sha256 is null and provider_object_id is null
  and verified_at is null and hold_reason is null)
 or (state='SEALED_PRIVATE_SNAPSHOT' and attempted and version>=2
  and verified_sha256 is not null and provider_object_id is not null
  and verified_bytes=expected_bytes and verified_at is not null and hold_reason is null)
 or (state='HOLD' and attempted and version>=2
  and verified_sha256 is null and provider_object_id is null
  and verified_at is null and hold_reason is not null)
 )
);
revoke all on libread_internal.issue137_tus_app_receipts
 from public,anon,authenticated,service_role;
-- No policy can prevent a service_role/S3 writer from changing the object:
-- the test can only demonstrate a point-in-time snapshot and detect changes.
