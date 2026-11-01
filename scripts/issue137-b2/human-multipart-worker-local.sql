-- Issue #137 LOCAL-ONLY isolated Human multipart proof; NOT a migration.
-- Part size is 8MiB at the application layer; TUS transport uses 6MiB.
create table public.issue137_http_local_multipart_sessions(
 id uuid primary key,user_id uuid not null references auth.users(id),
 auth_session_id uuid not null,series_id uuid not null references public.series(id),
 episode_id uuid not null references public.episodes(id),
 total_bytes bigint not null check(total_bytes>=4194305 and total_bytes<=1073741824),
 part_count int not null check(part_count between 1 and 128),
 expires_at timestamptz not null,
 state text not null default 'OPEN' check(state in ('OPEN','SEALED_PARTS','HOLD'))
);
create table public.issue137_http_local_multipart_parts(
 id uuid primary key,
 multipart_id uuid not null references public.issue137_http_local_multipart_sessions(id),
 part_index int not null check(part_index between 0 and 127),
 byte_count int not null check(byte_count between 1 and 8388608),
 expected_sha256 text not null check(expected_sha256 ~ '^[0-9a-f]{64}$'),
 object_path text not null unique,
 state text not null default 'ISSUED'
   check(state in ('ISSUED','CLAIMED','SEALED','INTEGRITY_HOLD')),
 issued_at timestamptz not null default now(),
 sealed_at timestamptz,observed_sha256 text,
 unique(multipart_id,part_index)
);
alter table public.issue137_http_local_multipart_sessions enable row level security;
alter table public.issue137_http_local_multipart_parts enable row level security;
revoke all on public.issue137_http_local_multipart_sessions from public,anon,authenticated;
revoke all on public.issue137_http_local_multipart_parts from public,anon,authenticated;
grant select,insert,update on public.issue137_http_local_multipart_sessions to service_role;
grant select,insert,update on public.issue137_http_local_multipart_parts to service_role;

-- Atomic first-writer claim. A revoked session/consent/rights stops even
-- a previously allocated part. Independent of stale application reads.
create function public.issue137_http_local_multipart_claim(
 p_part uuid,p_user uuid,p_auth_session uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $f$
declare claimed uuid;
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
  nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 then return false; end if;
 update public.issue137_http_local_multipart_parts p
 set state='CLAIMED'
 from public.issue137_http_local_multipart_sessions m,
      auth.sessions a,public.user_recording_consents c,
      public.series s,public.episodes e
 where p.id=p_part and p.state='ISSUED'
 and m.id=p.multipart_id and m.state='OPEN'
 and m.expires_at>clock_timestamp()
 and m.user_id=p_user and m.auth_session_id=p_auth_session
 and a.id=m.auth_session_id and a.user_id=m.user_id
 and c.user_id=m.user_id and c.consent_key='recording_studio_global'
 and c.consent_version='2026-04-16'
 and s.id=m.series_id and s.publication_status='public'
 and s.recording_permission_mode='open' and s.content_rating<>'r18'
 and not('sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[])))
 and e.id=m.episode_id and e.series_id=s.id
 and e.posting_status='posted' and e.is_published=true
 returning p.id into claimed;
 return claimed is not null;
end $f$;
revoke all on function public.issue137_http_local_multipart_claim(uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.issue137_http_local_multipart_claim(uuid,uuid,uuid)
 to service_role;
notify pgrst,'reload schema';
