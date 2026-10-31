-- Issue #137: disposable LOCAL PostgREST ticket table / strict auth.sessions check.
-- Not a migration. NEVER run against hosted Supabase.
create table public.issue137_http_local_tickets (
 ticket uuid primary key,
 user_id uuid not null references auth.users(id),
 session_id uuid not null,
 series_id uuid not null references public.series(id),
 episode_id uuid not null references public.episodes(id),
 expected_sha256 text not null check(expected_sha256 ~ '^[a-f0-9]{64}$'),
 object_path text not null unique,
 state text not null default 'ISSUED'
   check(state in ('ISSUED','CLAIMED','SEALED_PRIVATE_SNAPSHOT','INTEGRITY_HOLD')),
 expires_at timestamptz not null,
 claimed_at timestamptz,
 sealed_at timestamptz,
 observed_sha256 text
);
alter table public.issue137_http_local_tickets enable row level security;
revoke all on public.issue137_http_local_tickets from public,anon,authenticated;
grant select,insert,update on public.issue137_http_local_tickets to service_role;

-- SECURITY DEFINER is LOCAL TEST ONLY. Explicitly revoke PUBLIC EXECUTE,
-- restrict by the genuine service_role request claim, use empty search_path.
create function public.issue137_http_local_session_live(
 p_user_id uuid,p_session_id uuid
) returns boolean language sql volatile security definer set search_path='' as $f$
 select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')='service_role'
 and exists(select 1 from auth.sessions s
            where s.id=p_session_id and s.user_id=p_user_id);
$f$;
revoke all on function public.issue137_http_local_session_live(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.issue137_http_local_session_live(uuid,uuid)
 to service_role;

-- A single DB-side UPDATE atomically claims the ticket only while its session
-- exists. Consent, work rights, and episode state are also rechecked inside
-- the same UPDATE, not solely against the earlier HTTP-level RLS read.
create function public.issue137_http_local_claim(
 p_ticket uuid,p_user_id uuid,p_session_id uuid
) returns boolean language plpgsql volatile security definer set search_path='' as $f$
declare claimed uuid;
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 then return false; end if;
 update public.issue137_http_local_tickets t
 set state='CLAIMED', claimed_at=clock_timestamp()
 from auth.sessions a, public.user_recording_consents c,
      public.series s, public.episodes e
 where t.ticket=p_ticket and t.user_id=p_user_id
   and t.session_id=p_session_id and t.state='ISSUED'
   and t.expires_at>clock_timestamp()
   and a.id=t.session_id and a.user_id=t.user_id
   and c.user_id=t.user_id and c.consent_key='recording_studio_global'
   and c.consent_version='2026-04-16'
   and s.id=t.series_id and s.publication_status='public'
   and s.recording_permission_mode='open'
   and s.content_rating<>'r18'
   and not('sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[])))
   and e.id=t.episode_id and e.series_id=s.id
   and e.posting_status='posted' and e.is_published is true
 returning t.ticket into claimed;
 return claimed is not null;
end $f$;
revoke all on function public.issue137_http_local_claim(uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.issue137_http_local_claim(uuid,uuid,uuid)
 to service_role;
notify pgrst,'reload schema';
